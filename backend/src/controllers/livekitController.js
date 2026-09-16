// Required lazily inside generateToken (not at module top-level) so this route's
// dependency can never affect the cold-start of every other route sharing this app -
// see the comment in services/documents/pdfService.js for the full reasoning.

// Must match the curated voice list the voice-agent actually supports
// (voice-agent/agent.js). Kept as an allowlist so arbitrary strings can't reach
// the Deepgram API call.
const ALLOWED_VOICES = new Set([
  'aura-2-asteria-en',
  'aura-2-luna-en',
  'aura-2-aurora-en',
  'aura-2-hera-en',
  'aura-2-orion-en',
  'aura-2-arcas-en',
  'aura-2-zeus-en',
  'aura-2-jupiter-en',
]);

const MIN_SPEED = 0.7;
const MAX_SPEED = 1.5;

// Generates a token for the browser to join a voice session, and embeds the
// authenticated userId (and optional conversationId, to resume a voice session
// as a continuation of an existing chat) in the participant metadata. The voice
// agent reads this metadata on join so it knows whose knowledge base to query -
// it never sees the user's JWT.
exports.generateToken = async (req, res) => {
  try {
    const { AccessToken } = require('livekit-server-sdk');
    const { conversationId, voice, speed } = req.body;

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: 'LiveKit credentials not configured' });
    }

    const roomName = `voice-${req.user.id}-${Date.now()}`;
    const identity = `user-${req.user.id}`;

    const safeVoice = ALLOWED_VOICES.has(voice) ? voice : undefined;
    const safeSpeed = Number.isFinite(speed) ? Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed)) : undefined;

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      metadata: JSON.stringify({
        userId: req.user.id,
        conversationId: conversationId || null,
        voice: safeVoice,
        speed: safeSpeed,
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
