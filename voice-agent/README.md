# Voice Agent

The LiveKit voice worker: **STT (AssemblyAI) → Knowledge Base RAG (via the Node backend) → TTS (Deepgram Aura)**.

This is a separate Node.js process from `backend/`. It connects directly to your LiveKit Cloud
project (using `@livekit/agents`) and automatically joins any voice room the frontend creates. It
does not touch MongoDB or run any AI itself for answers - it forwards each transcribed question to
the backend's internal API (`POST /api/internal/voice-chat-stream`), which runs the exact same RAG
pipeline (retrieval + OpenRouter LLM) as the text chat, so voice and text share one Knowledge Base,
one conversation history, and one set of user-isolation guarantees.

The backend streams the answer back as newline-delimited JSON, and the worker feeds those pieces
into Deepgram as they arrive. That means speech starts on the first finished sentence instead of
after the whole answer is generated - the difference between speaking at ~1.5s and sitting silent
for 15s on a long answer.

## How a session works

1. Frontend calls `POST /api/livekit/token` on the backend. The backend generates a room name,
   embeds `{ userId, conversationId }` as the browser participant's metadata, and returns a token.
2. Frontend connects to that LiveKit room and publishes its microphone.
3. This worker is registered with the same LiveKit project and automatically gets dispatched into
   that room too (default LiveKit Agents behavior - no explicit dispatch needed).
4. The worker reads the browser participant's metadata to learn `userId`, transcribes their speech
   with AssemblyAI, sends the finalized question to the backend's internal API, and speaks the
   answer back with Deepgram Aura.
5. Every turn is saved to the same `Conversation`/`Message` collections the text chat uses (tagged
   `inputType: "voice"`), so it shows up in chat history automatically.

## Setup

```bash
cd voice-agent
npm install
cp .env.example .env   # then fill in the values below
```

### Required environment variables

| Variable | Where to get it |
|---|---|
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Same LiveKit Cloud project as `backend/.env` - copy the exact same values |
| `ASSEMBLYAI_API_KEY` | https://www.assemblyai.com/dashboard/signup (free tier available) |
| `DEEPGRAM_API_KEY` | https://console.deepgram.com/signup (free tier available) |
| `BACKEND_URL` | URL of the running Node backend, e.g. `http://localhost:5000` |
| `AGENT_SHARED_SECRET` | Must exactly match `AGENT_SHARED_SECRET` in `backend/.env` |

## Running

```bash
npm run dev     # node agent.js dev   - connects to LiveKit and waits for jobs, verbose logging
npm run start   # node agent.js start - same, production logging
```

Leave this running alongside the backend and frontend. It has nothing to do until a browser
connects to a voice room, at which point it's automatically dispatched.

## Troubleshooting

**`Unexpected server response: 401` on startup, retrying repeatedly**
The worker's own `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` don't authenticate against `LIVEKIT_URL`.
This is a LiveKit Cloud project/key mismatch, not an application bug - go to your LiveKit Cloud
dashboard for that exact project, open Settings → Keys, and copy a fresh key/secret pair (and the
matching project URL) into both `voice-agent/.env` and `backend/.env`.

**Agent never joins the room / user just hears silence**
- Confirm this worker is actually running (`npm run dev`) and logged a successful connection.
- Confirm `backend/.env` and `voice-agent/.env` point at the *same* LiveKit project.
- Check this process's logs for `Knowledge base request failed` - that means it reached LiveKit
  fine but couldn't reach `BACKEND_URL` or the `AGENT_SHARED_SECRET` didn't match.

**Agent joins but never speaks**
Check `DEEPGRAM_API_KEY` is valid. Check `ASSEMBLYAI_API_KEY` is valid if it never seems to
transcribe anything.

**Long delay before the agent joins, then it never hears anything**
Look for the gap between `received job request` and `job started` in the logs. If it's tens of
seconds, the worker is spawning a cold process per call. `numIdleProcesses` controls this and
**defaults to 0 in `dev` mode**, so every call pays full startup: loading the framework, both
plugins, and the ONNX runner before it can even join the room. This was measured at ~22s to start
the job and ~50s before AssemblyAI's socket connected - long enough that the caller hangs up first,
which looks exactly like "the agent never replies" because nothing was ever transcribed.

`agent.js` pins `numIdleProcesses: 1`, keeping one warm process ready. Don't rely on production
mode for this instead: its default is `min(cpuCount, 4)` prewarmed processes, which starves a
constrained machine of CPU and reintroduces the lag from the other direction.

**`event loop blocked` / `process not scheduled` warnings**
CPU contention on the host, not a bug in this code. Session recording is already disabled
(`record: false` in `session.start`) because it spawns an FFmpeg encoder per call. If the warnings
persist, close other heavy processes while testing - they delay audio and turn handling directly.
