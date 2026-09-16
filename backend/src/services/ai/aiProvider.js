const axios = require('axios');
const { keepAliveAgent } = require('../httpAgent');
const { getPublicAppUrl } = require('../../config/publicUrl');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const CHAT_MODEL = process.env.OPENROUTER_CHAT_MODEL || 'openai/gpt-4o-mini';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function buildRequest(messages, systemPrompt, temperature, maxTokens, stream) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not set');
  }

  const requestMessages = [];
  if (systemPrompt) {
    requestMessages.push({ role: 'system', content: systemPrompt });
  }
  requestMessages.push(...messages);

  return {
    body: {
      model: CHAT_MODEL,
      messages: requestMessages,
      temperature,
      max_tokens: maxTokens,
      ...(stream ? { stream: true } : {}),
    },
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': getPublicAppUrl(),
      'X-Title': 'KnowledgeVoice',
    },
  };
}

async function generateResponse(messages, systemPrompt = null, temperature = 0.7, maxTokens = 2000) {
  const { body, headers } = buildRequest(messages, systemPrompt, temperature, maxTokens, false);

  try {
    const response = await axios.post(OPENROUTER_URL, body, { headers, httpsAgent: keepAliveAgent });

    return {
      content: response.data.choices[0].message.content,
      usage: response.data.usage,
    };
  } catch (error) {
    const detail = error.response?.data?.error?.message || error.message;
    throw new Error(`LLM request failed: ${detail}`);
  }
}

// When the caller can consume the answer incrementally (the voice pipeline feeds it
// straight into text-to-speech), waiting for the whole completion before returning
// anything is dead time - the assistant can't start speaking until the very last
// token is generated. Yielding deltas lets speech start on the first sentence.
// `meta` is an out-param: token usage is only reported by the API in the final SSE
// frame, so it can't be part of the yielded values.
async function* generateResponseStream(
  messages,
  systemPrompt = null,
  temperature = 0.7,
  maxTokens = 2000,
  meta = {}
) {
  const { body, headers } = buildRequest(messages, systemPrompt, temperature, maxTokens, true);

  let response;
  try {
    response = await axios.post(OPENROUTER_URL, body, {
      headers,
      responseType: 'stream',
      httpsAgent: keepAliveAgent,
    });
  } catch (error) {
    // With responseType 'stream' the error body is itself a stream, so the usual
    // error.response.data.error.message isn't available without draining it first.
    let detail = error.message;
    const stream = error.response?.data;
    if (stream && typeof stream.on === 'function') {
      try {
        const raw = await new Promise((resolve, reject) => {
          let text = '';
          stream.on('data', (c) => { text += c.toString('utf8'); });
          stream.on('end', () => resolve(text));
          stream.on('error', reject);
        });
        detail = JSON.parse(raw)?.error?.message || raw || detail;
      } catch {
        // fall through to the plain axios message
      }
    }
    throw new Error(`LLM request failed: ${detail}`);
  }

  let buffer = '';

  for await (const chunk of response.data) {
    buffer += chunk.toString('utf8');

    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      // Blank lines separate SSE frames; ": ..." lines are keep-alive comments.
      if (!line.startsWith('data:')) continue;

      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return;

      try {
        const parsed = JSON.parse(payload);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) yield delta;
        if (parsed.usage) meta.usage = parsed.usage;
      } catch {
        // A frame split across chunk boundaries isn't valid JSON yet. It can't be
        // recovered from here because the leading "data:" was already consumed, but
        // OpenRouter does not split frames in practice - skipping is safer than
        // throwing away the rest of a working stream.
      }
    }
  }
}

module.exports = {
  generateResponse,
  generateResponseStream,
};
