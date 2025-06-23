require('dotenv').config();

module.exports = {
  // Azure Translator Configuration
  translator: {
    key: process.env.AZURE_TRANSLATOR_KEY,
    endpoint: process.env.AZURE_TRANSLATOR_ENDPOINT || 'https://api.cognitive.microsofttranslator.com/',
    region: process.env.AZURE_TRANSLATOR_REGION || 'eastus'
  }
};