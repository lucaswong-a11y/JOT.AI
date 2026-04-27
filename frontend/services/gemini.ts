
import { SUMMARY_MODEL_NAME, SYSTEM_INSTRUCTIONS } from '../constants';

/**
 * Generates a meeting summary by calling the Vercel Serverless Function proxy.
 * This avoids direct SDK calls from the frontend, bypassing geo-blocking.
 */
export const generateSummary = async (transcription: string, notes: string, customInstruction?: string) => {
  try {
    const prompt = `Transcription:\n${transcription}\n\nUser Notes:\n${notes}\n\nPlease summarize this meeting.`;
    
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: SUMMARY_MODEL_NAME,
        contents: { 
          role: 'user', 
          parts: [{ text: prompt }] 
        },
        config: { 
          systemInstruction: customInstruction || SYSTEM_INSTRUCTIONS.SUMMARIZATION 
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate summary');
    }

    const data = await response.json();
    return data.text || "No summary generated.";
  } catch (error) {
    console.error("Summary generation error:", error);
    throw error;
  }
};

/**
 * Connects to Gemini Live API for real-time audio transcription.
 * Using direct ESM import to fix "Failed to resolve module specifier" error.
 * NOTE: This still connects directly to Google's servers. 
 * For Hong Kong users, a WebSocket proxy would be required on the backend.
 */
export const connectLiveTranscription = async (
  callbacks: {
    onTranscription: (text: string, isUser: boolean) => void;
    onError: (error: any) => void;
  },
  config: {
    systemInstruction?: string;
    language?: string;
  }
) => {
  try {
    // Dynamically import the SDK to avoid top-level resolution issues
    const { GoogleGenAI, Modality } = await import('https://esm.sh/@google/genai@1.20.0');
    
    // Use the API key from environment (Note: this is exposed to client)
    const genAI = new GoogleGenAI((window as any).process?.env?.VITE_GEMINI_API_KEY || '');
    
    const langContext = config.language ? ` The primary language is ${config.language}.` : '';
    const finalInstruction = (config.systemInstruction || SYSTEM_INSTRUCTIONS.TRANSCRIPTION) + langContext;

    const session = await genAI.live.connect({
      model: 'gemini-live-2.5-flash-native-audio',
      callbacks: {
        onmessage: async (message: any) => {
          if (message.serverContent?.outputTranscription) {
            callbacks.onTranscription(message.serverContent.outputTranscription.text, false);
          } else if (message.serverContent?.inputTranscription) {
            callbacks.onTranscription(message.serverContent.inputTranscription.text, true);
          }
        },
        onerror: (e: any) => callbacks.onError(e),
      },
      config: {
        responseModalities: [Modality.AUDIO],
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        systemInstruction: finalInstruction,
      },
    });
    return session;
  } catch (error) {
    console.error("Live Connection Error:", error);
    callbacks.onError(error);
    throw error;
  }
};

/**
 * Encodes raw Float32 audio data into Base64-encoded PCM16 format.
 */
export function encodeAudio(data: Float32Array): string {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = Math.max(-1, Math.min(1, data[i])) * 32767;
  }
  let binary = '';
  const bytes = new Uint8Array(int16.buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
