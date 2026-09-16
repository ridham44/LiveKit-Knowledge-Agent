const axios = require('axios');
const { keepAliveAgent } = require('../httpAgent');

// Was previously a local in-process model (@huggingface/transformers running
// Xenova/all-MiniLM-L6-v2, loaded once and reused). That doesn't work reliably as a
// Vercel serverless function: loading the ONNX runtime + model weights is a multi-
// second cold-start cost against a function that also has to stay under Vercel's
// execution-time limit, the onnxruntime-node native binaries pull the function's
// bundle size uncomfortably close to Vercel's 250MB deployed-function limit once
// combined with the rest of this app's dependencies, and there's no persistent disk
// to cache the downloaded model weights between invocations (only ephemeral /tmp,
// wiped between cold starts). A remote embeddings API has none of those constraints -
// it's just an HTTP call, same shape as the OpenRouter chat calls this app already
// makes - at the cost of a small per-request latency and a paid API key.
//
// Swapping the model changes the output vector's meaning (and, for a different
// model, its length) - retrievalService.js's cosine similarity is dimension-agnostic
// and needs no changes, but any embeddings already stored under the old local model
// are not comparable to new ones and would need re-embedding. Not a concern for this
// migration since it lands as part of a fresh deploy with no production data yet.
const EMBEDDING_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const EMBEDDING_URL = 'https://api.openai.com/v1/embeddings';

// Comfortably under OpenAI's per-request input array limit (2048) - keeps each HTTP
// call's payload and duration modest rather than maximizing batch size, since this
// runs inside a time-limited serverless function alongside chunking and Mongo writes.
const BATCH_SIZE = 100;

async function embedBatch(texts) {
  if (!EMBEDDING_API_KEY) {
    throw new Error('OPENAI_API_KEY not set (required for embeddings)');
  }

  try {
    const response = await axios.post(
      EMBEDDING_URL,
      { model: EMBEDDING_MODEL, input: texts },
      {
        headers: {
          Authorization: `Bearer ${EMBEDDING_API_KEY}`,
          'Content-Type': 'application/json',
        },
        httpsAgent: keepAliveAgent,
      }
    );

    // The API returns items tagged with their input `index`, not guaranteed to be in
    // request order - sort defensively so embeddings[i] always matches texts[i].
    return response.data.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  } catch (error) {
    const detail = error.response?.data?.error?.message || error.message;
    throw new Error(`Embedding request failed: ${detail}`);
  }
}

async function generateEmbeddings(texts) {
  const embeddings = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    embeddings.push(...(await embedBatch(batch)));
  }
  return embeddings;
}

async function generateEmbedding(text) {
  const [embedding] = await generateEmbeddings([text]);
  return embedding;
}

module.exports = {
  generateEmbedding,
  generateEmbeddings,
};
