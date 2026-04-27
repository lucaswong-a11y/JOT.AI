
import { SUMMARY_MODEL_NAME, SYSTEM_INSTRUCTIONS } from '../constants';

/**
 * Generates a meeting summary by calling the Vercel Serverless Function proxy.
 * This bypasses geo-blocking by running the Gemini SDK on the Vercel backend.
 */
export const generateSummary = async (transcription: string, notes: string, customInstruction?: string) => {
  try {
    const prompt = `
      Please provide a professional summary of the following meeting.
      
      Meeting Transcription:
      ${transcription}

      User's Personal Notes:
      ${notes}
    `;
    
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
