const axios = require('axios');
const { keepAliveAgent } = require('../services/httpAgent');

const DEEPGRAM_URL = 'https://api.deepgram.com/v1/speak';

// Must match the list the frontend offers and the allowlist in livekitController.
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

const DEFAULT_VOICE = 'aura-2-luna-en';
// Deepgram rejects anything outside this range.
const MIN_SPEED = 0.7;
const MAX_SPEED = 1.5;
// One spoken sentence at a time; anything longer is a sign of misuse and would cost
// a large synthesis job on a shared API key.
const MAX_TEXT_LENGTH = 1000;

// Synthesizes a chunk of the assistant's answer so the browser can play it. Proxied
// through the backend rather than called from the browser so the Deepgram key is
// never exposed to the client.
exports.speak = async (req, res) => {
  try {
    const { text, voice, speed } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'text is required' });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({ error: `text must be ${MAX_TEXT_LENGTH} characters or fewer` });
    }
    if (!process.env.DEEPGRAM_API_KEY) {
      return res.status(500).json({ error: 'DEEPGRAM_API_KEY is not configured on the server' });
    }

    const model = ALLOWED_VOICES.has(voice) ? voice : DEFAULT_VOICE;
    const rate = Number.isFinite(speed)
      ? Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed))
      : 1.0;

    // Opus in an Ogg container measured fastest and smallest against this Deepgram
    // account: ~1.3s and 7KB for a sentence, versus ~1.8s and 22KB for mp3. Both the
    // round trip and the download sit directly in front of the user hearing anything,
    // so this is the encoding to use. Ogg/Opus playback needs Chrome, Firefox or Edge,
    // which the Voice page already requires for its speech recognition anyway.
    const response = await axios.post(
      DEEPGRAM_URL,
      { text },
      {
        params: { model, encoding: 'opus', container: 'ogg', speed: rate },
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
        // Reuses the TLS connection across turns; worth ~700ms per request here.
        httpsAgent: keepAliveAgent,
      }
    );

    res.setHeader('Content-Type', 'audio/ogg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(response.data));
  } catch (error) {
    // With responseType arraybuffer the error body is a Buffer, not parsed JSON.
    let detail = error.message;
    if (error.response?.data) {
      try {
        detail = JSON.parse(Buffer.from(error.response.data).toString('utf8')).err_msg || detail;
      } catch {
        // keep the axios message
      }
    }
    console.error('TTS error:', detail);
    res.status(error.response?.status || 500).json({ error: `Speech synthesis failed: ${detail}` });
  }
};
