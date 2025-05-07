# OpenAI-to-Cohere Proxy

A Vercel serverless proxy that translates OpenAI API requests (`/v1/chat/completions`) to Cohere's API, enabling Cohere models to be used as a drop-in replacement for OpenAI's chat completions endpoint. This proxy supports both standard and streaming responses.

- Visit [cohere.com](https://cohere.com/) to get your free API key.

## Features

-   **OpenAI Compatibility:** Translates requests and responses between OpenAI and Cohere formats.
-   **Streaming Support:** Handles streaming responses from Cohere and delivers them in the OpenAI Server-Sent Events (SSE) format, including the `data: [DONE]` marker.
-   **Flexible API Key Handling:** Accepts the Cohere API key via the standard `Authorization: Bearer <token>` header (recommended for clients like Brave Leo) or a custom `X-Cohere-API-Key` header for direct testing.
-   **CORS Enabled:** Configured with permissive CORS headers to allow requests from various origins, including browser extensions.
-   **System Prompt Mapping:** Maps OpenAI's `system` role messages to Cohere's `preamble`.

## Setup

1.  **Clone the repository (if you haven't already):**
    ```bash
    git clone <your-repo-url>
    cd <repo-name>
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Deploy to Vercel:**
    Connect your repository to Vercel for automatic deployments or deploy manually:
    ```bash
    vercel deploy --prod
    ```
    After deployment, Vercel will provide you with a URL (e.g., `https://your-project-name.vercel.app`). Your proxy endpoint will be this URL followed by the API path (e.g., `/api/proxy` if your file is `api/proxy.js`).

## Usage

Send `POST` requests to your deployed Vercel function endpoint. For example, if your Vercel function is at `https://your-project-name.vercel.app/api/proxy`, that's your server endpoint.

The request body should follow the OpenAI chat completions format.

### API Key Authentication

You can provide your Cohere API key in **one** of the following ways:

1.  **Standard `Authorization` Header (Recommended for most clients):**
    ```
    Authorization: Bearer your-cohere-api-key
    ```
    This is the method used by clients like Brave Leo and most OpenAI SDKs.

2.  **Custom `X-Cohere-API-Key` Header (For direct testing):**
    ```
    X-Cohere-API-Key: your-cohere-api-key
    ```

The proxy will use the key to authenticate with the Cohere API.

## Example Request (using `curl`)

**Using `Authorization` header:**

```bash
curl -X POST https://your-vercel-deployment.vercel.app/api/proxy \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-cohere-api-key" \
  -d '{
    "model": "command-r", # Or any Cohere model you wish to use
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "Hello, who are you?" }
    ],
    "stream": false # Set to true for streaming
  }'

**Using `X-Cohere-API-Key` header:**

```bash
curl -X POST https://your-vercel-deployment.vercel.app/api/proxy \
  -H "Content-Type: application/json" \
  -H "X-Cohere-API-Key: your-cohere-api-key" \
  -d '{
    "model": "command-r",
    "messages": [
      { "role": "user", "content": "Hello, who are you?" }
    ]
  }'
```
## Using with Brave Leo

1.  **Deploy this proxy** to Vercel and note your function's URL (e.g., `https://your-project-name.vercel.app/`).
2.  In Brave Browser, go to **Settings -> Leo**.
3.  Under "Default model for new chats", select your deployed proxy if you've added it. To add or edit:
    *   Click "Manage models".
    *   Click "Add model".
    *   **Label:** Give it a name (e.g., "My Cohere Proxy").
    *   **Model request name:** Enter a Cohere model name (e.g., `command-r`, `command-a-03-2025`).
    *   **Server endpoint:** Enter your full Vercel function URL (e.g., `https://your-project-name.vercel.app/v1/chat/completions`).
    *   **API Key:** Paste your Cohere API key here. Brave Leo will automatically send it using the `Authorization: Bearer <token>` header.
4.  Save the model configuration. You can now select this model in Leo.

## Scripts (Example `package.json` scripts)

Ensure your `package.json` has scripts for local development and deployment:

```json
{
  "scripts": {
    "dev": "vercel dev",
    "start": "vercel dev", // Or your specific start command if not using Vercel CLI directly
    "deploy": "vercel deploy --prod"
  }
}
```

-   `npm run dev`: Runs the Vercel development server locally.
-   `npm run deploy`: Deploys the current version to Vercel production.

---

**Note:** This project proxies requests to Cohere. Your Cohere API key is passed through this proxy to the Cohere API for authentication. While the key is handled in memory during the request, it is not stored persistently by this proxy or on Vercel infrastructure (beyond Vercel's standard logging if enabled). Ensure your Vercel deployment and Cohere API key are secured.