# Vertex AI Studio Frontend App with Node.js Backend

This repository contains a frontend and a Node.js backend, designed to run together.
The backend acts as a proxy, handling Google Cloud API calls.

This project is intended for demonstration and prototyping purposes only.
It is not intended for use in a production environment.

## Prerequisites

To run this application locally, you need:

*   **[Google Cloud SDK / gcloud CLI](https://cloud.google.com/sdk/docs/install)**: Follow the instructions to install the SDK.

*   **gcloud Initialization**:
    *   Initialize the gcloud CLI:
        ```bash
        gcloud init
        ```
    *   Authenticate for Application Default Credentials (needed to call Google Cloud APIs):
        ```bash
        gcloud auth application-default login
        ```

*   **Node.js and npm**: Ensure you have Node.js and its package manager, `npm`, installed on your machine.

## Project Structure

The project is organized into two main directories:

*   `frontend/`: Contains the Frontend application code.
*   `backend/`: Contains the Node.js/Express server code to proxy Google Cloud API calls.

## Backend Environment Variables

The `backend/.env.local` file is automatically generated when you download this application.
It contains essential Google Cloud environment variables pre-configured based on your project settings at the time of download.

The variables set in `backend/.env.local` are:
*   `API_BACKEND_PORT`: The port the backend API server listens on (e.g., `5000`).
*   `API_PAYLOAD_MAX_SIZE`: The maximum size of the request payload accepted by the backend server (e.g., `5mb`).
*   `GOOGLE_CLOUD_LOCATION`: The Google Cloud region associated with your project.
*   `GOOGLE_CLOUD_PROJECT`: Your Google Cloud Project ID.

**Note:** These variables are automatically populated during the download process.
You can modify the values in `backend/.env.local` if you need to change them.

## Installation and Running the App

To install dependencies and run your Google Cloud Vertex AI Studio App locally, execute the following command:

```bash
npm install && npm run dev
```

## Vercel Deployment with Keyless Authentication

This project uses **Workload Identity Federation (WIF)** for secure, keyless authentication to Google Cloud Vertex AI.

### Required Environment Variables for Vercel

When deploying to Vercel, configure the following environment variables in your Vercel project settings:

| Variable | Description | Example |
|---|---|---|
| `GCP_PROJECT_ID` | Your Google Cloud Project ID | `gen-lang-client-0744516673` |
| `GCP_PROJECT_NUMBER` | Your Google Cloud Project Number | `1234567890` |
| `GCP_SERVICE_ACCOUNT_EMAIL` | Service Account email for WIF impersonation | `jot-vercel-backend@your-project.iam.gserviceaccount.com` |
| `GOOGLE_CLOUD_LOCATION` | Vertex AI deployment region (optional) | `us-central1` (default) |

### Setup Steps

1. **Configure WIF in Google Cloud**: Set up Workload Identity Federation with Vercel as the external identity provider.
2. **Create Service Account**: Create a service account with appropriate Vertex AI access.
3. **Link to Vercel**: Connect the service account to your Vercel environment.
4. **Set Environment Variables**: Add the variables listed above to your Vercel project dashboard.

### Local Development Note

⚠️ **Important**: Local development (`npm run dev`) cannot directly execute `api/generate.ts` because it requires Vercel OIDC tokens, which are only available in the Vercel serverless environment.

For local testing:
- Use a separate backend (see `backend/` directory) with traditional authentication, or
- Deploy to Vercel staging to test the WIF integration
