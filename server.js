require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob');
const axios = require('axios');
const path = require('path');

const app = express();

// Configure CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.static('./'));

// Configure multer for file upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Azure configuration
const translatorKey = process.env.AZURE_TRANSLATOR_KEY;
const translatorEndpoint = process.env.AZURE_TRANSLATOR_ENDPOINT;
const translatorRegion = process.env.AZURE_TRANSLATOR_REGION;
const storageConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

// Parse storage account name and key from connection string
const accountPattern = /AccountName=([^;]+)/;
const keyPattern = /AccountKey=([^;]+)/;
const accountMatch = storageConnectionString.match(accountPattern);
const keyMatch = storageConnectionString.match(keyPattern);

if (!accountMatch || !keyMatch) {
    throw new Error('Invalid storage connection string');
}

const accountName = accountMatch[1];
const accountKey = keyMatch[1];

// Create SharedKeyCredential
const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

// Initialize Azure Blob Storage client
const blobServiceClient = BlobServiceClient.fromConnectionString(storageConnectionString);
const containerName = 'documents';

// Ensure container exists
async function ensureContainer() {
    try {
        const containerClient = blobServiceClient.getContainerClient(containerName);
        await containerClient.createIfNotExists({
            access: 'blob'  // Enable public access at container level
        });
        return containerClient;
    } catch (error) {
        console.error('Container creation error:', error);
        throw error;
    }
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Upload document to Azure Blob Storage
app.post('/api/upload-document', upload.single('document'), async (req, res) => {
    try {
        console.log('1. Upload request received');
        
        if (!req.file) {
            console.log('Error: No file in request');
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log('2. File details:', {
            originalname: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype
        });

        // Test storage access
        console.log('3. Testing storage access...');
        const containerClient = await ensureContainer();
        console.log('4. Container access successful');
        
        const blobName = `${Date.now()}-${req.file.originalname}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        console.log('5. Blob client created');

        console.log('6. Starting blob upload...');
        await blockBlobClient.uploadData(req.file.buffer, {
            blobHTTPHeaders: {
                blobContentType: req.file.mimetype
            }
        });
        console.log('7. Blob upload successful');

        // Generate SAS URL
        console.log('8. Generating SAS token...');
        const sasToken = generateBlobSASQueryParameters(
            {
                containerName,
                blobName,
                permissions: BlobSASPermissions.parse("r"),
                startsOn: new Date(),
                expiresOn: new Date(new Date().valueOf() + 24 * 60 * 60 * 1000),
            },
            sharedKeyCredential
        ).toString();

        const sasUrl = `${blockBlobClient.url}?${sasToken}`;
        console.log('9. SAS URL generated:', sasUrl.substring(0, 100) + '...');

        // Test blob access
        console.log('10. Testing blob access...');
        try {
            const testAccess = await axios.head(sasUrl);
            console.log('11. Blob is accessible:', testAccess.status);
        } catch (error) {
            console.error('Blob access test failed:', error.message);
            throw new Error('Generated blob URL is not accessible');
        }

        res.json({ sasUrl });
    } catch (error) {
        console.error('Upload error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        res.status(500).json({ 
            error: 'Upload failed',
            details: error.message
        });
    }
});

// Start document translation
app.post('/api/translate-document', async (req, res) => {
    try {
        const { sourceLanguage, targetLanguage, documentUrl } = req.body;
        console.log('Translation request:', {
            sourceLanguage,
            targetLanguage,
            documentUrl: documentUrl ? documentUrl.substring(0, 100) + '...' : null
        });

        if (!documentUrl) {
            throw new Error('Document URL is missing');
        }

        // Create container for translated documents
        const containerClient = await ensureContainer();
        const targetBlobName = `translated-${Date.now()}-${path.basename(documentUrl.split('?')[0])}`;
        const targetBlobClient = containerClient.getBlockBlobClient(targetBlobName);

        // Generate SAS token for target blob
        const targetSasToken = generateBlobSASQueryParameters(
            {
                containerName,
                blobName: targetBlobName,
                permissions: BlobSASPermissions.parse("rwc"),
                startsOn: new Date(),
                expiresOn: new Date(new Date().valueOf() + 24 * 60 * 60 * 1000),
            },
            sharedKeyCredential
        ).toString();

        const targetSasUrl = `${targetBlobClient.url}?${targetSasToken}`;

        console.log('Sending request to Translator API...');
        const response = await axios.post(
            `${translatorEndpoint}batches`,
            {
                inputs: [
                    {
                        source: {
                            sourceUrl: documentUrl,
                            storageSource: 'AzureBlob',
                            language: sourceLanguage === 'auto' ? null : sourceLanguage
                        },
                        targets: [
                            {
                                targetUrl: targetSasUrl,
                                storageSource: 'AzureBlob',
                                language: targetLanguage
                            }
                        ]
                    }
                ]
            },
            {
                headers: {
                    'Ocp-Apim-Subscription-Key': translatorKey,
                    'Ocp-Apim-Subscription-Region': translatorRegion,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('Translator API response:', {
            status: response.status,
            headers: response.headers,
            data: response.data
        });

        // The operation-location header contains the URL to check the status
        const operationLocation = response.headers['operation-location'];
        if (!operationLocation) {
            throw new Error('No operation location received from translation service');
        }

        res.json({ 
            operationId: operationLocation,  // Send the full operation URL
            status: 'Accepted',
            message: 'Translation job started successfully'
        });
    } catch (error) {
        console.error('Translation error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });
        res.status(500).json({ 
            error: 'Translation failed',
            details: error.message,
            apiError: error.response?.data
        });
    }
});

// Check translation status
app.get('/api/translation-status/:operationId(*)', async (req, res) => {
    try {
        const operationLocation = req.params.operationId;
        console.log('Checking status for operation:', operationLocation);

        // Use the operation URL directly from Azure
        const response = await axios.get(
            operationLocation,
            {
                headers: {
                    'Ocp-Apim-Subscription-Key': translatorKey,
                    'Ocp-Apim-Subscription-Region': translatorRegion,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('Status check response:', response.data);
        res.json(response.data);
    } catch (error) {
        console.error('Status check error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            url: error.config?.url
        });
        res.status(500).json({ 
            error: 'Status check failed',
            details: error.message,
            apiError: error.response?.data
        });
    }
});

// Test Translator service access
async function testTranslatorAccess() {
    try {
        const response = await axios.get(
            `${translatorEndpoint}languages`,
            {
                headers: {
                    'Ocp-Apim-Subscription-Key': translatorKey,
                    'Ocp-Apim-Subscription-Region': translatorRegion
                }
            }
        );
        console.log('Translator service test successful:', response.status);
        return true;
    } catch (error) {
        console.error('Translator service test failed:', {
            status: error.response?.status,
            message: error.message,
            data: error.response?.data
        });
        return false;
    }
}

// Call this when server starts
testTranslatorAccess().then(isAvailable => {
    if (isAvailable) {
        console.log('Translator service is accessible');
    } else {
        console.log('WARNING: Translator service is not accessible');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
}); 