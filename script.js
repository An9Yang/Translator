// Azure OpenAI configuration
const endpoint = 'https://aictopus-test.openai.azure.com/';
const apiVersion = '2023-05-15';
const deploymentName = 'gpt-4o-2';
const apiKey = '34ce6e08f7eb4a529262830df9657c6a';

// DOM Elements
const inputText = document.querySelector('.input-area textarea');
const outputText = document.querySelector('.translation-output');
const translateBtn = document.querySelector('.primary-btn');
const improveBtn = document.querySelector('.secondary-btn');
const sourceLanguageSelect = document.querySelector('.language-select');
const targetLanguageSelect = document.querySelectorAll('.language-select')[1];
const swapBtn = document.querySelector('.swap-btn');
const clearBtn = document.querySelector('[title="Clear text"]');
const pasteBtn = document.querySelector('[title="Paste text"]');
const copyTranslationBtn = document.querySelector('[title="Copy translation"]');
const saveTranslationBtn = document.querySelector('[title="Save translation"]');
const inputSpeakBtn = document.querySelector('.input-area [title="Read aloud"]');
const outputSpeakBtn = document.querySelector('.output-area [title="Read aloud"]');
const modeButtons = document.querySelectorAll('.mode-btn');
const sidebarItems = document.querySelectorAll('.sidebar-item');

// Initialize speech synthesis
const synth = window.speechSynthesis;

// Translation history
let translationHistory = JSON.parse(localStorage.getItem('translationHistory')) || [];

// Event Listeners
translateBtn.addEventListener('click', translateText);
improveBtn.addEventListener('click', improveTranslation);
swapBtn.addEventListener('click', swapLanguages);
clearBtn.addEventListener('click', clearInput);
pasteBtn.addEventListener('click', pasteText);
copyTranslationBtn.addEventListener('click', copyTranslation);
saveTranslationBtn.addEventListener('click', saveTranslation);
inputSpeakBtn.addEventListener('click', () => speakText(inputText.value, sourceLanguageSelect.value));
outputSpeakBtn.addEventListener('click', () => speakText(outputText.textContent, targetLanguageSelect.value));

// Mode selection
modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        modeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update UI based on selected mode
        const mode = btn.textContent.trim().toLowerCase();
        updateUIForMode(mode);
    });
});

function updateUIForMode(mode) {
    const inputArea = document.querySelector('.input-area');
    const placeholder = inputArea.querySelector('textarea');
    
    switch(mode) {
        case 'text':
            placeholder.placeholder = 'Enter text to translate...';
            inputArea.classList.remove('document-mode', 'website-mode');
            break;
        case 'document':
            placeholder.placeholder = 'Drag and drop a document or click to upload (PDF, DOCX, TXT)';
            inputArea.classList.add('document-mode');
            inputArea.classList.remove('website-mode');
            setupDocumentUpload();
            break;
        case 'website':
            placeholder.placeholder = 'Enter website URL to translate...';
            inputArea.classList.add('website-mode');
            inputArea.classList.remove('document-mode');
            break;
    }
}

// Sidebar navigation
sidebarItems.forEach(item => {
    item.addEventListener('click', () => {
        sidebarItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
    });
});

// Translation function
async function translateText() {
    const text = inputText.value.trim();
    if (!text) return;

    try {
        // Show loading state
        outputText.textContent = 'Translating...';
        translateBtn.disabled = true;

        const response = await fetch(`${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': apiKey
            },
            body: JSON.stringify({
                messages: [{
                    role: "system",
                    content: `You are a professional translator. Translate the following text from ${sourceLanguageSelect.value} to ${targetLanguageSelect.value}.`
                }, {
                    role: "user",
                    content: text
                }]
            })
        });

        const data = await response.json();
        const translation = data.choices[0].message.content;
        
        outputText.textContent = translation;
        improveBtn.disabled = false;

        // Add to history
        addToHistory(text, translation, sourceLanguageSelect.value, targetLanguageSelect.value);
    } catch (error) {
        outputText.textContent = 'Translation error. Please try again.';
        console.error('Translation error:', error);
    } finally {
        translateBtn.disabled = false;
    }
}

// Improve translation function with enhanced capabilities
async function improveTranslation() {
    const text = outputText.textContent.trim();
    if (!text) return;

    try {
        improveBtn.disabled = true;
        const originalText = text;
        outputText.textContent = 'Improving translation...';

        const response = await fetch(`${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': apiKey
            },
            body: JSON.stringify({
                messages: [{
                    role: "system",
                    content: `You are a professional translator and writing improvement expert. Enhance the following text in ${targetLanguageSelect.value}:
                    1. Make it more natural and fluent
                    2. Improve grammar and word choice
                    3. Maintain the original meaning while making it more engaging
                    4. Adjust the tone to be more professional or casual based on context
                    5. Ensure cultural appropriateness
                    
                    Provide the improved version only, without explanations.`
                }, {
                    role: "user",
                    content: text
                }]
            })
        });

        const data = await response.json();
        outputText.textContent = data.choices[0].message.content;
    } catch (error) {
        outputText.textContent = originalText;
        console.error('Improvement error:', error);
    } finally {
        improveBtn.disabled = false;
    }
}

// Utility functions
function swapLanguages() {
    const temp = sourceLanguageSelect.value;
    sourceLanguageSelect.value = targetLanguageSelect.value;
    targetLanguageSelect.value = temp;
}

function clearInput() {
    inputText.value = '';
    outputText.textContent = 'Translation will appear here...';
    improveBtn.disabled = true;
}

async function pasteText() {
    try {
        const text = await navigator.clipboard.readText();
        inputText.value = text;
    } catch (error) {
        console.error('Failed to paste:', error);
    }
}

async function copyTranslation() {
    try {
        await navigator.clipboard.writeText(outputText.textContent);
        // Show success feedback
        copyTranslationBtn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => {
            copyTranslationBtn.innerHTML = '<i class="fas fa-copy"></i>';
        }, 2000);
    } catch (error) {
        console.error('Failed to copy:', error);
    }
}

function saveTranslation() {
    const translation = {
        source: inputText.value,
        target: outputText.textContent,
        sourceLang: sourceLanguageSelect.value,
        targetLang: targetLanguageSelect.value,
        timestamp: new Date().toISOString()
    };
    
    let savedTranslations = JSON.parse(localStorage.getItem('savedTranslations')) || [];
    savedTranslations.unshift(translation);
    localStorage.setItem('savedTranslations', JSON.stringify(savedTranslations));

    // Show success feedback
    saveTranslationBtn.innerHTML = '<i class="fas fa-check"></i>';
    setTimeout(() => {
        saveTranslationBtn.innerHTML = '<i class="fas fa-bookmark"></i>';
    }, 2000);
}

function addToHistory(source, target, sourceLang, targetLang) {
    const translation = {
        source,
        target,
        sourceLang,
        targetLang,
        timestamp: new Date().toISOString()
    };
    
    translationHistory.unshift(translation);
    if (translationHistory.length > 100) translationHistory.pop();
    localStorage.setItem('translationHistory', JSON.stringify(translationHistory));
}

function speakText(text, lang) {
    if (synth.speaking) {
        synth.cancel();
        return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    synth.speak(utterance);
}

// Auto-detect language
inputText.addEventListener('input', debounce(async () => {
    const text = inputText.value.trim();
    if (text.length < 10) return;

    try {
        const response = await fetch(`${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': apiKey
            },
            body: JSON.stringify({
                messages: [{
                    role: "system",
                    content: "You are a language detection system. Detect the language of the following text and respond with just the language code (e.g., 'en', 'es', 'fr')."
                }, {
                    role: "user",
                    content: text
                }]
            })
        });

        const data = await response.json();
        const detectedLang = data.choices[0].message.content.trim();
        sourceLanguageSelect.value = detectedLang;
    } catch (error) {
        console.error('Language detection error:', error);
    }
}, 1000));

// Utility function for debouncing
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

// Document translation setup
function setupDocumentUpload() {
    const textarea = document.querySelector('.input-area textarea');
    const dropZone = document.querySelector('.input-area');

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop zone when dragging over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    // Handle dropped files
    dropZone.addEventListener('drop', handleDrop, false);
    
    // Handle click to upload
    textarea.addEventListener('click', () => {
        if (dropZone.classList.contains('document-mode')) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.pdf,.docx,.txt';
            input.onchange = (e) => handleFiles(e.target.files);
            input.click();
        }
    });
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function highlight(e) {
    document.querySelector('.input-area').classList.add('highlight');
}

function unhighlight(e) {
    document.querySelector('.input-area').classList.remove('highlight');
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

// Add PDF.js library
const script = document.createElement('script');
script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
script.onload = () => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
};
document.head.appendChild(script);

async function extractTextFromFile(file) {
    if (file.type === 'application/pdf') {
        return await extractPDFText(file);
    } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // TODO: Implement DOCX handling
        throw new Error('DOCX files are not yet supported');
    } else {
        // Handle text files
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }
}

async function extractPDFText(file) {
    try {
        // Convert file to ArrayBuffer
        const arrayBuffer = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });

        // Load PDF document
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        // Extract text from each page
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
                .map(item => item.str)
                .join(' ');
            
            fullText += pageText + '\n\n';
        }

        return fullText.trim();
    } catch (error) {
        console.error('PDF extraction error:', error);
        throw new Error('Failed to extract text from PDF. Please make sure it is a valid PDF file.');
    }
}

async function handleFiles(files) {
    const file = files[0];
    if (!file) return;

    const textarea = document.querySelector('.input-area textarea');
    textarea.value = `Processing ${file.name}...`;

    try {
        // Validate file type
        const validTypes = ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (!validTypes.includes(file.type)) {
            throw new Error('Unsupported file type. Please upload a PDF, TXT, or DOCX file.');
        }

        // Show loading message with file type
        const fileType = file.type === 'application/pdf' ? 'PDF' :
                        file.type === 'text/plain' ? 'text' : 'DOCX';
        textarea.value = `Extracting content from ${fileType} file...`;

        const text = await extractTextFromFile(file);
        
        // Clean up extracted text
        const cleanedText = text
            .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
            .replace(/\n\s*\n/g, '\n')  // Remove empty lines
            .trim();

        textarea.value = cleanedText;
        translateText(); // Automatically start translation
    } catch (error) {
        textarea.value = error.message || 'Error processing file. Please try again.';
        console.error('File processing error:', error);
    }
}

// Website translation
async function translateWebsite() {
    const url = inputText.value.trim();
    if (!url) return;

    try {
        outputText.textContent = 'Fetching website content...';
        
        // In a real implementation, you would:
        // 1. Send the URL to your backend server
        // 2. Have the server fetch and parse the HTML content
        // 3. Extract the text content
        // 4. Translate the text while preserving HTML structure
        // 5. Return the translated HTML
        
        // For now, we'll just show a message
        outputText.textContent = 'Website translation is not yet implemented. This feature would typically require a backend server to fetch and process website content.';
    } catch (error) {
        outputText.textContent = 'Error processing website. Please try again.';
        console.error('Website processing error:', error);
    }
}

// Add CSS for document upload styling
const style = document.createElement('style');
style.textContent = `
    .input-area.document-mode {
        position: relative;
        cursor: pointer;
    }
    
    .input-area.document-mode textarea {
        cursor: pointer;
        text-align: center;
        padding-top: 100px;
    }
    
    .input-area.document-mode:before {
        content: '📄';
        font-size: 48px;
        position: absolute;
        top: 40px;
        left: 50%;
        transform: translateX(-50%);
        pointer-events: none;
    }
    
    .input-area.highlight {
        border: 2px dashed var(--primary-color);
        background-color: var(--hover-color);
    }
    
    .input-area.website-mode textarea {
        text-align: center;
        padding-top: 100px;
    }
    
    .input-area.website-mode:before {
        content: '🌐';
        font-size: 48px;
        position: absolute;
        top: 40px;
        left: 50%;
        transform: translateX(-50%);
        pointer-events: none;
    }
`;

document.head.appendChild(style);
