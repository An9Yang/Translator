require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import utilities
const config = require('../config/azure.config');
const azureTranslator = require('./utils/azure-translator');

const app = express();

// Configure CORS
app.use(cors());
app.use(express.json());

// Serve static files from root directory
app.use(express.static(path.join(__dirname, '../../')));


// Rate limiting configuration
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

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        services: {
            translator: !!config.translator.key
        }
    });
});

// Language detection endpoint
app.post('/api/detect-language', rateLimiter, async (req, res) => {
    try {
        const { text } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }

        const language = await azureTranslator.detectLanguage(text);
        res.json({ language });
    } catch (error) {
        console.error('Language detection error:', error);
        res.status(500).json({ 
            error: 'Language detection failed',
            details: error.message 
        });
    }
});

// Text translation endpoint
app.post('/api/translate', rateLimiter, async (req, res) => {
    try {
        const { text, targetLanguage, sourceLanguage } = req.body;
        
        if (!text || !targetLanguage) {
            return res.status(400).json({ 
                error: 'Text and target language are required' 
            });
        }

        const result = await azureTranslator.translateText(text, targetLanguage, sourceLanguage);
        res.json({ 
            translation: result.translations[0].text,
            detectedLanguage: result.detectedLanguage 
        });
    } catch (error) {
        console.error('Translation error:', error);
        res.status(500).json({ 
            error: 'Translation failed',
            details: error.message 
        });
    }
});






const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Translation server running!`);
    console.log(`📱 Local:    http://localhost:${PORT}`);
    console.log(`🌐 Network:  http://127.0.0.1:${PORT}`);
    console.log(`⚡ Ready for translations!`);
});
