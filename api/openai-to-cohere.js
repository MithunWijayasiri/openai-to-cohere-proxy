const axios = require('axios');

/**
 * Vercel serverless function handler that proxies OpenAI chat completion requests
 * to the Cohere API, transforming request and response formats as needed.
 */
module.exports = async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get Cohere API key from Authorization header first, then fall back to X-Cohere-API-Key
    let cohereApiKey;
    
    // Check for Authorization header (Bearer token format)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      cohereApiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
    } else {
      // Fall back to X-Cohere-API-Key header
      cohereApiKey = req.headers['x-cohere-api-key'];
    }
    
    if (!cohereApiKey) {
      return res.status(401).json({ error: 'API key is required in either Authorization header as Bearer token or X-Cohere-API-Key header' });
    }

    // Extract relevant fields from OpenAI request
    const { model, messages, max_tokens, temperature } = req.body;

    // Validate required fields
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Process chat history and extract last message
    let chatHistory = [];
    let lastUserMessage = '';

    // Iterate through messages to properly format chat history
    if (messages.length > 0) {
      // Find the last user message
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          lastUserMessage = messages[i].content;
          break;
        }
      }

      // Build chat history from all but the last user message
      for (let i = 0; i < messages.length - 1; i++) {
        const msg = messages[i];
        const nextMsg = messages[i + 1];
        
        // Skip if this is the last user message or if it's a user message that's immediately followed by an assistant message
        if (msg.role === 'user' && msg.content === lastUserMessage) continue;
        if (msg.role === 'user' && nextMsg && nextMsg.role === 'assistant') {
          chatHistory.push({ role: 'USER', message: msg.content });
          chatHistory.push({ role: 'CHATBOT', message: nextMsg.content });
          i++; // Skip the next message as we've already added it
        } else if (msg.role === 'assistant') {
          chatHistory.push({ role: 'CHATBOT', message: msg.content });
        } else if (msg.role === 'user') {
          chatHistory.push({ role: 'USER', message: msg.content });
        }
      }
    }

    // Prepare Cohere API request
    const cohereRequest = {
      message: lastUserMessage,
      model: model || 'command-r',
      max_tokens: max_tokens,
      temperature: temperature || 0.3
    };

    // Only add chat_history if it's not empty
    if (chatHistory.length > 0) {
      cohereRequest.chat_history = chatHistory;
    }

    // Make request to Cohere API
    const cohereResponse = await axios.post(
      'https://api.cohere.ai/v1/chat',
      cohereRequest,
      {
        headers: {
          Authorization: `Bearer ${cohereApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Map Cohere finish reason to OpenAI equivalent
    let finishReason = 'stop';
    if (cohereResponse.data.finish_reason) {
      switch(cohereResponse.data.finish_reason) {
        case 'COMPLETE':
          finishReason = 'stop';
          break;
        case 'MAX_TOKENS':
          finishReason = 'length';
          break;
        case 'ERROR':
          finishReason = 'error';
          break;
        default:
          finishReason = 'stop';
      }
    }

    // Transform Cohere response to OpenAI format
    const openAIResponse = {
      id: cohereResponse.data.generation_id || 'cohere-' + Date.now(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model || 'command-r',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: cohereResponse.data.text
          },
          finish_reason: finishReason
        }
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };

    // Add token usage if available
    if (cohereResponse.data.meta && cohereResponse.data.meta.billed_units) {
      const billedUnits = cohereResponse.data.meta.billed_units;
      openAIResponse.usage = {
        prompt_tokens: billedUnits.input_tokens || 0,
        completion_tokens: billedUnits.output_tokens || 0,
        total_tokens: (billedUnits.input_tokens || 0) + (billedUnits.output_tokens || 0)
      };
    }

    // Send response back to client
    res.status(200).json(openAIResponse);
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
};