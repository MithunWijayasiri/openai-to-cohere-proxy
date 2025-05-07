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
    // Extract relevant fields from OpenAI request
    const { model, messages, max_tokens, temperature } = req.body;

    // Validate required fields
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Convert OpenAI messages to Cohere chat format.
    // OpenAI 'user' role maps to Cohere 'USER', all others (including 'assistant') map to 'CHATBOT'.
    const cohereMessages = messages.map(msg => ({
      role: msg.role === 'user' ? 'USER' : 'CHATBOT',
      message: msg.content
    }));

    // Prepare Cohere API request
    const cohereRequest = {
      message: messages[messages.length - 1].content, // Last message as prompt
      chat_history: cohereMessages.slice(0, -1), // Previous messages as history
      max_tokens: max_tokens || 512,
      temperature: temperature || 0.7,
      model: model || 'command-r-plus' // Map to a Cohere model
    };

    // Make request to Cohere API
    const cohereResponse = await axios.post(
      'https://api.cohere.ai/v1/chat',
      cohereRequest,
      {
        headers: {
          Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Transform Cohere response to OpenAI format
    const openAIResponse = {
      id: cohereResponse.data.generation_id || 'cohere-' + Date.now(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model || 'command-r-plus',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: cohereResponse.data.text
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: 0, // Cohere doesn't provide token counts
        completion_tokens: 0,
        total_tokens: 0
      }
    };

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