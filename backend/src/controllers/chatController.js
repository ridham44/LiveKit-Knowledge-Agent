const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const chatService = require('../services/chat/chatService');

exports.chat = async (req, res) => {
  try {
    const { conversationId, message } = req.body;
    const result = await chatService.sendMessage({
      userId: req.user.id,
      message,
      conversationId,
      inputType: 'text',
    });
    res.json(result);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
};

exports.listConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({ userId: req.user.id })
      .sort({ updatedAt: -1 })
      .limit(50);

    const withPreviews = await Promise.all(
      conversations.map(async (conversation) => {
        const lastMessage = await Message.findOne({ conversationId: conversation._id })
          .sort({ createdAt: -1 })
          .select('content');

        return {
          ...conversation.toObject(),
          preview: lastMessage ? lastMessage.content.substring(0, 100) : '',
        };
      })
    );

    res.json(withPreviews);
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
