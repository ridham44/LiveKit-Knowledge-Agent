let embedderPromise = null;

async function getEmbedder() {
  if (!embedderPromise) {
    const { pipeline } = await import('@huggingface/transformers');
    embedderPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embedderPromise;
}

async function generateEmbedding(text) {
  const embeddings = await generateEmbeddings([text]);
  return embeddings[0];
}

async function generateEmbeddings(texts) {
  const embedder = await getEmbedder();
  const embeddings = [];

  for (const text of texts) {
    const output = await embedder(text, { pooling: 'mean', normalize: true });
    embeddings.push(Array.from(output.data));
  }

  return embeddings;
}

module.exports = {
  generateEmbedding,
  generateEmbeddings,
};
