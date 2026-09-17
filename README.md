# KnowledgeVoice

**Turn your documents into an assistant that actually knows them.**

KnowledgeVoice is an AI-powered knowledge base assistant. Upload your PDFs, Word documents, and text files, then ask questions about them — by typing or by speaking — and get accurate answers grounded in your own content, with every answer showing exactly which document it came from.

---

## What problem does it solve?

Most of what people need to know is buried in documents — policy PDFs, handbooks, notes, reports — that are slow to search and easy to misremember. KnowledgeVoice reads those documents for you once, and from then on you can just *ask*. No more scrolling through a 40-page PDF to find one paragraph.

## How a user uses it

1. **Sign up** with an email and password, verify your email with a one-time code sent to your inbox, then log in. Forgot your password? Reset it the same way — a code to your email, then a new password.
2. **Upload documents** — PDF, DOCX, or TXT — to your personal Knowledge Base.
3. **Ask questions**, either by typing in the Chat tab or speaking in the Voice tab.
4. **Get an answer** grounded in your own documents, with the source cited.
5. **Come back anytime** — every conversation is saved and searchable.

## Main features

- **Knowledge Base** — upload PDF/DOCX/TXT documents; KnowledgeVoice automatically reads, cleans, and indexes them so they're ready to query within moments of uploading.
- **Chat** — ask questions in plain English and get answers with cited sources; every conversation is saved, searchable, and can be revisited or deleted.
- **Voice** — tap the microphone, ask your question out loud, watch it transcribed live, and hear the answer spoken back.
- **Voice dictation in Chat** — dictate a typed message instead of typing it, right from the chat box.
- **Accounts & privacy** — every user has their own private account, protected by an email-verification code at signup and a code-based password reset; your documents, conversations, and history are never visible to anyone else.
- **Light/dark theme** and a clean, responsive interface that works on desktop, tablet, and phone.

## How the Knowledge Base works

When you upload a document, KnowledgeVoice:

1. **Reads it** — extracting the actual text from the PDF/DOCX/TXT file.
2. **Breaks it into pieces** — splitting the text into overlapping chunks small enough to search precisely.
3. **Understands each piece** — converting each chunk into a numeric representation (an "embedding") that captures its meaning, not just its exact wording.
4. **Stores it** — safely, in your own private space, never mixed with any other user's data.

When you ask a question, KnowledgeVoice compares your question's meaning against every chunk in *your* Knowledge Base, pulls out the most relevant ones, and asks an AI model to compose an answer using only that material — citing which document(s) it drew from.

## Chat and Voice

- **Chat** is a familiar text conversation: type a question, get an answer, keep the thread going. Past conversations are listed and searchable, and you can pick up any of them again later.
- **Voice** lets you speak instead of type: press the microphone, ask naturally, and KnowledgeVoice transcribes your question, finds the answer, and reads it back out loud — with a live transcript on screen and settings for the assistant's voice, speaking speed, and volume. Every voice exchange is saved to your conversation history too, right alongside your text chats.

## Accounts, privacy, and data isolation

Every document, conversation, and message belongs to exactly one account. There is no shared or cross-account visibility anywhere in the app — every search, upload, and chat is automatically scoped to the person who's logged in. Passwords are never stored in plain text.

## How it works — the short version

```
You sign up  →  You upload documents  →  KnowledgeVoice reads & indexes them
                                                      │
You ask a question (typed or spoken)  ────────────────┘
                                                      │
KnowledgeVoice finds the relevant parts of your documents
                                                      │
An AI model writes an answer grounded in that material
                                                      │
You get an answer, with its source(s) cited, saved to your history
```

---

## For developers

The rest of this document covers how the project is built, how to run it locally, and how to deploy it.

### Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + Vite, Tailwind CSS v4 |
| Backend API | Node.js + Express 5, deployed as a Vercel serverless function |
| Database | MongoDB (Atlas or local), via Mongoose |
| Language model | OpenRouter (model-agnostic; default `openai/gpt-4o-mini`) |
| Embeddings | OpenRouter's embeddings endpoint (same account as the language model) |
| Voice transport | LiveKit (used by the separately-hosted voice worker — see [Architecture](#architecture)) |
| Speech-to-text | AssemblyAI (voice worker) / the browser's own speech recognition (Chat dictation, Voice page) |
| Text-to-speech | Deepgram Aura |
| Auth | JWT + bcrypt, with email OTP verification for signup and password reset |
| Transactional email | Brevo (transactional email HTTP API) |

### Architecture

KnowledgeVoice deploys as **one Vercel project** — the React frontend and the Express API are a single deployment from this one repository. The only piece hosted separately is a small LiveKit-based voice worker, which needs a persistent (non-serverless) process and can't run as a Vercel function.

```
                    ┌─────────────────────────────────────┐
                    │            ONE Vercel project         │
   Browser  ──────► │  React frontend (static build)        │
                    │        │  same-origin /api/*           │
                    │        ▼                               │
                    │  Express API (serverless function)    │ ──► MongoDB Atlas
                    └───────────────┬───────────────────────┘ ──► OpenRouter (LLM + embeddings)
                                    │ internal API (shared secret)
                    ┌───────────────┴───────────────┐
   LiveKit Cloud ◄──┤   voice-agent (separate host)  │ ──► AssemblyAI (speech-to-text)
                 ──►│                                 │ ──► Deepgram (text-to-speech)
                    └─────────────────────────────────┘
```

- **`frontend/`** — the React app.
- **`api/`** + **`backend/`** — the API. `api/index.js` is the Vercel Function entry point; it exports the Express app defined in `backend/src/app.js` (an Express app already satisfies Vercel's `(req, res)` function signature, so no adapter is needed). `backend/src/server.js` is a thin wrapper used only for local development.
- **`voice-agent/`** — a standalone Node worker built on LiveKit's Agents framework. It joins a LiveKit room, transcribes the caller, forwards the question to the same API the Chat page uses (so voice and text share one Knowledge Base, one conversation history, and the same per-user isolation), and speaks the answer back. This is the one component that needs a persistent host (Railway, Fly.io, a small VPS, etc.) rather than Vercel.

**Storage:** MongoDB is the single source of truth for everything in a user's Knowledge Base — extracted text, chunks, and embeddings all live there. An uploaded file is held only in memory for the duration of the upload request; it's never written to disk, so there's no persistent file storage to manage.

### Project structure

```
KnowledgeVoice/
├── api/
│   └── index.js              # Vercel Function entry point (wraps the Express app)
├── backend/
│   └── src/
│       ├── app.js            # Express app: routes, middleware
│       ├── server.js         # local-dev entry point (adds .listen())
│       ├── db.js             # MongoDB connection (cached across invocations)
│       ├── config/            # CORS and public-URL resolution
│       ├── controllers/       # request handlers
│       ├── routes/            # route definitions
│       ├── middleware/        # auth (JWT) and internal-API auth
│       ├── models/            # Mongoose schemas
│       └── services/          # AI (chat/embeddings), RAG, document processing
├── frontend/
│   └── src/
│       ├── pages/              # Chat, Knowledge Base, Voice, Login, Signup
│       ├── components/         # Sidebar, TopBar, auth forms, etc.
│       ├── context/             # auth + theme state
│       └── services/api.js      # API client
├── voice-agent/                # standalone LiveKit worker (separately hosted)
├── package.json                 # root scripts: install/build/dev for the whole project
├── vercel.json                  # routes /api/* to the Function; SPA fallback for the rest
└── API_REFERENCE.md             # full endpoint reference
```

### Local development

```bash
npm install     # installs the root, then frontend/ and backend/ automatically
npm run dev     # runs the API (nodemon, :5000) and frontend (Vite, :5173) together
```

The frontend always calls the API via same-origin-relative paths (`/api/...`) — locally, Vite's dev server proxies those to the backend, so nothing needs to be configured for this to work.

To run them separately instead:
```bash
cd backend && npm install && npm run dev     # http://localhost:5000
cd frontend && npm install && npm run dev    # http://localhost:5173
```

The voice worker is a separate process (it's not part of the Vercel deployment or `npm run dev`):
```bash
cd voice-agent
npm install
cp .env.example .env   # fill in the values below
npm run dev
```
See [`voice-agent/README.md`](voice-agent/README.md) for details and troubleshooting.

**Prerequisites:** Node.js 20+, a MongoDB database (Atlas or local), accounts with [OpenRouter](https://openrouter.ai/keys), [LiveKit Cloud](https://cloud.livekit.io), [AssemblyAI](https://www.assemblyai.com/dashboard/signup), [Deepgram](https://console.deepgram.com/signup), and [Brevo](https://app.brevo.com/settings/keys/api) (with a verified sender or authenticated domain) for sending the signup verification email.

### Environment variables

**`backend/.env`** (copy from `backend/.env.example`)

| Variable | Required | Notes |
|---|---|---|
| `MONGODB_URI` | Yes | Include the database name in the path |
| `JWT_SECRET` | Yes | Long random string |
| `JWT_EXPIRE` | No | Defaults to `7d` |
| `OPENROUTER_API_KEY` | Yes | Used for both the language model and embeddings |
| `OPENROUTER_CHAT_MODEL` | No | Defaults to `openai/gpt-4o-mini` |
| `EMBEDDING_MODEL` | No | Defaults to `openai/text-embedding-3-small` |
| `MAX_FILE_SIZE` | No | Defaults to 4MB (see [Known limitations](#known-limitations)) |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Yes | Same LiveKit Cloud project used by `voice-agent` |
| `DEEPGRAM_API_KEY` | Yes | Powers the Voice page's text-to-speech |
| `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME` | Yes | Sends the signup and password-reset email OTPs via Brevo's transactional email API — see `backend/.env.example` |
| `AGENT_SHARED_SECRET` | Yes | Must match the same value in `voice-agent/.env`; also guards the internal audit-log endpoint (see `API_REFERENCE.md`) |
| `APP_URL` / `CORS_ORIGINS` | No | Only needed for a custom domain — see `backend/.env.example` |

**`frontend/.env`** — nothing required; the frontend always calls the API same-origin.

**`voice-agent/.env`** (copy from `voice-agent/.env.example`) — `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` (same project as above), `ASSEMBLYAI_API_KEY`, `DEEPGRAM_API_KEY`, `DEEPGRAM_TTS_MODEL`, `BACKEND_URL` (the deployed API's URL), `AGENT_SHARED_SECRET` (same value as the backend's).

### Deploying

1. Push this repo to GitHub.
2. On [vercel.com](https://vercel.com): **Add New → Project** → import the repo, keeping the **Root Directory as the repo root**.
3. Set **Node.js Version** to **20.x** in Project Settings.
4. Add every backend environment variable above under **Project Settings → Environment Variables**.
5. Deploy.
6. Separately, host `voice-agent/` on any platform that runs a persistent Node.js process (Railway, Fly.io, a small VPS, etc.), and point its `BACKEND_URL` at the deployed Vercel URL. See [`voice-agent/README.md`](voice-agent/README.md).

Full endpoint-level API documentation is in [`API_REFERENCE.md`](API_REFERENCE.md).

### Known limitations

- **Uploads are capped at 4MB** — a platform limit of Vercel's serverless functions, not a setting that can be raised.
- **The Voice page speaks through the browser's own microphone and Deepgram text-to-speech**, not a live LiveKit call — the LiveKit-based `voice-agent` worker is fully built and reachable, but the Voice page doesn't yet open a LiveKit room itself. Text and voice conversations still end up in the same history either way.
- **Navigation is tab-based**, not URL-routed — there's no separate `/chat` or `/voice` address to link directly to a specific tab.
- **No dedicated Profile page** in the UI yet, though the underlying API for it exists.
- Retrieval ranks a user's document chunks in-process rather than via a dedicated vector index — fine at the scale of a personal or small-team knowledge base; a very large one would benefit from a proper vector search index.

## License

MIT
