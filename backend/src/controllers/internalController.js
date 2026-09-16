const chatService = require('../services/chat/chatService');

// Called by the voice agent worker after it transcribes a finalized user turn.
// userId comes from the room/participant metadata the agent read on join (set by
// livekitController.generateToken), not from a JWT - the agent has no user session.
exports.voiceChat = async (req, res) => {
  try {
    const { userId, message, conversationId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await chatService.sendMessage({
      userId,
      message,
      conversationId,
      inputType: 'voice',
    });

    res.json(result);
  } catch (error) {
    console.error('Internal voice chat error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
};
