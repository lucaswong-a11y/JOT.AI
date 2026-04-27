
export const LIVE_API_MODEL_NAME = 'gemini-live-2.5-flash-native-audio';
export const SUMMARY_MODEL_NAME = 'gemini-2.5-flash';

export const AUDIO_CONFIG = {
  INPUT_SAMPLE_RATE: 16000,
  OUTPUT_SAMPLE_RATE: 24000,
};

export const SYSTEM_INSTRUCTIONS = {
  TRANSCRIPTION: `You are a professional verbatim transcriptionist. 
  - Transcribe the audio exactly as spoken.
  - Do not summarize, paraphrase, or add commentary.
  - Use proper punctuation and capitalization.
  - If multiple speakers are present, try to distinguish them by context.
  - Focus on high accuracy for technical terms and names.`,
  SUMMARIZATION: "Based on the following meeting transcription and user notes, provide a concise summary including: 1. Key Discussion Points, 2. Decisions Made, and 3. Action Items with owners if mentioned. Format the output in clean Markdown."
};

export const SUPPORTED_LANGUAGES = [
  { code: 'en-US', label: 'English', native: 'English' },
  { code: 'zh-CN', label: 'Chinese (Mandarin)', native: '简体中文' },
  { code: 'zh-HK', label: 'Chinese (Cantonese)', native: '廣東話' },
  { code: 'es-ES', label: 'Spanish', native: 'Español' },
  { code: 'fr-FR', label: 'French', native: 'Français' },
  { code: 'ja-JP', label: 'Japanese', native: '日本語' }
];

// Billing Constants
export const COST_PER_1M_TOKENS = 0.15; // Base cost per 1 million tokens (USD)
export const BILLING_MULTIPLIER = 1.33; // Overhead/Service multiplier
