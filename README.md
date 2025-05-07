# OpenAI-to-Cohere Proxy

A Vercel serverless proxy that translates OpenAI API requests (`/v1/chat/completions`) to Cohere's API. Deploy this to Vercel to use Cohere as a drop-in replacement for OpenAI's chat completions endpoint.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Deploy to Vercel:**
   ```bash
   vercel deploy --prod
   ```

## Usage

Send POST requests to your deployed endpoint at:

```
/v1/chat/completions
```

The request body should follow the OpenAI chat completions format. You must include your Cohere API key in the request headers:

```
X-Cohere-API-Key: your-api-key-here
```

The proxy will forward the request to Cohere and return a compatible response.

## Example Request

```bash
curl -X POST https://your-vercel-deployment.vercel.app/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Cohere-API-Key: your-cohere-api-key" \
  -d '{
    "model": "command-a-03-2025",
    "messages": [
      { "role": "user", "content": "Hello, who are you?" }
    ]
  }'
```

## Using with Brave Leo

1. Deploy this proxy to Vercel
2. In Brave Leo settings, set your API endpoint to your Vercel deployment URL
3. Add your Cohere API key in the API key field - it will be automatically sent in the request header

## Scripts

- `npm run dev` — Run locally with Vercel dev server.
- `npm start` — Start the Vercel server locally.
- `npm run deploy` — Deploy to Vercel production.

---

**Note:** This project is intended for use with Vercel serverless functions. Your Cohere API key is sent directly from your client to Cohere through the proxy - it is never stored on Vercel.