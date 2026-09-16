const { retrieveRelevantChunks } = require('./retrievalService');
const { generateResponse } = require('../ai/aiProvider');

const SYSTEM_PROMPT = `You are a Knowledge Base Assistant. Your role is to answer questions based on the provided Knowledge Base context.

Important guidelines:
1. Answer questions using ONLY the provided context from the Knowledge Base.
2. Do not invent, assume, or provide information not present in the context.
3. If the answer cannot be found in the Knowledge Base, clearly state: "I couldn't find information about [topic] in your Knowledge Base."
4. Always cite the source document when using information from the Knowledge Base.
5. Be helpful, accurate, and concise.
6. If a question is unclear, ask for clarification.`;

async function answerQuestion(userId, question) {
  try {
    // Retrieve relevant chunks from knowledge base
    const relevantChunks = await retrieveRelevantChunks(userId, question, 5);

    if (relevantChunks.length === 0) {
      return {
        answer: "I couldn't find any relevant information in your Knowledge Base to answer this question. Please upload documents that might contain the answer.",
        sources: [],
        usage: null,
      };
    }

    // Build context from retrieved chunks
    const context = relevantChunks
      .map((chunk, idx) => `Document ${idx + 1} (${chunk.fileName}):\n${chunk.text}`)
      .join('\n\n---\n\n');

    // Create the messages for the LLM
    const messages = [
      {
        role: 'user',
        content: `Based on the following Knowledge Base documents, please answer this question:\n\nQuestion: ${question}\n\nKnowledge Base:\n${context}`,
      },
    ];

    // Generate response using LLM
    const result = await generateResponse(messages, SYSTEM_PROMPT, 0.7);

    // Format sources
    const sources = relevantChunks.map(chunk => ({
      fileId: chunk.fileId,
      fileName: chunk.fileName,
      fileType: chunk.fileType,
      relevantText: chunk.text.substring(0, 200) + '...',
      chunkIndex: chunk.chunkIndex,
      similarity: chunk.similarity,
    }));

    return {
      answer: result.content,
      sources,
      usage: result.usage,
    };
  } catch (error) {
    throw new Error(`RAG processing failed: ${error.message}`);
  }
}

module.exports = {
  answerQuestion,
};
