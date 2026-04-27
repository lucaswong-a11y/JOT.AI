
import { GoogleGenAI } from '@google/genai';
import { GoogleAuth } from 'google-auth-library';
import { getVercelOidcToken } from '@vercel/oidc';
import { writeFileSync } from 'fs';

/**
 * Vercel Serverless Function (Node.js)
 * Securely connects to Google Cloud Vertex AI using Keyless Workload Identity Federation (WIF).
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { contents, config, model } = req.body;
    if (!contents) {
      return res.status(400).json({ error: 'Missing contents in request body' });
    }

    const projectNumber = process.env.GCP_PROJECT_NUMBER;
    const serviceAccountEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
    const projectId = process.env.GCP_PROJECT_ID;

    if (!projectNumber || !serviceAccountEmail || !projectId) {
      return res.status(500).json({ error: 'Server configuration error: Missing GCP WIF environment variables.' });
    }

    const oidcToken = await getVercelOidcToken();
    const tokenPath = '/tmp/oidc-token.txt';
    writeFileSync(tokenPath, oidcToken);

    const credentials = {
      type: 'external_account',
      audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/vercel-pool/providers/vercel-provider`,
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      token_url: 'https://sts.googleapis.com/v1/token',
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
      credential_source: {
        file: tokenPath,
      },
    };

    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    const ai = new GoogleGenAI({
      vertexai: {
        project: projectId,
        location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
      },
      authClient: auth,
    });

    const response = await ai.models.generateContent({
      model: model || 'gemini-2.5-flash',
      contents,
      config: {
        ...config,
        systemInstruction: config?.systemInstruction || 'You are a professional assistant.',
      },
    });

    return res.status(200).json({
      text: response.text,
      candidates: response.candidates,
    });
  } catch (error: any) {
    console.error('Vertex AI Backend Proxy Error:', error);
    return res.status(500).json({
      error: 'Failed to generate content from AI provider',
      details: error.message,
    });
  }
}
