const axios = require('axios');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const CHAT_MODEL = process.env.OPENROUTER_CHAT_MODEL || 'openai/gpt-4o-mini';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function generateResponse(messages, systemPrompt = null, temperature = 0.7) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not set');
  }

  const requestMessages = [];
  if (systemPrompt) {
    requestMessages.push({
      role: 'system',
      content: systemPrompt,
    });
  }
  requestMessages.push(...messages);

  try {
    const response = await axios.post(OPENROUTER_URL, {
      model: CHAT_MODEL,
      messages: requestMessages,
      temperature,
      max_tokens: 2000,
    }, {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
        'X-Title': 'KnowledgeVoice',
      },
    });

    return {
      content: response.data.choices[0].message.content,
      usage: response.data.usage,
    };
  } catch (error) {
    const detail = error.response?.data?.error?.message || error.message;
    throw new Error(`LLM request failed: ${detail}`);
  }
}

module.exports = {
  generateResponse,
};
