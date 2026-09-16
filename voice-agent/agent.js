import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { ReadableStream } from 'node:stream/web';
import { defineAgent, cli, voice, ServerOptions } from '@livekit/agents';
import * as assemblyai from '@livekit/agents-plugin-assemblyai';
import * as deepgram from '@livekit/agents-plugin-deepgram';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const AGENT_SHARED_SECRET = process.env.AGENT_SHARED_SECRET;

// Calls the same RAG pipeline the text chat uses (backend/src/services/chat/chatService.js),
// so a voice question gets identical retrieval, user isolation, and conversation-history
// behavior as typing the same question would.
//
// Uses the streaming endpoint: it emits newline-delimited JSON events as the answer is
// generated, so speech synthesis can begin on the first sentence instead of waiting for
// the entire completion. onDelta is called with each piece of answer text as it arrives.
async function askKnowledgeBase({ userId, message, conversationId, onDelta }) {
  const response = await fetch(`${BACKEND_URL}/api/internal/voice-chat-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': AGENT_SHARED_SECRET,
    },
    body: JSON.stringify({ userId, message, conversationId }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Backend request failed (${response.status}): ${body}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let newConversationId = conversationId;
  let receivedText = false;

  const handleLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      return; // ignore anything that isn't a well-formed event
    }

    if (event.type === 'delta' && event.text) {
      receivedText = true;
      onDelta(event.text);
    } else if (event.type === 'done') {
      if (event.conversationId) newConversationId = event.conversationId;
    } else if (event.type === 'error') {
      // The backend already sent 200 and started streaming before failing, so the
      // error arrives in-band rather than as an HTTP status.
      throw new Error(event.error || 'Knowledge base stream failed');
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      handleLine(line);
    }
  }
  handleLine(buffer);

  return { conversationId: newConversationId, receivedText };
}

// Overrides the framework's LLM step entirely: instead of calling an LLM provider
// directly, it forwards the transcribed question to the backend's RAG service and
// speaks back whatever answer comes back (already grounded in the user's own
// uploaded documents, with hallucination-avoidance built into the system prompt there).
class KnowledgeBaseAgent extends voice.Agent {
  constructor({ userId, conversationId, ...opts }) {
    super(opts);
    this.userId = userId;
    this.conversationId = conversationId;
  }

  async llmNode(chatCtx, _toolCtx, _modelSettings) {
    const lastUserMessage = [...chatCtx.items]
      .reverse()
      .find((item) => item.type === 'message' && item.role === 'user');
    const question = lastUserMessage?.textContent?.trim();

    if (!question) {
      return new ReadableStream({
        start(controller) {
          controller.enqueue("Sorry, I didn't catch a question there. Could you say that again?");
          controller.close();
        },
      });
    }

    const agent = this;

    // Returning the stream immediately (rather than awaiting the full answer first)
    // is what lets the framework's sentence tokenizer hand completed sentences to
    // Deepgram while the rest of the answer is still being generated.
    return new ReadableStream({
      async start(controller) {
        try {
          const result = await askKnowledgeBase({
            userId: agent.userId,
            message: question,
            conversationId: agent.conversationId,
            onDelta: (text) => controller.enqueue(text),
          });
          agent.conversationId = result.conversationId;

          if (!result.receivedText) {
            controller.enqueue("I couldn't come up with an answer for that. Could you try rephrasing?");
          }
        } catch (err) {
          console.error('Knowledge base request failed:', err);
          controller.enqueue(
            "I'm having trouble reaching your knowledge base right now. Please try again in a moment."
          );
        }
        controller.close();
      },
    });
  }
}

export default defineAgent({
  entry: async (ctx) => {
    await ctx.connect();

    const participant = await ctx.waitForParticipant();

    let metadata = {};
    try {
      metadata = JSON.parse(participant.metadata || '{}');
    } catch {
      // malformed/missing metadata handled by the userId check below
    }

    if (!metadata.userId) {
      console.error('No userId in participant metadata; refusing to serve this session.');
      ctx.shutdown('missing userId metadata');
      return;
    }

    const agent = new KnowledgeBaseAgent({
      userId: metadata.userId,
      conversationId: metadata.conversationId || undefined,
      instructions:
        "You are a voice assistant that answers questions using the user's private knowledge base. " +
        'Keep spoken answers concise and conversational.',
      stt: new assemblyai.STT({
        apiKey: process.env.ASSEMBLYAI_API_KEY,
      }),
      tts: new deepgram.TTS({
        apiKey: process.env.DEEPGRAM_API_KEY,
        model: metadata.voice || process.env.DEEPGRAM_TTS_MODEL || 'aura-2-luna-en',
        // Deepgram's valid range is 0.7-1.5; the backend already clamps this before
        // it reaches participant metadata, but re-clamping here is cheap insurance.
        speed: Number.isFinite(metadata.speed) ? Math.min(1.5, Math.max(0.7, metadata.speed)) : 1.0,
      }),
    });

    // AssemblyAI's transcript can arrive after the default 500ms/3000ms endpointing
    // window closes, so the agent would otherwise treat the turn as empty and never
    // reply. Widen the window to give the STT round-trip enough time to land.
    // turnDetection is pinned to 'stt' (AssemblyAI's own end-of-utterance signal)
    // instead of the auto-provisioned hosted turn detector, which requires an extra
    // websocket connection to LiveKit's inference service that has been timing out
    // in this environment and adding to session startup latency.
    // vad is explicitly disabled: the auto-provisioned local Silero VAD model's
    // inference fell tens of seconds behind realtime on this machine ("VAD inference
    // is slower than realtime"), corrupting audio timing and STT accuracy for the
    // whole session. STT-based turn detection above doesn't need it.
    const session = new voice.AgentSession({
      vad: null,
      turnHandling: {
        turnDetection: 'stt',
        // 700ms still comfortably covers AssemblyAI's observed transcript lag
        // (typically under 300ms in testing) while shaving noticeable wait time
        // off every turn compared to the original 1000ms.
        endpointing: { minDelay: 700, maxDelay: 4000 },
      },
    });
    // record: false turns off session audio recording and the cloud tracer. Those
    // spawn an FFmpeg encoder and upload a session report for every call - pure
    // overhead here, and on a CPU-contended machine it directly competes with audio
    // and turn handling (the logs showed recorder tasks alongside "event loop
    // blocked" warnings). Nothing in this app consumes those recordings.
    await session.start({ agent, room: ctx.room, record: false });

    // No spoken greeting: session.say() here would still be playing when the user's
    // first question arrives (it takes several seconds), and a user turn that
    // interrupts in-progress agent speech gets silently dropped instead of answered
    // (framework logs "speech interrupted, new user turn detected" and never routes
    // it to a new response). Staying silent until the user speaks avoids that entirely
    // for the always-vulnerable first turn.
  },
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli.runApp(
    new ServerOptions({
      agent: fileURLToPath(import.meta.url),
      // Default (10s) is too short on this machine - job/idle process startup
      // (loading STT/TTS plugins, ONNX turn-detector, etc.) was consistently
      // timing out and killing real sessions with "runner initialization timed out".
      initializeProcessTimeout: 60_000,
      // THE most important latency setting here. `dev` mode defaults this to 0, so
      // every call spawned a completely cold Node process - loading the agents
      // framework, both plugins and the ONNX runner before it could even join the
      // room. Measured at ~22s from "received job request" to "job started", with
      // AssemblyAI's socket not connecting until ~50s in, by which point the user had
      // given up and hung up (so nothing was ever transcribed and no reply was ever
      // spoken). Production mode's default is min(cpus, 4) prewarmed processes, which
      // previously starved this machine of CPU. One warm process is the middle
      // ground: a job starts instantly, without a pool competing for cores.
      numIdleProcesses: 1,
    })
  );
}
