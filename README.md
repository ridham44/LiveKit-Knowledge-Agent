# KnowledgeVoice — AI Knowledge Base Assistant

A full-stack app for uploading documents and asking questions about them — over text chat or live voice — backed by retrieval-augmented generation (RAG) and complete per-user data isolation.

## Features

- **Authentication** — signup/login with JWT, bcrypt-hashed passwords, profile management
- **Knowledge Base** — upload PDF/DOCX/TXT documents; automatic text extraction, cleaning, chunking, and embedding
- **RAG chat** — ask questions in natural language and get answers grounded in your own documents, with cited sources
- **Conversation history** — searchable list of past conversations, resume any of them, delete one or all
- **Voice chat** — talk to the assistant live over LiveKit: speech-to-text, RAG, and spoken responses, with a live transcript and a settings panel for assistant voice / speaking speed / volume
- **Voice dictation in text chat** — dictate a chat message with the browser's speech recognition instead of typing
- **Light/dark theme**, gradient brand accents, and a glassmorphism UI, fully responsive on the auth screens
- **Multi-tenant isolation** — every query, file, and conversation is scoped to its owner

## Architecture

This is **three separate processes**, not two:

```
┌─────────────┐   REST API    ┌─────────────┐
│  frontend   │◄─────────────►│   backend   │◄──── MongoDB Atlas
│ React+Vite  │               │Node/Express │◄──── OpenRouter (LLM)
└──────┬──────┘               └──────┬──────┘
       │ joins a LiveKit room        │ internal API (shared secret)
       ▼                             ▲
┌─────────────┐   dispatched by   ┌──┴──────────┐
│ LiveKit Cloud│◄─────────────────│ voice-agent │◄──── AssemblyAI (STT)
│   (rooms)    │──────────────────►│  worker     │◄──── Deepgram (TTS)
└─────────────┘   joins same room └─────────────┘
```

- **`frontend/`** — the React app (static build in production).
- **`backend/`** — the Express API: auth, file processing, RAG chat, LiveKit token issuance, and an internal endpoint the voice agent calls.
- **`voice-agent/`** — a standalone, always-running Node worker (`@livekit/agents`) that LiveKit automatically dispatches into any voice room the frontend creates. It transcribes the user (AssemblyAI), forwards the question to the backend's internal API (so voice and text share the exact same RAG pipeline, conversation history, and user isolation), and speaks the answer back (Deepgram Aura).

The voice agent is a long-running worker, not a request/response server — it needs an "always-on" host (a VM, container, or a platform's background-worker service type), the same as the backend. It can't run on a serverless/functions platform.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + Vite, Tailwind CSS v4, lucide-react icons |
| Backend | Node.js + Express 5, Mongoose 9 |
| Database | MongoDB (Atlas or local) |
| LLM | OpenRouter (model-agnostic, OpenAI-compatible; default `openai/gpt-4o-mini`) |
| Embeddings | Local, in-process (`Xenova/all-MiniLM-L6-v2` via `@huggingface/transformers`) — no API key or cost |
| Voice transport | LiveKit (Cloud or self-hosted) |
| Voice STT | AssemblyAI |
| Voice TTS | Deepgram Aura-2 |
| Auth | JWT (7-day expiry) + bcrypt |

## Project structure

```
frontend/     React app — pages, auth flow, chat/voice/knowledge-base UI
backend/      Express API — auth, files, chat/RAG, LiveKit tokens, internal voice API
voice-agent/  Standalone LiveKit worker — STT → RAG (via backend) → TTS
```

## Setup

### Prerequisites
- Node.js 18+
- A MongoDB database (Atlas recommended, or local `mongod`)
- API keys/accounts:
  - [OpenRouter](https://openrouter.ai/keys) — for chat completions
  - [LiveKit Cloud](https://cloud.livekit.io) (or a self-hosted LiveKit server) — same project's URL/key/secret used by **both** `backend` and `voice-agent`
  - [AssemblyAI](https://www.assemblyai.com/dashboard/signup) — speech-to-text for voice (free tier available)
  - [Deepgram](https://console.deepgram.com/signup) — text-to-speech for voice (free tier available)

### 1. Backend
```bash
cd backend
npm install
cp .env.example .env   # fill in the values below
npm run dev             # http://localhost:5000
```

### 2. Frontend
```bash
cd frontend
npm install
cp .env.example .env
npm run dev             # http://localhost:5173
```

### 3. Voice agent (optional — only needed for voice chat)
```bash
cd voice-agent
npm install
cp .env.example .env   # LiveKit creds must match backend/.env exactly
npm run dev
```
Leave it running alongside the backend and frontend — it has nothing to do until a browser joins a voice room, at which point LiveKit dispatches it automatically. See [`voice-agent/README.md`](voice-agent/README.md) for how a session works and troubleshooting.

### Environment variables

**`backend/.env`**
```
PORT=5000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/knowledgevoice
JWT_SECRET=<a long random string — never use the default in production>
JWT_EXPIRE=7d
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_CHAT_MODEL=openai/gpt-4o-mini
MAX_FILE_SIZE=52428800
UPLOAD_DIR=./uploads
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
FRONTEND_URL=http://localhost:5173
AGENT_SHARED_SECRET=<random string — must match voice-agent/.env>
```

**`frontend/.env`**
```
VITE_API_URL=http://localhost:5000
VITE_LIVEKIT_URL=ws://localhost:7880
```

**`voice-agent/.env`**
```
LIVEKIT_URL=wss://your-project.livekit.cloud    # same project as backend
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
ASSEMBLYAI_API_KEY=...
DEEPGRAM_API_KEY=...
DEEPGRAM_TTS_MODEL=aura-2-luna-en
BACKEND_URL=http://localhost:5000
AGENT_SHARED_SECRET=<same value as backend/.env>
```

## API reference

All routes except signup/login require `Authorization: Bearer <jwt>`.

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/signup` | Create an account |
| POST | `/api/auth/login` | Log in |
| POST | `/api/auth/logout` | Log out |
| GET | `/api/auth/me` | Current user |
| GET / PUT | `/api/users/profile` | Get / update profile |
| POST | `/api/files/upload` | Upload a document (PDF/DOCX/TXT) |
| GET | `/api/files` | List your documents |
| GET / DELETE | `/api/files/:id` | Get / delete a document |
| POST | `/api/chat` | Send a chat message, get a RAG answer with sources |
| GET | `/api/chat/conversations` | List your conversations |
| GET / DELETE | `/api/chat/conversations/:id` | Get / delete a conversation |
| POST | `/api/livekit/token` | Get a token + room name to join a voice session |
| POST | `/api/internal/voice-chat` | **Internal only** (shared-secret auth) — the voice agent's entry point into the same RAG pipeline |
| POST | `/api/internal/voice-chat-stream` | **Internal only** — same, streamed as newline-delimited JSON so speech can start on the first sentence |

## Data models

- **User** — name, email, passwordHash, gender, companyName, profileImage
- **File** — userId, fileName, fileType, fileSize, filePath, status, textContent, chunkCount
- **DocumentChunk** — userId, fileId, fileName, fileType, chunkIndex, text, embedding
- **Conversation** — userId, title, updatedAt
- **Message** — conversationId, userId, role, content, inputType (`text`/`voice`), sources

## Security

- Passwords hashed with bcrypt; JWT-based auth
- Every query is scoped to `req.user.id` — no cross-user data access
- The voice agent never sees a user's JWT; it authenticates to the backend's internal API with a separate shared secret, and learns *which* user it's serving from LiveKit room metadata, not the caller
- File upload type/size validation
- CORS restricted to `FRONTEND_URL`

## License

MIT
