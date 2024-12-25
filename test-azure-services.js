require('dotenv').config();
const { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class AzureServiceTester {
    constructor() {
        this.translatorKey = process.env.AZURE_TRANSLATOR_KEY;
        this.translatorEndpoint = process.env.AZURE_TRANSLATOR_ENDPOINT;
        this.documentTranslatorEndpoint = 'https://api.cognitive.microsofttranslator.com/translator/text/batch/v1.0/';
        this.translatorRegion = process.env.AZURE_TRANSLATOR_REGION;
        this.storageConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        this.containerName = 'documents';

        // Parse storage account credentials
        const accountPattern = /AccountName=([^;]+)/;
        const keyPattern = /AccountKey=([^;]+)/;
        const accountMatch = this.storageConnectionString.match(accountPattern);
        const keyMatch = this.storageConnectionString.match(keyPattern);

        if (!accountMatch || !keyMatch) {
            throw new Error('Invalid storage connection string');
        }

        this.accountName = accountMatch[1];
        this.accountKey = keyMatch[1];
        this.sharedKeyCredential = new StorageSharedKeyCredential(this.accountName, this.accountKey);
    }

    async testAll() {
        console.log('Starting Azure services test...\n');

        try {
            // Test Translation Service
            await this.testTranslator();

            // Test Storage Service
            await this.testStorage();

            // Test Document Translation
            await this.testDocumentTranslation();

            console.log('\nAll tests completed successfully!');
        } catch (error) {
            console.error('\nTest suite failed:', error.message);
        }
    }

    async testTranslator() {
        console.log('Testing Azure Translator Service...');
        try {
            const response = await axios.get(
                'https://api.cognitive.microsofttranslator.com/languages?api-version=3.0',
                {
                    headers: {
                        'Ocp-Apim-Subscription-Key': this.translatorKey,
                        'Ocp-Apim-Subscription-Region': this.translatorRegion
                    }
                }
            );

            if (response.status === 200) {
                console.log('✅ Translator service is working properly');
                console.log('   - API endpoint is accessible');
                console.log('   - Authentication is successful');
                return true;
            }
        } catch (error) {
            console.error('❌ Translator service test failed:');
            console.error(`   - Error: ${error.message}`);
            if (error.response) {
                console.error(`   - Status: ${error.response.status}`);
                console.error(`   - Details: ${JSON.stringify(error.response.data)}`);
            }
            throw new Error('Translator service test failed');
        }
    }

    async testStorage() {
        console.log('\nTesting Azure Blob Storage Service...');
        try {
            // 1. Test connection
            console.log('1. Testing connection to storage account...');
            const blobServiceClient = BlobServiceClient.fromConnectionString(this.storageConnectionString);
            const accountInfo = await blobServiceClient.getAccountInfo();
            console.log('✅ Successfully connected to storage account');
            console.log(`   - Account kind: ${accountInfo.accountKind}`);
            console.log(`   - SKU name: ${accountInfo.skuName}`);

            // 2. Test container operations
            console.log('\n2. Testing container operations...');
            const containerClient = blobServiceClient.getContainerClient(this.containerName);
            const containerExists = await containerClient.exists();
            
            if (!containerExists) {
                console.log('   Creating test container...');
                await containerClient.create();
                console.log('✅ Container created successfully');
            } else {
                console.log('✅ Container already exists');
            }

            // 3. Test blob operations
            console.log('\n3. Testing blob operations...');
            const testBlobName = `test-${Date.now()}.txt`;
            const blockBlobClient = containerClient.getBlockBlobClient(testBlobName);
            
            // Upload test
            const testContent = 'This is a test file for Azure Storage';
            await blockBlobClient.upload(testContent, testContent.length);
            console.log('✅ Successfully uploaded test blob');

            // Download test
            const downloadResponse = await blockBlobClient.download(0);
            const downloadedContent = await streamToString(downloadResponse.readableStreamBody);
            console.log('✅ Successfully downloaded test blob');
            console.log(`   - Content verification: ${downloadedContent === testContent ? 'Passed' : 'Failed'}`);

            // List blobs test
            console.log('\n4. Testing blob listing...');
            let blobs = [];
            for await (const blob of containerClient.listBlobsFlat()) {
                blobs.push(blob.name);
            }
            console.log('✅ Successfully listed blobs');
            console.log(`   - Found ${blobs.length} blob(s) in container`);

            // Cleanup
            console.log('\n5. Cleaning up test resources...');
            await blockBlobClient.delete();
            console.log('✅ Successfully deleted test blob');

            return true;
        } catch (error) {
            console.error('❌ Storage service test failed:');
            console.error(`   - Error: ${error.message}`);
            if (error.code) {
                console.error(`   - Error code: ${error.code}`);
            }
            throw new Error('Storage service test failed');
        }
    }

    async testDocumentTranslation() {
        console.log('\nTesting Document Translation Service (using Text API)...');
        let testFileName = '';
        let blockBlobClient = null;
        let targetBlockBlobClient = null;

        try {
            // 1. Verify translator service access
            console.log('1. Verifying translator service access...');
            try {
                const response = await axios.get(
                    `${this.translatorEndpoint}languages?api-version=3.0`,
                    {
                        headers: {
                            'Ocp-Apim-Subscription-Key': this.translatorKey,
                            'Ocp-Apim-Subscription-Region': this.translatorRegion
                        }
                    }
                );
                console.log('✅ Translator service access verified');
            } catch (error) {
                throw new Error(`Translator service access failed: ${error.message}`);
            }

            // 2. Create test document
            console.log('\n2. Creating test document...');
            const testContent = 'This is a test document for translation. Hello World! This is a multi-line document.\nSecond line of text.\nThird line with special characters: áéíóú.';
            testFileName = `test-doc-${Date.now()}.txt`;
            fs.writeFileSync(testFileName, testContent);
            console.log('✅ Test document created');

            // 3. Upload to blob storage
            console.log('\n3. Uploading to blob storage...');
            const blobServiceClient = BlobServiceClient.fromConnectionString(this.storageConnectionString);
            const containerClient = blobServiceClient.getContainerClient(this.containerName);
            
            // Ensure container exists and is accessible
            const containerExists = await containerClient.exists();
            if (!containerExists) {
                console.log('Creating container...');
                await containerClient.create();
            }
            
            blockBlobClient = containerClient.getBlockBlobClient(testFileName);
            await blockBlobClient.uploadFile(testFileName);
            console.log('✅ Test document uploaded to blob storage');

            // 4. Read document content
            console.log('\n4. Reading document content...');
            const fileContent = fs.readFileSync(testFileName, 'utf8');
            const lines = fileContent.split('\n');
            console.log('Document content:', lines);

            // 5. Translate content using Text Translation API
            console.log('\n5. Translating document content...');
            const translatedLines = [];
            
            for (const line of lines) {
                if (line.trim()) {
                    const translationResponse = await axios.post(
                        `${this.translatorEndpoint}translate?api-version=3.0&from=en&to=es`,
                        [{ text: line }],
                        {
                            headers: {
                                'Ocp-Apim-Subscription-Key': this.translatorKey,
                                'Ocp-Apim-Subscription-Region': this.translatorRegion,
                                'Content-Type': 'application/json'
                            }
                        }
                    );

                    if (translationResponse.data && translationResponse.data[0] && translationResponse.data[0].translations) {
                        translatedLines.push(translationResponse.data[0].translations[0].text);
                    }
                } else {
                    translatedLines.push('');
                }
            }

            console.log('✅ Content translated successfully');
            console.log('\nTranslated content:');
            translatedLines.forEach((line, index) => {
                console.log(`Line ${index + 1}: ${line}`);
            });

            // 6. Save translated content
            const targetFileName = `translated-${testFileName}`;
            const translatedContent = translatedLines.join('\n');
            fs.writeFileSync(targetFileName, translatedContent);
            
            // Upload translated file to blob storage
            targetBlockBlobClient = containerClient.getBlockBlobClient(targetFileName);
            await targetBlockBlobClient.uploadFile(targetFileName);
            console.log('\n✅ Translated document saved and uploaded');

            return true;
        } catch (error) {
            console.error('❌ Document translation test failed:');
            console.error(`   - Error: ${error.message}`);
            if (error.response) {
                console.error(`   - Status: ${error.response.status}`);
                console.error(`   - Details:`, error.response.data);
                console.error(`   - Headers:`, error.response.headers);
            }
            throw error;
        } finally {
            // Cleanup
            console.log('\n7. Cleaning up test resources...');
            try {
                if (testFileName) {
                    if (fs.existsSync(testFileName)) {
                        fs.unlinkSync(testFileName);
                        console.log('✅ Source file deleted');
                    }
                    if (fs.existsSync(`translated-${testFileName}`)) {
                        fs.unlinkSync(`translated-${testFileName}`);
                        console.log('✅ Translated file deleted');
                    }
                }
                if (blockBlobClient) {
                    await blockBlobClient.delete();
                    console.log('✅ Source blob deleted');
                }
                if (targetBlockBlobClient) {
                    await targetBlockBlobClient.delete();
                    console.log('✅ Target blob deleted');
                }
            } catch (cleanupError) {
                console.error('Warning: Cleanup failed:', cleanupError.message);
            }
        }
    }

    async generateSasUrl(blockBlobClient) {
        const sasOptions = {
            containerName: this.containerName,
            blobName: blockBlobClient.name,
            permissions: BlobSASPermissions.parse("racw"),
            startsOn: new Date(),
            expiresOn: new Date(new Date().valueOf() + 60 * 60 * 1000), // 1 hour from now
        };

        const sasToken = generateBlobSASQueryParameters(
            sasOptions,
            this.sharedKeyCredential
        ).toString();

        return `${blockBlobClient.url}?${sasToken}`;
    }

    async downloadBlob(blockBlobClient) {
        const downloadResponse = await blockBlobClient.download(0);
        return await streamToString(downloadResponse.readableStreamBody);
    }
}

// Helper function to convert stream to string
async function streamToString(readableStream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        readableStream.on("data", (data) => {
            chunks.push(data.toString());
        });
        readableStream.on("end", () => {
            resolve(chunks.join(""));
        });
        readableStream.on("error", reject);
    });
}

// Run the tests
const tester = new AzureServiceTester();
tester.testAll().catch(console.error); 