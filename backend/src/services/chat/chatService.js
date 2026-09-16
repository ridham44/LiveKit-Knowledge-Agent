const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const { answerQuestion, answerQuestionStream } = require('../rag/ragService');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function resolveConversation({ userId, message, conversationId }) {
  if (conversationId) {
    const existing = await Conversation.findOne({ _id: conversationId, userId });
    if (!existing) {
      throw httpError(404, 'Conversation not found');
    }
    return existing;
  }

  const conversation = new Conversation({
    userId,
    title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
  });
  await conversation.save();
  return conversation;
}

function toSourceDocs(sources) {
  return sources.map(src => ({
    fileId: src.fileId,
    fileName: src.fileName,
    fileType: src.fileType,
    relevantText: src.relevantText,
    chunkIndex: src.chunkIndex,
  }));
}

// Shared by the text chat endpoint and the voice agent (via the internal API) so both
// input modes go through identical retrieval, persistence, and conversation-history
// behavior.
async function sendMessage({ userId, message, conversationId, inputType = 'text' }) {
  if (!message || !message.trim()) {
    throw httpError(400, 'Message is required');
  }

  const conversation = await resolveConversation({ userId, message, conversationId });

  const userMessage = new Message({
    conversationId: conversation._id,
    userId,
    role: 'user',
    content: message,
    inputType,
  });

  // Persisting the user's message doesn't need to finish before RAG starts - they're
  // independent, so run them concurrently instead of paying for both round-trips
  // back-to-back on every turn's critical path.
  const [, ragResult] = await Promise.all([
    userMessage.save(),
    answerQuestion(userId, message),
  ]);

  const aiMessage = new Message({
    conversationId: conversation._id,
    userId,
    role: 'assistant',
    content: ragResult.answer,
    inputType,
    sources: toSourceDocs(ragResult.sources),
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

// Streaming variant used by the voice agent. Yields `{type:'delta'}` events as the
// answer is generated so speech synthesis can start on the first sentence instead of
// after the entire completion, then a final `{type:'done'}` with the metadata the
// caller needs. All database writes happen off the critical path: the user message
// save is not awaited before generation starts, and the assistant message is written
// only after the last delta has been handed to the caller.
async function* sendMessageStream({ userId, message, conversationId, inputType = 'voice', voice = true }) {
  if (!message || !message.trim()) {
    throw httpError(400, 'Message is required');
  }

  const conversation = await resolveConversation({ userId, message, conversationId });

  const userMessage = new Message({
    conversationId: conversation._id,
    userId,
    role: 'user',
    content: message,
    inputType,
  });

  // Started but deliberately not awaited - a slow write here would delay the spoken
  // reply. Failing to record one history row shouldn't cost the user their answer,
  // so it's logged rather than thrown. The catch also keeps it from surfacing as an
  // unhandled rejection if generation below throws first.
  const userMessageSave = userMessage.save().catch((err) => {
    console.error('Failed to persist user message:', err.message);
  });

  const meta = {};
  let answer = '';

  for await (const delta of answerQuestionStream(userId, message, { voice, meta })) {
    answer += delta;
    yield { type: 'delta', text: delta };
  }

  const aiMessage = new Message({
    conversationId: conversation._id,
    userId,
    role: 'assistant',
    content: answer,
    inputType,
    sources: toSourceDocs(meta.sources || []),
  });

  conversation.updatedAt = new Date();

  await Promise.all([userMessageSave, aiMessage.save(), conversation.save()]);

  yield {
    type: 'done',
    conversationId: String(conversation._id),
    messageId: String(aiMessage._id),
    usage: meta.usage ?? null,
  };
}

module.exports = {
  sendMessage,
  sendMessageStream,
};
