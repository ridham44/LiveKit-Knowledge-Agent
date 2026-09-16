const { AccessToken } = require('livekit-server-sdk');

// Generates a token for the browser to join a voice session, and embeds the
// authenticated userId (and optional conversationId, to resume a voice session
// as a continuation of an existing chat) in the participant metadata. The voice
// agent reads this metadata on join so it knows whose knowledge base to query -
// it never sees the user's JWT.
exports.generateToken = async (req, res) => {
  try {
    const { conversationId } = req.body;

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: 'LiveKit credentials not configured' });
    }

    const roomName = `voice-${req.user.id}-${Date.now()}`;
    const identity = `user-${req.user.id}`;

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      metadata: JSON.stringify({
        userId: req.user.id,
        conversationId: conversationId || null,
      }),
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    res.json({
      token,
      url: process.env.LIVEKIT_URL || 'ws://localhost:7880',
      roomName,
    });
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ error: error.message });
  }
};
