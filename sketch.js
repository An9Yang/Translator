// Azure OpenAI configuration
const endpoint = 'https://aictopus-test.openai.azure.com/'; // Your Azure OpenAI endpoint, e.g., 'https://your-resource.openai.azure.com'
const apiVersion = '2023-05-15';
const deploymentName = 'gpt-4o-2'; // Your model deployment name
const apiKey = '34ce6e08f7eb4a529262830df9657c6a'; // Your Azure OpenAI API key

// Function to check if Azure credentials are configured
function isConfigured() {
    return endpoint && apiKey && deploymentName;
}

document.addEventListener('DOMContentLoaded', () => {
    const inputText = document.getElementById('myInput');
    const outputText = document.getElementById('myOutput');
    const translateBtn = document.getElementById('myButton');
    const improveBtn = document.getElementById('improveButton');
    const inputLang = document.getElementById('inputLanguage');
    const outputLang = document.getElementById('outputLanguage');
    const swapLangBtn = document.getElementById('swapLanguages');
    const clearInputBtn = document.getElementById('clearInput');
    const copyInputBtn = document.getElementById('copyInput');
    const copyOutputBtn = document.getElementById('copyOutput');

    // Check configuration on startup
    if (!isConfigured()) {
        outputText.textContent = 'Error: Azure OpenAI credentials not configured. Please add your endpoint, API key, and deployment name in sketch.js';
        translateBtn.disabled = true;
        return;
    }

    // Function to translate text using Azure OpenAI
    async function translateText(text, fromLang, toLang) {
        try {
            if (!text || text.trim().length === 0) {
                throw new Error('Please enter text to translate');
            }

            const response = await fetch(`${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': apiKey
                },
                body: JSON.stringify({
                    messages: [
                        {
                            role: "system",
                            content: `You are a professional translator. Translate the text from ${fromLang} to ${toLang}. Provide only the translation without any explanations or additional text.`
                        },
                        {
                            role: "user",
                            content: text
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 800,
                    top_p: 0.95,
                    frequency_penalty: 0,
                    presence_penalty: 0,
                    stop: null
                })
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error('Translation API Error:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorBody
                });
                throw new Error(`Translation failed: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            if (!result.choices?.[0]?.message?.content) {
                throw new Error('Invalid response format from Azure OpenAI service');
            }
            return result.choices[0].message.content.trim();
        } catch (error) {
            console.error('Translation error:', error);
            return `Error: ${error.message}`;
        }
    }

    // Function to improve text using Azure OpenAI
    async function improveText(text, lang) {
        try {
            if (!text || text.trim().length === 0) {
                throw new Error('No text to improve');
            }

            const response = await fetch(`${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': apiKey
                },
                body: JSON.stringify({
                    messages: [
                        {
                            role: "system",
                            content: `You are a professional writer and editor. Improve the following text in ${lang}, making it more fluent and natural while maintaining the same meaning. Provide only the improved text without any explanations.`
                        },
                        {
                            role: "user",
                            content: text
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 800,
                    top_p: 0.95,
                    frequency_penalty: 0.2,
                    presence_penalty: 0.1,
                    stop: null
                })
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error('Improvement API Error:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorBody
                });
                throw new Error(`Text improvement failed: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            if (!result.choices?.[0]?.message?.content) {
                throw new Error('Invalid response format from Azure OpenAI service');
            }
            return result.choices[0].message.content.trim();
        } catch (error) {
            console.error('Improvement error:', error);
            return `Error: ${error.message}`;
        }
    }

    // Event Listeners
    translateBtn.addEventListener('click', async () => {
        const text = inputText.value.trim();
        if (text) {
            translateBtn.disabled = true;
            translateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Translating...';
            outputText.textContent = 'Translating...';
            
            const fromLang = inputLang.value;
            const toLang = outputLang.value;
            
            const translatedText = await translateText(text, fromLang, toLang);
            outputText.textContent = translatedText;
            
            translateBtn.disabled = false;
            translateBtn.innerHTML = '<i class="fas fa-language"></i> Translate';
            improveBtn.disabled = !translatedText || translatedText.startsWith('Error:');
        }
    });

    improveBtn.addEventListener('click', async () => {
        const text = outputText.textContent.trim();
        if (text && !text.startsWith('Error:')) {
            improveBtn.disabled = true;
            improveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Improving...';
            document.getElementById('improveOutput').textContent = 'Improving...';
            
            const toLang = outputLang.value;
            const improvedText = await improveText(text, toLang);
            document.getElementById('improveOutput').textContent = improvedText;
            
            improveBtn.disabled = false;
            improveBtn.innerHTML = '<i class="fas fa-magic"></i> Improve Writing';
        }
    });

    // Swap languages
    swapLangBtn.addEventListener('click', () => {
        const tempLang = inputLang.value;
        inputLang.value = outputLang.value;
        outputLang.value = tempLang;

        const tempText = inputText.value;
        inputText.value = outputText.textContent;
        outputText.textContent = tempText;
    });

    // Clear input
    clearInputBtn.addEventListener('click', () => {
        inputText.value = '';
        outputText.textContent = '';
        document.getElementById('improveOutput').textContent = '';
        inputText.focus();
        improveBtn.disabled = true;
    });

    // Copy functions
    copyInputBtn.addEventListener('click', async () => {
        await navigator.clipboard.writeText(inputText.value);
        showCopyTooltip(copyInputBtn);
    });

    copyOutputBtn.addEventListener('click', async () => {
        await navigator.clipboard.writeText(outputText.textContent);
        showCopyTooltip(copyOutputBtn);
    });

    function showCopyTooltip(button) {
        const originalHTML = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => {
            button.innerHTML = originalHTML;
        }, 1500);
    }

    // Auto-resize textarea
    inputText.addEventListener('input', () => {
        inputText.style.height = 'auto';
        inputText.style.height = inputText.scrollHeight + 'px';
    });
});