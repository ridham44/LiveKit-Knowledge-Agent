const DocumentChunk = require('../../models/DocumentChunk');
const { generateEmbedding } = require('../ai/embeddingService');

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

async function retrieveRelevantChunks(userId, query, topK = 5) {
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    // Get all chunks for this user
    const chunks = await DocumentChunk.find({ userId })
      .select('text fileId fileName fileType chunkIndex embedding');

    if (chunks.length === 0) {
      return [];
    }

    // Calculate similarity scores
    const scoredChunks = chunks.map(chunk => ({
      ...chunk.toObject(),
      similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
    }));

    // Sort by similarity and return top K
    return scoredChunks
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .map(({ embedding, ...rest }) => rest); // Remove embedding from response
  } catch (error) {
    throw new Error(`Retrieval failed: ${error.message}`);
  }
}

module.exports = {
  retrieveRelevantChunks,
};
