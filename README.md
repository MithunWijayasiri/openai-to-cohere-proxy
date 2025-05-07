# OpenAI-to-Cohere Proxy

A Vercel serverless proxy that translates OpenAI API requests (`/v1/chat/completions`) to Cohere's API. Deploy this to Vercel to use Cohere as a drop-in replacement for OpenAI's chat completions endpoint.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set the Cohere API Key:**
   - In Vercel, go to your project dashboard.
   - Navigate to **Settings > Environment Variables**.
   - Add a new variable:
     - **Key:** `COHERE_API_KEY`
     - **Value:** _your Cohere API key_

3. **Deploy to Vercel:**
   ```bash
   vercel deploy --prod
   ```

## Usage

Send POST requests to your deployed endpoint at:

```
/v1/chat/completions
```

The request body should follow the OpenAI chat completions format. The proxy will forward the request to Cohere and return a compatible response.

## Example Request

```json
{
  "model": "command-r-plus",
  "messages": [
    { "role": "user", "content": "Hello, who are you?" }
  ]
}
```

## Scripts

- `npm run dev` — Run locally with Vercel dev server.
- `npm start` — Start the Vercel server locally.
- `npm run deploy` — Deploy to Vercel production.

---

**Note:** This project is intended for use with Vercel serverless functions.