import { GoogleGenAI } from "@google/genai";

// DOM Element References
const recordBtn = document.getElementById('record-btn') as HTMLButtonElement;
const uploadInput = document.getElementById('upload-input') as HTMLInputElement;
const languageSelect = document.getElementById('language-select') as HTMLSelectElement;
const urlInput = document.getElementById('url-input') as HTMLInputElement;
const urlBtn = document.getElementById('url-btn') as HTMLButtonElement;
const transcribedText = document.getElementById('transcribed-text') as HTMLTextAreaElement;
const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
const exportBtn = document.getElementById('export-btn') as HTMLButtonElement;
const loader = document.getElementById('loader') as HTMLDivElement;
const langEnBtn = document.getElementById('lang-en-btn') as HTMLButtonElement;
const langArBtn = document.getElementById('lang-ar-btn') as HTMLButtonElement;

// Fix: Cast to unknown first to resolve TypeScript errors when casting HTMLElement to SVGElement.
const copyIcon = document.getElementById('copy-icon') as unknown as SVGElement;
const checkIcon = document.getElementById('check-icon') as unknown as SVGElement;

// --- State Variables ---
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let isRecording = false;
let currentLanguage = 'ar';

// --- Translations ---
const translations = {
    ar: {
        title: "محول الصوت إلى نص",
        subtitle: "سجل، ارفع، أو أدخل رابطًا لنسخ الصوت باللغة الإنجليزية أو العربية.",
        controlsLabel: "عناصر التحكم",
        languageLabel: "اللغة:",
        record: "تسجيل",
        stop: "إيقاف",
        upload: "رفع ملف",
        urlPlaceholder: "أدخل رابط صوتي أو يوتيوب هنا...",
        urlButton: "تحويل من رابط",
        outputTextLabel: "النص المكتوب",
        textareaPlaceholder: "سيظهر النص المكتوب هنا...",
        loaderText: "جاري تحويل الصوت...",
        startRecordingAria: "بدء التسجيل",
        stopRecordingAria: "إيقاف التسجيل",
        copyAria: "نسخ النص",
        exportAria: "تصدير النص كملف",
        transcriptionError: "خطأ: تعذر نسخ الصوت. يرجى مراجعة وحدة التحكم للحصول على التفاصيل.",
        micError: "تعذر الوصول إلى الميكروفون. يرجى التأكد من منح الأذونات.",
        urlError: "الرجاء إدخال رابط صالح.",
        urlFeatureAlert: "ميزة تحويل الصوت من الروابط تتطلب معالجة من جانب الخادم وهي غير مدعومة حاليًا في هذا العرض التوضيحي.",
        pageTitle: "محول الصوت إلى نص",
    },
    en: {
        title: "Audio to Text Converter",
        subtitle: "Record, upload, or enter a link to transcribe audio in English or Arabic.",
        controlsLabel: "Controls",
        languageLabel: "Language:",
        record: "Record",
        stop: "Stop",
        upload: "Upload File",
        urlPlaceholder: "Enter an audio or YouTube link here...",
        urlButton: "Transcribe from Link",
        outputTextLabel: "Transcribed Text",
        textareaPlaceholder: "The transcribed text will appear here...",
        loaderText: "Transcribing audio...",
        startRecordingAria: "Start Recording",
        stopRecordingAria: "Stop Recording",
        copyAria: "Copy Text",
        exportAria: "Export Text as File",
        transcriptionError: "Error: Could not transcribe audio. Please check the console for details.",
        micError: "Could not access the microphone. Please ensure permissions are granted.",
        urlError: "Please enter a valid link.",
        urlFeatureAlert: "Transcribing from links requires server-side processing and is not currently supported in this demo.",
        pageTitle: "Audio to Text Converter",
    }
};

// --- Language Switcher ---

/**
 * Sets the application language and updates the UI.
 * @param {'ar' | 'en'} lang - The language to set.
 */
function setLanguage(lang: 'ar' | 'en') {
    currentLanguage = lang;
    localStorage.setItem('appLanguage', lang);

    const isArabic = lang === 'ar';
    document.documentElement.lang = lang;
    document.documentElement.dir = isArabic ? 'rtl' : 'ltr';

    document.title = translations[lang].pageTitle;

    document.querySelectorAll<HTMLElement>('[data-translate-key]').forEach(el => {
        const key = el.dataset.translateKey as keyof typeof translations.ar;
        if (key) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                (el as HTMLInputElement | HTMLTextAreaElement).placeholder = translations[lang][key];
            } else {
                el.textContent = translations[lang][key];
            }
        }
    });

    // Manually update ARIA labels and dynamic text
    recordBtn.setAttribute('aria-label', isRecording ? translations[lang].stopRecordingAria : translations[lang].startRecordingAria);
    copyBtn.setAttribute('aria-label', translations[lang].copyAria);
    exportBtn.setAttribute('aria-label', translations[lang].exportAria);
    (urlInput as HTMLInputElement).setAttribute('aria-label', translations[lang].urlPlaceholder);
    
    // Update button active state
    langArBtn.classList.toggle('active', isArabic);
    langEnBtn.classList.toggle('active', !isArabic);

    // Update recording button text
    updateRecordingUI(isRecording);
}


// --- Initialize Gemini API ---
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

// --- Core Functions ---

/**
 * Sends audio data to the Gemini API for transcription.
 * @param {Blob} audioBlob The audio data to transcribe.
 */
async function transcribeAudio(audioBlob: Blob) {
    setLoading(true);
    transcribedText.value = '';

    try {
        const audioData = await blobToBase64(audioBlob);
        const mimeType = audioBlob.type;
        const selectedLanguage = languageSelect.value;
        
        const prompt = `Transcribe the following audio. The language spoken is ${selectedLanguage}.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType, data: audioData } },
                ],
            }],
        });
        
        transcribedText.value = response.text;
    } catch (error) {
        console.error('Error during transcription:', error);
        transcribedText.value = translations[currentLanguage].transcriptionError;
    } finally {
        setLoading(false);
    }
}

// --- Event Handlers ---

/**
 * Handles the click event on the record button to start or stop recording.
 */
async function handleRecordClick() {
    if (isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
}

/**
 * Starts the audio recording process.
 */
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            transcribeAudio(audioBlob);
            audioChunks = []; // Clear chunks for the next recording
            // Clean up the stream tracks
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        updateRecordingUI(true);
    } catch (error) {
        console.error('Error accessing microphone:', error);
        alert(translations[currentLanguage].micError);
    }
}

/**
 * Stops the audio recording process.
 */
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    updateRecordingUI(false);
}

/**
 * Handles the file upload event.
 * @param {Event} event The file input change event.
 */
function handleFileUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];

    if (file) {
        transcribeAudio(file);
    }
}

/**
 * Handles the URL submission for transcription.
 */
async function handleUrlSubmit() {
    const url = urlInput.value.trim();
    if (!url) {
        alert(translations[currentLanguage].urlError);
        return;
    }

    setLoading(true);
    transcribedText.value = '';
    await new Promise(resolve => setTimeout(resolve, 1000));
    alert(translations[currentLanguage].urlFeatureAlert);
    urlInput.value = '';
    setLoading(false);
}

/**
 * Copies the transcribed text to the clipboard.
 */
function copyText() {
    if (!transcribedText.value) return;

    navigator.clipboard.writeText(transcribedText.value).then(() => {
        copyIcon.classList.add('hidden');
        checkIcon.classList.remove('hidden');
        setTimeout(() => {
            copyIcon.classList.remove('hidden');
            checkIcon.classList.add('hidden');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
}

/**
 * Exports the transcribed text as a .txt file.
 */
function exportText() {
    if (!transcribedText.value) return;

    const blob = new Blob([transcribedText.value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcription.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// --- UI and Utility Functions ---

/**
 * Updates the UI to reflect the recording state.
 * @param {boolean} recording - Whether recording is active.
 */
function updateRecordingUI(recording: boolean) {
    isRecording = recording;
    const recordBtnSpan = recordBtn.querySelector('span');
    if (recordBtnSpan) {
        recordBtnSpan.textContent = isRecording ? translations[currentLanguage].stop : translations[currentLanguage].record;
    }
    recordBtn.setAttribute('aria-label', isRecording ? translations[currentLanguage].stopRecordingAria : translations[currentLanguage].startRecordingAria);
    recordBtn.classList.toggle('recording', isRecording);
}

/**
 * Toggles the loading state of the UI.
 * @param {boolean} isLoading - Whether the app is in a loading state.
 */
function setLoading(isLoading: boolean) {
    loader.classList.toggle('hidden', !isLoading);
    const elementsToDisable: (HTMLButtonElement | HTMLSelectElement | HTMLInputElement)[] = [
        recordBtn,
        uploadInput,
        languageSelect,
        copyBtn,
        exportBtn,
        urlInput,
        urlBtn,
    ];
    elementsToDisable.forEach(el => el.disabled = isLoading);
}

/**
 * Converts a Blob to a Base64 encoded string.
 * @param {Blob} blob The blob to convert.
 * @returns {Promise<string>} A promise that resolves with the base64 string.
 */
function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = (reader.result as string).split(',')[1];
            resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Enables/disables output action buttons based on textarea content.
 */
function toggleActionButtons() {
    const hasText = transcribedText.value.trim().length > 0;
    copyBtn.disabled = !hasText;
    exportBtn.disabled = !hasText;
}

// --- Event Listeners ---
recordBtn.addEventListener('click', handleRecordClick);
uploadInput.addEventListener('change', handleFileUpload);
urlBtn.addEventListener('click', handleUrlSubmit);
copyBtn.addEventListener('click', copyText);
exportBtn.addEventListener('click', exportText);
transcribedText.addEventListener('input', toggleActionButtons);
langEnBtn.addEventListener('click', () => setLanguage('en'));
langArBtn.addEventListener('click', () => setLanguage('ar'));


// --- Initial state setup ---
function initializeApp() {
    const savedLang = localStorage.getItem('appLanguage') as 'ar' | 'en' | null;
    setLanguage(savedLang || 'ar');
    toggleActionButtons();
}

initializeApp();