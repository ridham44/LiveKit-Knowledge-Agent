const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const { answerQuestion } = require('../rag/ragService');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Shared by the text chat endpoint and the voice agent (via the internal API) so both
// input modes go through identical retrieval, persistence, and conversation-history behavior.
async function sendMessage({ userId, message, conversationId, inputType = 'text' }) {
  if (!message || !message.trim()) {
    throw httpError(400, 'Message is required');
  }

  let conversation;
  if (conversationId) {
    conversation = await Conversation.findOne({ _id: conversationId, userId });
    if (!conversation) {
      throw httpError(404, 'Conversation not found');
    }
  } else {
    conversation = new Conversation({
      userId,
      title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
    });
    await conversation.save();
  }

  const userMessage = new Message({
    conversationId: conversation._id,
    userId,
    role: 'user',
    content: message,
    inputType,
  });
  await userMessage.save();

  const ragResult = await answerQuestion(userId, message);

  const aiMessage = new Message({
    conversationId: conversation._id,
    userId,
    role: 'assistant',
    content: ragResult.answer,
    inputType,
    sources: ragResult.sources.map(src => ({
      fileId: src.fileId,
      fileName: src.fileName,
      fileType: src.fileType,
      relevantText: src.relevantText,
      chunkIndex: src.chunkIndex,
    })),
  });
  await aiMessage.save();

  conversation.updatedAt = new Date();
  await conversation.save();

  return {
    conversationId: conversation._id,
    message: aiMessage.toObject(),
    usage: ragResult.usage,
  };
}

module.exports = {
  sendMessage,
};
