require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob');
const path = require('path');

const app = express();

// Configure CORS
app.use(cors());
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

// Add rate limiting configuration
const MAX_REQUESTS_PER_MINUTE = 100;
let requestCount = 0;
let lastResetTime = Date.now();

// Rate limiting middleware
function rateLimiter(req, res, next) {
    const now = Date.now();
    if (now - lastResetTime > 60000) {
        requestCount = 0;
        lastResetTime = now;
    }

    if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
        return res.status(429).json({
            error: 'Too many requests',
            message: 'Please try again in a minute'
        });
    }

    requestCount++;
    next();
}

// Apply rate limiter to translation endpoints
app.use('/api/translate-document', rateLimiter);

// Parse storage account credentials
const accountPattern = /AccountName=([^;]+)/;
const keyPattern = /AccountKey=([^;]+)/;
const accountMatch = storageConnectionString.match(accountPattern);
const keyMatch = storageConnectionString.match(keyPattern);

if (!accountMatch || !keyMatch) {
    throw new Error('Invalid storage connection string');
}

const accountName = accountMatch[1];
const accountKey = keyMatch[1];
const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
const blobServiceClient = BlobServiceClient.fromConnectionString(storageConnectionString);
const containerName = 'documents';

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', services: {
        translator: true,
        storage: true
    }});
});

// Upload document endpoint
app.post('/api/upload-document', upload.single('document'), async (req, res) => {
    try {
        console.log('Upload request received');
        
        if (!req.file) {
            return res.status(400).json({ 
                success: false,
                error: 'No file uploaded',
                details: 'Please select a file to upload'
            });
        }

        // Ensure container exists
        const containerClient = blobServiceClient.getContainerClient(containerName);
        await containerClient.createIfNotExists();

        // Upload file to blob storage
        const blobName = `${Date.now()}-${req.file.originalname}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        
        await blockBlobClient.uploadData(req.file.buffer, {
            blobHTTPHeaders: {
                blobContentType: req.file.mimetype
            }
        });

        // Generate SAS URL
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

        console.log('Upload successful:', { blobName, sasUrl: sasUrl.substring(0, 50) + '...' });

        res.json({ 
            success: true,
            blobName,
            sasUrl,
            message: 'File uploaded successfully'
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Upload failed',
            details: error.message
        });
    }
});

// Translate document endpoint
app.post('/api/translate-document', async (req, res) => {
    try {
        // Debug logging
        console.log('Translation request received');
        console.log('Headers:', req.headers);
        console.log('Raw body:', req.body);

        if (!req.body || typeof req.body !== 'object') {
            console.error('Invalid request body type:', typeof req.body);
            return res.status(400).json({ 
                success: false,
                error: 'Invalid request body',
                details: 'Request body must be a JSON object'
            });
        }

        const { sourceLanguage, targetLanguage, documentUrl, blobName } = req.body;
        console.log('Extracted fields:', { sourceLanguage, targetLanguage, blobName, documentUrl: documentUrl ? documentUrl.substring(0, 50) + '...' : undefined });

        // Validate all required fields
        const missingFields = [];
        if (!sourceLanguage) missingFields.push('sourceLanguage');
        if (!targetLanguage) missingFields.push('targetLanguage');
        if (!documentUrl) missingFields.push('documentUrl');
        if (!blobName) missingFields.push('blobName');

        if (missingFields.length > 0) {
            console.error('Missing required fields:', missingFields);
            return res.status(400).json({ 
                success: false,
                error: 'Missing required fields',
                details: `The following fields are required: ${missingFields.join(', ')}`
            });
        }

        // Create target blob for translated document
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const targetBlobName = `translated-${blobName}`;
        const targetBlobClient = containerClient.getBlockBlobClient(targetBlobName);

        // Generate SAS token for target blob
        const targetSasToken = generateBlobSASQueryParameters(
            {
                containerName,
                blobName: targetBlobName,
                permissions: BlobSASPermissions.parse("racw"),
                startsOn: new Date(),
                expiresOn: new Date(new Date().valueOf() + 24 * 60 * 60 * 1000),
            },
            sharedKeyCredential
        ).toString();

        const targetSasUrl = `${targetBlobClient.url}?${targetSasToken}`;
        console.log('Generated target SAS URL');

        // Download source document content with error handling
        let sourceContent;
        try {
            console.log('Downloading source document...');
            const sourceResponse = await axios.get(documentUrl);
            sourceContent = sourceResponse.data;
            console.log('Source document downloaded, size:', sourceContent.length);
        } catch (error) {
            console.error('Error downloading source document:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to download source document',
                details: error.message
            });
        }

        // Split content into chunks to avoid rate limiting
        const lines = sourceContent.toString().split('\n');
        const translatedLines = [];
        const CHUNK_SIZE = 5; // Further reduced chunk size
        const DELAY_BETWEEN_CHUNKS = 3000; // Increased delay between chunks

        console.log(`Processing ${lines.length} lines in chunks of ${CHUNK_SIZE}`);

        for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
            const chunk = lines.slice(i, i + CHUNK_SIZE);
            const chunkPromises = chunk.map(async (line) => {
                if (!line.trim()) return '';

                try {
                    const translationResponse = await axios.post(
                        `${translatorEndpoint}translate?api-version=3.0&from=${sourceLanguage === 'auto' ? '' : sourceLanguage}&to=${targetLanguage}`,
                        [{ text: line }],
                        {
                            headers: {
                                'Ocp-Apim-Subscription-Key': translatorKey,
                                'Ocp-Apim-Subscription-Region': translatorRegion,
                                'Content-Type': 'application/json'
                            }
                        }
                    );

                    if (translationResponse.data && translationResponse.data[0] && translationResponse.data[0].translations) {
                        return translationResponse.data[0].translations[0].text;
                    }
                    return line; // Return original line if translation fails
                } catch (error) {
                    console.error('Translation error for line:', error.message);
                    if (error.response?.status === 429) {
                        // If rate limited, wait longer and retry once
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        try {
                            const retryResponse = await axios.post(
                                `${translatorEndpoint}translate?api-version=3.0&from=${sourceLanguage === 'auto' ? '' : sourceLanguage}&to=${targetLanguage}`,
                                [{ text: line }],
                                {
                                    headers: {
                                        'Ocp-Apim-Subscription-Key': translatorKey,
                                        'Ocp-Apim-Subscription-Region': translatorRegion,
                                        'Content-Type': 'application/json'
                                    }
                                }
                            );
                            if (retryResponse.data && retryResponse.data[0] && retryResponse.data[0].translations) {
                                return retryResponse.data[0].translations[0].text;
                            }
                        } catch (retryError) {
                            console.error('Retry failed:', retryError.message);
                        }
                    }
                    return line; // Return original line on error
                }
            });

            // Process chunk with error handling
            try {
                const translatedChunk = await Promise.all(chunkPromises);
                translatedLines.push(...translatedChunk);
                console.log(`Processed chunk ${i / CHUNK_SIZE + 1}/${Math.ceil(lines.length / CHUNK_SIZE)}`);

                // Add delay between chunks to avoid rate limiting
                if (i + CHUNK_SIZE < lines.length) {
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CHUNKS));
                }
            } catch (error) {
                console.error('Chunk processing error:', error);
                // Continue with next chunk even if current chunk fails
            }
        }

        // Upload translated content
        const translatedContent = translatedLines.join('\n');
        try {
            await targetBlobClient.upload(translatedContent, translatedContent.length);
            console.log('Translated content uploaded successfully');
        } catch (error) {
            console.error('Error uploading translated content:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to upload translated content',
                details: error.message
            });
        }

        console.log('Translation completed successfully');
        res.json({
            success: true,
            status: 'Succeeded',
            targetBlobName: targetBlobName,
            message: 'Document translation completed'
        });

    } catch (error) {
        console.error('Translation error:', error);
        const statusCode = error.response?.status === 429 ? 429 : 500;
        res.status(statusCode).json({
            success: false,
            error: 'Translation failed',
            details: error.message,
            apiError: error.response?.data
        });
    }
});

// Get translation status endpoint
app.get('/api/translation-status/:blobName', async (req, res) => {
    try {
        const { blobName } = req.params;
        if (!blobName) {
            return res.status(400).json({
                success: false,
                error: 'Blob name is required',
                details: 'No blob name provided in the request'
            });
        }

        console.log('Checking translation status for blob:', blobName);
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        const exists = await blockBlobClient.exists();
        if (!exists) {
            return res.status(404).json({
                success: false,
                error: 'Translated document not found',
                details: `Blob ${blobName} does not exist`
            });
        }

        // Generate SAS URL for download
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

        const downloadUrl = `${blockBlobClient.url}?${sasToken}`;
        console.log('Generated download URL for blob:', blobName);

        res.json({
            success: true,
            status: 'Succeeded',
            downloadUrl,
            message: 'Translation completed'
        });

    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({
            success: false,
            error: 'Status check failed',
            details: error.message
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Available endpoints:');
    console.log('- GET  /health');
    console.log('- POST /api/upload-document');
    console.log('- POST /api/translate-document');
    console.log('- GET  /api/translation-status/:blobName');
}); 