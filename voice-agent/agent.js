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
async function askKnowledgeBase({ userId, message, conversationId }) {
  const response = await fetch(`${BACKEND_URL}/api/internal/voice-chat`, {
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

  return response.json();
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

    let answer;
    if (!question) {
      answer = "Sorry, I didn't catch a question there. Could you say that again?";
    } else {
      try {
        const result = await askKnowledgeBase({
          userId: this.userId,
          message: question,
          conversationId: this.conversationId,
        });
        this.conversationId = result.conversationId;
        answer = result.message.content;
      } catch (err) {
        console.error('Knowledge base request failed:', err);
        answer = "I'm having trouble reaching your knowledge base right now. Please try again in a moment.";
      }
    }

    return new ReadableStream({
      start(controller) {
        controller.enqueue(answer);
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
        model: process.env.DEEPGRAM_TTS_MODEL || 'aura-2-luna-en',
      }),
    });

    // AssemblyAI's transcript can arrive after the default 500ms/3000ms endpointing
    // window closes, so the agent would otherwise treat the turn as empty and never
    // reply. Widen the window to give the STT round-trip enough time to land.
    const session = new voice.AgentSession({
      turnHandling: {
        endpointing: { minDelay: 1000, maxDelay: 6000 },
      },
    });
    await session.start({ agent, room: ctx.room });

    session.say("Hi! I'm your knowledge base assistant. Ask me anything about your uploaded documents.");
  },
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url) }));
}
