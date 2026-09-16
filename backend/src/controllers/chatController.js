const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { answerQuestion } = require('../services/rag/ragService');

exports.chat = async (req, res) => {
  try {
    const { conversationId, message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    let conversation;
    if (conversationId) {
      conversation = await Conversation.findOne({
        _id: conversationId,
        userId: req.user.id,
      });
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    } else {
      // Create new conversation
      conversation = new Conversation({
        userId: req.user.id,
        title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
      });
      await conversation.save();
    }

    // Save user message
    const userMessage = new Message({
      conversationId: conversation._id,
      userId: req.user.id,
      role: 'user',
      content: message,
      inputType: 'text',
    });
    await userMessage.save();

    // Generate AI response using RAG
    const ragResult = await answerQuestion(req.user.id, message);

    // Save AI message with sources
    const aiMessage = new Message({
      conversationId: conversation._id,
      userId: req.user.id,
      role: 'assistant',
      content: ragResult.answer,
      inputType: 'text',
      sources: ragResult.sources.map(src => ({
        fileId: src.fileId,
        fileName: src.fileName,
        fileType: src.fileType,
        relevantText: src.relevantText,
        chunkIndex: src.chunkIndex,
      })),
    });
    await aiMessage.save();

    // Update conversation timestamp
    conversation.updatedAt = new Date();
    await conversation.save();

    res.json({
      conversationId: conversation._id,
      message: aiMessage.toObject(),
      usage: ragResult.usage,
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.listConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({ userId: req.user.id })
      .sort({ updatedAt: -1 })
      .limit(50);

    res.json(conversations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const messages = await Message.find({
      conversationId: conversation._id,
    }).sort({ createdAt: 1 });

    res.json({
      conversation,
      messages,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Delete associated messages
    await Message.deleteMany({ conversationId: conversation._id });

    res.json({ message: 'Conversation deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
