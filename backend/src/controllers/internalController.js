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

// Same thing, streamed as newline-delimited JSON. The voice agent pipes these deltas
// straight into text-to-speech, so the assistant starts speaking as soon as the first
// sentence exists rather than after the whole answer has been generated.
exports.voiceChatStream = async (req, res) => {
  const { userId, message, conversationId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // Tells nginx and similar proxies not to buffer the response, which would defeat
  // the entire point of streaming it.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    for await (const event of chatService.sendMessageStream({
      userId,
      message,
      conversationId,
      inputType: 'voice',
      voice: true,
    })) {
      res.write(JSON.stringify(event) + '\n');
    }
  } catch (error) {
    console.error('Internal voice chat stream error:', error);
    // Headers are already sent, so the failure has to be reported in-band rather
    // than as an HTTP status - the agent turns this into a spoken fallback.
    res.write(JSON.stringify({ type: 'error', error: error.message }) + '\n');
  }

  res.end();
};
