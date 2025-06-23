// API client for server communication
const API_BASE_URL = 'http://localhost:3000/api';

class TranslationAPI {
  async detectLanguage(text) {
    try {
      const response = await fetch(`${API_BASE_URL}/detect-language`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        throw new Error('Language detection failed');
      }

      const data = await response.json();
      return data.language;
    } catch (error) {
      console.error('Language detection error:', error);
      throw error;
    }
  }

  async translateText(text, targetLanguage, sourceLanguage = '') {
    try {
      const response = await fetch(`${API_BASE_URL}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          targetLanguage,
          sourceLanguage
        })
      });

      if (!response.ok) {
        throw new Error('Translation failed');
      }

      const data = await response.json();
      return data.translation;
    } catch (error) {
      console.error('Translation error:', error);
      throw error;
    }
  }


}

// Export as global variable for use in HTML
window.translationAPI = new TranslationAPI();