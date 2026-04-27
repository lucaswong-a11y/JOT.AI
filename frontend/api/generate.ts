
import { GoogleGenAI } from '@google/genai';

/**
 * Vercel Serverless Function (Node.js)
 * Acts as a proxy to the Gemini API to bypass geo-blocking in regions like Hong Kong.
 */
export default async function handler(req: any, res: any) {
  // Only allow POST requests for security
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { contents, config, model } = req.body;

    if (!contents) {
      return res.status(400).json({ error: 'Missing contents in request body' });
    }

    // Initialize the SDK securely on the server side
    // Vercel environment variables are accessed via process.env
    const apiKey = process.env.API_KEY || process.env.VITE_GEMINI_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: 'API Key not configured on server' });
    }

    const ai = new GoogleGenAI({ 
      apiKey: apiKey, 
      vertexai: true 
    });

    // Call the Gemini model (gemini-2.5-flash is the current high-performance standard)
    const response = await ai.models.generateContent({
      model: model || 'gemini-2.5-flash',
      contents,
      config: {
        ...config,
        systemInstruction: config?.systemInstruction || 'You are a professional assistant.'
      },
    });

    // Return the generated text as a clean JSON response
    return res.status(200).json({ 
      text: response.text,
      candidates: response.candidates 
    });

  } catch (error: any) {
    console.error('Gemini Backend Proxy Error:', error);
    return res.status(500).json({ 
      error: 'Failed to generate content from AI provider', 
      details: error.message 
    });
  }
}
