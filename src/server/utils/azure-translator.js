const axios = require('axios');
const config = require('../../config/azure.config');

class AzureTranslator {
  constructor() {
    this.endpoint = config.translator.endpoint;
    this.key = config.translator.key;
    this.region = config.translator.region;
  }

  async translateText(text, targetLanguage, sourceLanguage = '') {
    const params = {
      'api-version': '3.0',
      'to': targetLanguage
    };
    
    if (sourceLanguage) {
      params.from = sourceLanguage;
    }

    try {
      const response = await axios.post(
        `${this.endpoint}translate`,
        [{ text }],
        {
          params,
          headers: {
            'Ocp-Apim-Subscription-Key': this.key,
            'Ocp-Apim-Subscription-Region': this.region,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data[0];
    } catch (error) {
      console.error('Translation error:', error.response?.data || error.message);
      throw new Error(`Translation failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async detectLanguage(text) {
    try {
      const response = await axios.post(
        `${this.endpoint}detect?api-version=3.0`,
        [{ text }],
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.key,
            'Ocp-Apim-Subscription-Region': this.region,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data[0].language;
    } catch (error) {
      console.error('Language detection error:', error.response?.data || error.message);
      throw new Error(`Language detection failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }
}

module.exports = new AzureTranslator();