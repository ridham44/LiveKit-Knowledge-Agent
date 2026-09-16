const DocumentChunk = require('../../models/DocumentChunk');
const { generateEmbedding } = require('../ai/embeddingService');

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'of', 'in', 'on', 'at', 'for',
  'to', 'what', 'when', 'where', 'who', 'how', 'why', 'and', 'or', 'do', 'does',
  'my', 'your', 'our', 'this', 'that', 'with', 'about',
]);

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

// Fraction of meaningful query terms that literally appear in the chunk text.
// Small local embedding models often fail to rank an exact-fact chunk above
// generic/noisy ones in repetitive documents (e.g. tables) - this keyword
// signal compensates by rewarding literal term matches.
function keywordOverlapScore(query, text) {
  const tokens = query.toLowerCase().match(/[a-z0-9]+/g) || [];
  const meaningful = tokens.filter(t => t.length > 2 && !STOPWORDS.has(t));

  if (meaningful.length === 0) {
    return 0;
  }

  const lowerText = text.toLowerCase();
  const hits = meaningful.filter(t => lowerText.includes(t)).length;
  return hits / meaningful.length;
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

    // Hybrid score: semantic similarity + literal keyword overlap
    const scoredChunks = chunks.map(chunk => {
      const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
      const keywordScore = keywordOverlapScore(query, chunk.text);
      return {
        ...chunk.toObject(),
        similarity,
        score: similarity * 0.5 + keywordScore * 0.5,
      };
    });

    // Sort by hybrid score and return top K
    return scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ embedding, score, ...rest }) => rest); // Remove embedding from response
  } catch (error) {
    throw new Error(`Retrieval failed: ${error.message}`);
  }
}

module.exports = {
  retrieveRelevantChunks,
};
