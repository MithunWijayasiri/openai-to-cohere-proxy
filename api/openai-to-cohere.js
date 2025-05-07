const axios = require('axios');

/**
 * Vercel serverless function handler that proxies OpenAI chat completion requests
 * to the Cohere API, transforming request and response formats as needed.
 */
module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*'); // Allow any origin
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Cohere-API-Key');

  // Handle OPTIONS preflight request for CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests after handling OPTIONS
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let cohereApiKey;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      cohereApiKey = authHeader.substring(7);
    } else {
      cohereApiKey = req.headers['x-cohere-api-key'];
    }

    if (!cohereApiKey) {
      return res.status(401).json({ error: 'API key is required in either Authorization header (Bearer <token>) or X-Cohere-API-Key header' });
    }

    const { model, messages, max_tokens, temperature, stream } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    let systemPreamble = '';
    const chatHistoryForCohere = [];
    let lastUserMessageContent = '';

    messages.forEach((msg, index) => {
      if (msg.role === 'system') {
        systemPreamble += (systemPreamble ? '\n' : '') + msg.content;
      } else if (msg.role === 'user') {
        if (index === messages.length - 1 && messages[index].role === 'user') {
            lastUserMessageContent = msg.content;
        } else if (index < messages.length -1 && messages[index].role === 'user' && messages[index+1].role !== 'user'){
            lastUserMessageContent = msg.content;
        }
         else {
          chatHistoryForCohere.push({ role: 'USER', message: msg.content });
        }
      } else if (msg.role === 'assistant') {
        chatHistoryForCohere.push({ role: 'CHATBOT', message: msg.content });
      }
    });

    if (!lastUserMessageContent) {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                lastUserMessageContent = messages[i].content;
                const listIndex = chatHistoryForCohere.findIndex(h => h.role === 'USER' && h.message === lastUserMessageContent);
                if (listIndex > -1 && listIndex === chatHistoryForCohere.length -1) {
                    chatHistoryForCohere.splice(listIndex, 1);
                }
                break;
            }
        }
    }
    
    if (!lastUserMessageContent && chatHistoryForCohere.length > 0 && chatHistoryForCohere[chatHistoryForCohere.length-1].role === 'USER') {
        lastUserMessageContent = chatHistoryForCohere.pop().message;
    }

    if (!lastUserMessageContent) {
        console.warn("Could not determine the final user message for Cohere prompt. Messages:", JSON.stringify(messages));
        return res.status(400).json({ error: 'A final user message is required for the Cohere prompt.' });
    }

    const cohereRequestPayload = {
      message: lastUserMessageContent,
      model: model || 'command-r',
      temperature: temperature !== undefined ? temperature : 0.3,
      max_tokens: max_tokens,
      stream: stream || false,
    };

    if (systemPreamble) {
      cohereRequestPayload.preamble = systemPreamble;
    }
    if (chatHistoryForCohere.length > 0) {
      cohereRequestPayload.chat_history = chatHistoryForCohere;
    }

    Object.keys(cohereRequestPayload).forEach(key => {
      if (cohereRequestPayload[key] === undefined) {
        delete cohereRequestPayload[key];
      }
    });
    
    if (cohereRequestPayload.stream) {
      try {
        const cohereStreamResponse = await axios.post(
          'https://api.cohere.ai/v1/chat',
          cohereRequestPayload,
          {
            headers: {
              Authorization: `Bearer ${cohereApiKey}`,
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream',
            },
            responseType: 'stream',
          }
        );

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        let buffer = '';
        cohereStreamResponse.data.on('data', (chunk) => {
          buffer += chunk.toString();
          let boundary;
          while ((boundary = buffer.indexOf('\n')) !== -1) {
            const line = buffer.substring(0, boundary).trim();
            buffer = buffer.substring(boundary + 1);

            if (line.startsWith('{')) { // Correct for newline-delimited JSON objects
                try {
                    const cohereEvent = JSON.parse(line); // Correct parsing
                    let openAIChunk;
                    let isFinalChunk = false;

                    // Determine generation ID for the chunk
                    const generationId = cohereEvent.generation_id || 
                                       (cohereEvent.response && cohereEvent.response.generation_id) || 
                                       'chatcmpl-stream-' + Date.now();

                    if (cohereEvent.is_finished === true && cohereEvent.event_type === "stream-end") {
                        isFinalChunk = true;
                        let mappedFinishReason = 'stop'; // Default
                        if (cohereEvent.finish_reason) {
                            switch(cohereEvent.finish_reason.toUpperCase()) {
                                case 'COMPLETE': mappedFinishReason = 'stop'; break;
                                case 'MAX_TOKENS': mappedFinishReason = 'length'; break;
                                case 'ERROR':
                                case 'ERROR_TOXIC':
                                case 'ERROR_LIMIT':
                                    mappedFinishReason = 'stop'; // Safest for OpenAI compatibility
                                    console.warn(`Cohere stream ended with reason: ${cohereEvent.finish_reason}. Mapping to 'stop'.`);
                                    break;
                                default:
                                    mappedFinishReason = 'stop';
                                    console.warn(`Cohere stream ended with unknown reason: ${cohereEvent.finish_reason}. Mapping to 'stop'.`);
                            }
                        }

                        openAIChunk = {
                            id: generationId,
                            object: 'chat.completion.chunk',
                            created: Math.floor(Date.now() / 1000),
                            model: cohereRequestPayload.model,
                            choices: [{
                                index: 0,
                                delta: {},
                                finish_reason: mappedFinishReason,
                            }],
                            usage: cohereEvent.response && cohereEvent.response.meta && cohereEvent.response.meta.billed_units ? {
                                prompt_tokens: cohereEvent.response.meta.billed_units.input_tokens || 0,
                                completion_tokens: cohereEvent.response.meta.billed_units.output_tokens || 0,
                                total_tokens: (cohereEvent.response.meta.billed_units.input_tokens || 0) + (cohereEvent.response.meta.billed_units.output_tokens || 0),
                            } : undefined,
                        };
                    } else if (cohereEvent.event_type === 'text-generation' && cohereEvent.text !== undefined) { // check cohereEvent.text is not undefined
                        openAIChunk = {
                            id: generationId,
                            object: 'chat.completion.chunk',
                            created: Math.floor(Date.now() / 1000),
                            model: cohereRequestPayload.model,
                            choices: [{
                                index: 0,
                                delta: { content: cohereEvent.text }, // Can be empty string, so check for undefined previously
                                finish_reason: null,
                            }],
                        };
                    }

                    if (openAIChunk) {
                        res.write(`data: ${JSON.stringify(openAIChunk)}\n\n`);
                    }
                    if (isFinalChunk) {
                        res.write(`data: [DONE]\n\n`);
                        if (!res.writableEnded) res.end();
                        if (cohereStreamResponse.data.destroy) cohereStreamResponse.data.destroy();
                        return;
                    }
                } catch (e) {
                    console.error('Error parsing streaming line from Cohere:', e, "Line:", line);
                }
            }
          }
        });

        cohereStreamResponse.data.on('end', () => {
          if (!res.writableEnded) {
            console.warn('Cohere stream ended without a final stream-end event or res was not ended.');
            res.write(`data: [DONE]\n\n`);
            res.end();
          }
        });

        cohereStreamResponse.data.on('error', (err) => {
          console.error('Stream error from Cohere:', err);
          if (!res.writableEnded) {
            res.status(500).end(JSON.stringify({ error: 'Stream error from Cohere API' }));
          }
        });

      } catch (error) {
        console.error('Error setting up Cohere stream:', error.response ? error.response.data : error.message);
        if (!res.writableEnded) {
          res.status(500).json({
            error: 'Failed to stream from Cohere API',
            details: error.message,
            ...(error.response && { cohere_error: error.response.data }),
          });
        }
      }
    } else {
      // Handle non-streaming response
      const cohereResponse = await axios.post(
        'https://api.cohere.ai/v1/chat',
        cohereRequestPayload,
        {
          headers: {
            Authorization: `Bearer ${cohereApiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        }
      );

      let finishReason = 'stop';
      if (cohereResponse.data.finish_reason) {
        switch(cohereResponse.data.finish_reason.toUpperCase()) {
          case 'COMPLETE': finishReason = 'stop'; break;
          case 'MAX_TOKENS': finishReason = 'length'; break;
          case 'ERROR': case 'ERROR_TOXIC': case 'ERROR_LIMIT': finishReason = 'stop'; break;
          default: finishReason = 'stop';
        }
      }

      const openAIResponse = {
        id: cohereResponse.data.generation_id || 'cohere-gen-' + Date.now(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: cohereRequestPayload.model,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: cohereResponse.data.text },
          finish_reason: finishReason,
        }],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      };

      if (cohereResponse.data.meta && cohereResponse.data.meta.billed_units) {
        const bu = cohereResponse.data.meta.billed_units;
        openAIResponse.usage.prompt_tokens = bu.input_tokens || 0;
        openAIResponse.usage.completion_tokens = bu.output_tokens || 0;
        openAIResponse.usage.total_tokens = (bu.input_tokens || 0) + (bu.output_tokens || 0);
      }

      res.status(200).json(openAIResponse);
    }

  } catch (error) {
    console.error('Proxy Error:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
    const status = error.isAxiosError && error.response ? error.response.status : 500;
    const errorDetails = error.isAxiosError && error.response ? error.response.data : { message: error.message };
    
    if (!res.headersSent) {
        res.status(status).json({
            error: 'Error from API or proxy.',
            details: errorDetails,
        });
    } else {
        if (!res.writableEnded) {
            res.end();
        }
    }
  }
};