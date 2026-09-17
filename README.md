# KnowledgeVoice — AI Knowledge Base Assistant

A full-stack app for uploading documents and asking questions about them — over text chat or live voice — backed by retrieval-augmented generation (RAG) and complete per-user data isolation.

Deploys as **one Vercel project**: the React frontend and the Express API (as Vercel Functions) are a single deployment from this one repository. The only exception is `voice-agent/`, a long-running LiveKit worker that needs a persistent host and can't run as a serverless function — see [Voice agent worker](#voice-agent-worker) below.

## Features

- **Authentication** — signup/login with JWT, bcrypt-hashed passwords, profile management
- **Knowledge Base** — upload PDF/DOCX/TXT documents; automatic text extraction, cleaning, chunking, and embedding
- **RAG chat** — ask questions in natural language and get answers grounded in your own documents, with cited sources
- **Conversation history** — searchable list of past conversations, resume any of them, delete one or all
- **Voice chat** — speak your question, watch it appear as text as you talk, and hear the answer spoken back, with a live transcript and a settings panel for assistant voice / speaking speed / volume
- **Voice dictation in text chat** — dictate a chat message with the browser's speech recognition instead of typing
- **Light/dark theme**, gradient brand accents, and a glassmorphism UI, fully responsive from 320px mobile through tablet to desktop — sidebar and conversation list become off-canvas drawers below the `md` breakpoint (768px), reverting to the original always-visible columns above it
- **Multi-tenant isolation** — every query, file, and conversation is scoped to its owner

> **Note on navigation:** the app is a single-page tab switcher (Chat / Knowledge Base / Voice), not URL-based routing — there's no React Router and no distinct `/chat`, `/knowledge-base`, `/voice`, `/profile` URLs today, everything lives at `/`. A catch-all SPA rewrite is still configured (see `vercel.json`) so any direct URL loads the app shell correctly rather than 404ing, but it won't auto-select a tab from the URL. There's also no Profile *page* in the UI yet, even though the backend has `/api/users/profile` — see [Known limitations](#known-limitations).

## Architecture

```
                         ┌───────────────────────────────────────┐
                         │           ONE Vercel project           │
                         │                                         │
   Browser  ───────────► │  frontend/ (static build)              │
                         │       │                                 │
                         │       │  same-origin /api/*             │
                         │       ▼                                 │
                         │  api/index.js  ──►  backend/src/app.js  │ ◄── MongoDB Atlas
                         │  (Vercel Function, wraps Express)       │ ◄── OpenRouter (LLM + embeddings)
                         └───────────────┬─────────────────────────┘
                                         │ internal API (shared secret)
                                         ▲
                         ┌───────────────┴─────────────┐
   LiveKit Cloud  ◄──────┤       voice-agent/           │
   (rooms)        ──────►│  separately-hosted worker     │ ◄── AssemblyAI (STT)
                         └───────────────────────────────┘ ◄── Deepgram (TTS)
```

- **`frontend/`** — the React app (Vite build, static output).
- **`api/index.js`** — the Vercel serverless function every `/api/*` request is routed to. It's a thin wrapper that exports the Express app from `backend/src/app.js` directly — Vercel's Node runtime accepts any `(req, res)` handler, and an Express app satisfies that signature, so no adapter package is needed. See [Backend → Vercel Functions](#backend--vercel-functions).
- **`backend/`** — the Express app itself: auth, file processing, RAG chat, LiveKit token issuance, and an internal endpoint the voice agent calls. `backend/src/server.js` is a thin wrapper around the same app for local dev (`.listen()` on a port); Vercel never runs that file.
- **`voice-agent/`** — a standalone, always-running Node worker (`@livekit/agents`) that LiveKit automatically dispatches into any voice room the frontend creates. It transcribes the user (AssemblyAI), forwards the question to the backend's internal API (so voice and text share the exact same RAG pipeline, conversation history, and user isolation), and speaks the answer back (Deepgram Aura). This is the one piece that stays separately hosted — see below.

**Storage:** MongoDB is the persistent source of truth for everything in the Knowledge Base — extracted text, chunks, and embeddings all live there. An uploaded PDF/DOCX/TXT file is held **only in memory** for the duration of the upload request (`multer.memoryStorage()`) — it's never written to disk at all, in dev or production. Text extraction, chunking, and embedding all happen synchronously within that same request, and the buffer is discarded once the request completes. See [File upload & processing](#file-upload--processing) for why this changed from the original disk-based, fire-and-forget design.

## Backend → Vercel Functions

The Express app (`backend/src/app.js`) is deployed as a **single Vercel Function** (`api/index.js`), not one function per route. `vercel.json` rewrites every `/api/*` request to that function while preserving the original path, so Express's own router still sees `/api/auth/login`, `/api/chat/stream`, etc. exactly as it always did — all existing routes, controllers, middleware, and response shapes are unchanged.

This is the standard "Express on Vercel" adapter pattern: Vercel's Node.js runtime invokes any exported `(req, res) => {}` handler per request, and an Express `app` instance already has that signature, so `module.exports = app` works with no `serverless-http` or similar package. The process never calls `app.listen()` in this path — Vercel invokes the handler directly and reuses the warm module (and its cached MongoDB connection / keep-alive HTTP agent, see `backend/src/db.js`) across nearby invocations of the same function instance, without ever binding a port or running as a long-lived server.

`backend/src/server.js` is kept as a separate, thin entry point purely for local development (and any traditional/long-lived hosting, if you ever want it) — it imports the same `app.js` and adds `.listen()` plus process-lifecycle signal handling that would be actively harmful inside a serverless invocation (see the comments in that file).

**MongoDB connection readiness:** every DB-touching route sits behind a middleware that explicitly `await`s `connectDB()` (`backend/src/db.js`) before proceeding, rather than relying solely on Mongoose's own command buffering. On a cold start the connection itself (DNS + TLS + Atlas handshake) can occasionally take close to Mongoose's default 10s buffering timeout — losing that race is what caused a real production error (`Operation conversations.insertOne() buffering timed out after 10000ms`) with no useful detail attached. The explicit await turns that into either an instant pass-through (already connected, the common case on a warm invocation) or one clear `503`. `/health` and `/api/health` are registered *before* this gate, so they still answer even if MongoDB itself is unreachable.

## File upload & processing

Vercel Functions have no persistent/writable project filesystem — only a small ephemeral `/tmp` that's wiped between cold starts — and a serverless function isn't guaranteed to keep running after it responds, so the original design (write to `./uploads`, respond immediately with `status: 'pending'`, extract/chunk/embed in the background) can't work reliably there. The upload flow changed to:

```
User uploads PDF/DOCX/TXT
        ↓
Vercel Function receives it into memory (multer.memoryStorage(), never touches disk)
        ↓
Extract text → clean → chunk → generate embeddings (OpenRouter API)   — all awaited, in-request
        ↓
Store document metadata/text/chunks/embeddings in MongoDB
        ↓
Buffer is discarded (garbage collected) when the request ends — never persisted anywhere
        ↓
Response returns the FINAL status ('processed' or 'failed'), not a placeholder
        ↓
Future RAG requests read only from MongoDB — never depend on the original file existing
```

This is a genuine, necessary behavior change, not a cosmetic one: uploads now take as long as full processing (a few seconds for a typical document), and the response is honest about the outcome — a small UX improvement over the original, which returned `'pending'` immediately with no mechanism to ever learn the real outcome without a page refresh.

**Upload size:** capped at **4MB** by default (`MAX_FILE_SIZE`, see `backend/.env.example`). This isn't an arbitrary choice — Vercel Functions hard-cap the total request body at **4.5MB at the platform level**; no application setting can raise that ceiling. The original 50MB limit is not achievable on Vercel with a direct-upload flow. If you need larger documents, the redesign required is a client-side direct-to-blob-storage upload (e.g. Vercel Blob's client upload API), with the function only handling a small "process this already-uploaded blob" call — that's a larger architectural change and was intentionally **not** implemented here to avoid rewriting a feature that wasn't asked to be redesigned; flagging it here so it isn't mistaken for an oversight.

**Processing time:** the Vercel Function is configured for `maxDuration: 60` seconds (`vercel.json`) — the maximum allowed on Vercel's Hobby plan (Pro allows up to 300s, or more with Fluid Compute) — to give extraction + chunking + embedding enough headroom for a multi-page document. A single very large or slow-to-parse document could still exceed this; if you hit that in practice, either raise `maxDuration` (Pro plan) or reduce document size.

## Embeddings: why the local model was replaced

The original embedding step ran **locally, in-process**: `@huggingface/transformers` running `Xenova/all-MiniLM-L6-v2`, loaded once into memory and reused. That doesn't run reliably as a Vercel serverless function, for three independent reasons:

1. **Cold-start cost.** Loading the ONNX runtime and model weights takes multiple seconds the first time — directly inside a request that also has to finish other work (chunking, DB writes) within Vercel's execution-time limit.
2. **Bundle size.** `onnxruntime-node`'s prebuilt native binaries push the function's deployed bundle size uncomfortably close to Vercel's 250MB-unzipped-per-function limit once combined with the rest of this app's dependencies.
3. **No persistent cache directory.** The model's weights need to be downloaded and cached somewhere; Vercel Functions only offer ephemeral `/tmp` (wiped between cold starts, not shared across instances), so every cold start would effectively re-download the model — worse than the first point above, repeatedly.

**What changed:** `backend/src/services/ai/embeddingService.js` now calls **OpenRouter's `/embeddings` endpoint** (`openai/text-embedding-3-small` by default, configurable via `EMBEDDING_MODEL`) over HTTPS, batched (up to 100 chunks per request) to keep the number of round trips down. This reuses the **same `OPENROUTER_API_KEY`** already required for chat — no separate provider, key, or billing account needed. (An earlier version of this migration called OpenAI directly and required a second `OPENAI_API_KEY`; that was replaced once it turned out OpenRouter offers an OpenAI-compatible embeddings endpoint on the same account.)

**What stayed the same:** the RAG architecture is unchanged. `retrievalService.js`'s cosine-similarity ranking and keyword-overlap scoring are dimension-agnostic and needed zero changes — they work the same way regardless of which model produced the vectors. The chunking strategy, the "full context under 20 chunks" retrieval behavior, the LLM call, and the streaming response format are all untouched.

**Not preserved across this migration:** vectors from the old local model and the new remote model are not comparable (different model, different geometry). This only matters if you already had production data under the old model — there was none at the time of this migration, so no re-embedding step was needed. If you ever change `EMBEDDING_MODEL` later, existing `DocumentChunk` embeddings would need to be regenerated (re-upload the affected files) before search quality is reliable again.

## PDF text extraction on Vercel

Uploading a PDF originally worked locally and failed in production with `PDF extraction failed: DOMMatrix is not defined` — a second Vercel-specific compatibility issue, unrelated to embeddings, worth documenting since it wasn't obvious from local testing.

**What was happening:** extraction used the `pdf-parse` package (v2), which wraps `pdfjs-dist` and optionally `@napi-rs/canvas` (a native binary). It turns out `pdf-parse`'s `getText()` doesn't do *plain* text-layer extraction — it also exercises `pdfjs-dist`'s canvas-based page-rendering/glyph-painting code internally (`paintChar`, `Path2D`, `DOMMatrix.invertSelf`/`multiplySelf`), which needs a working 2D canvas implementation. That native canvas binding doesn't provide a working `DOMMatrix` on Vercel's runtime — a known class of problem for native canvas/graphics bindings on Lambda-like serverless runtimes (a missing shared library, or the platform-specific binary not surviving the function's dependency bundling).

**Fix, in two parts** (`backend/src/services/documents/pdfService.js`):
1. **Bypass `pdf-parse`'s wrapper entirely** and call `pdfjs-dist` directly via `getDocument()` + `page.getTextContent()` — the standard, canvas-free way most Node.js tooling extracts PDF text; it walks the content stream's text-showing operators directly and never touches rendering. `pdfjs-dist` still *optionally* tries to load `@napi-rs/canvas` at import time (for page-rendering features this code never calls) but degrades gracefully with a warning if that fails, rather than throwing.
2. That alone wasn't sufficient: `pdfjs-dist` still has a module-level `const SCALE_MATRIX = new DOMMatrix();` that runs unconditionally at import time, plus a few reachable code paths call `.translate()`/`.scale()`/`.invertSelf()`/`.multiplySelf()`/`.preMultiplySelf()` on `DOMMatrix` instances even during plain text extraction. `backend/src/services/documents/pdfCanvasPolyfills.js` provides a small, spec-correct pure-JS 2D affine `DOMMatrix` implementation covering exactly those methods (verified against `pdfjs-dist`'s own bundled matrix-multiply formula), installed only if nothing has already provided a working one — so normal local dev (where `@napi-rs/canvas` loads fine) is unaffected.

**A third, separate issue** surfaced once the above was fixed: `Cannot find module '.../pdf.worker.mjs'`. `pdfjs-dist` loads its worker via `await import(this.workerSrc)`, where `workerSrc` is a runtime string, not a static import specifier — Vercel's function bundler (`@vercel/nft`) only includes files it can trace through *static* `require()`/`import()` calls, so this dynamic import is invisible to it and the worker file silently didn't make it into the deployed bundle, even though it exists in `node_modules` at build time. Fixed by calling `require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')` before it's needed — a literal string argument the bundler's static analysis *does* recognize and trace, forcing the file's inclusion — and pointing `GlobalWorkerOptions.workerSrc` at that resolved path (converted to a `file://` URL via `pathToFileURL`, since Node's ESM dynamic import rejects a bare Windows-style absolute path, which matters for local dev on Windows).

**Net dependency change:** `pdf-parse` (which pulled in `@napi-rs/canvas`, a native binary) was replaced with `pdfjs-dist` directly, used in a canvas-free way. `@napi-rs/canvas` remains an *optional* dependency of `pdfjs-dist` itself — it may still appear in `node_modules` locally, but nothing in this codebase requires it, so it should never be traced into the deployed function bundle.

## Voice agent worker

`voice-agent/` is a long-running LiveKit Agents worker — it stays connected to a LiveKit Cloud project and waits to be dispatched into rooms. **This cannot run as a Vercel Function**; Vercel serverless functions are stateless, ephemeral, and time-limited (even at their most generous), and this worker is the opposite of all three by design. It must be deployed to something that runs a persistent Node.js process instead — Railway, Fly.io, a Render Background Worker, a small VPS, or any other host that keeps a long-running Node.js process alive. `agent.js` doesn't listen on a port or need inbound traffic; it only needs outbound network access to reach LiveKit Cloud and this Vercel deployment's `/api/internal/*` routes. See [`voice-agent/README.md`](voice-agent/README.md) for setup and environment variables.

How it fits together:
- The frontend gets a LiveKit token from `POST /api/livekit/token` (part of the same Vercel-hosted API) and connects directly to **LiveKit Cloud**.
- The worker joins the same room (LiveKit's automatic dispatch) and, for each transcribed question, calls the Vercel deployment's `POST /api/internal/voice-chat-stream` — the exact same RAG pipeline text chat uses, authenticated with a shared secret (`AGENT_SHARED_SECRET`) rather than a user JWT, since the worker has no user session of its own.
- No local filesystem dependency anywhere in this path.

> The Voice page in the UI today talks to the RAG pipeline through the browser's own `SpeechRecognition` → `/api/chat/stream` → `/api/tts/speak` loop, not through a LiveKit room — `livekit.getToken()` exists in `frontend/src/services/api.js` and the backend/worker side of the LiveKit pipeline is fully built and functional, but the frontend doesn't currently call it anywhere. Wiring the Voice page up to join an actual LiveKit room (so it uses `voice-agent/` end to end) is a real feature change, not something this restructuring pass did — flagging it since the task description assumed it was already wired up.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + Vite, Tailwind CSS v4, lucide-react icons |
| Backend | Node.js + Express 5, Mongoose 9, deployed as a Vercel Function |
| Database | MongoDB (Atlas or local) |
| LLM | OpenRouter (model-agnostic, OpenAI-compatible; default `openai/gpt-4o-mini`) |
| Embeddings | OpenRouter's `/embeddings` endpoint (`openai/text-embedding-3-small` by default), same key as chat — see above for why this isn't local anymore |
| Voice transport | LiveKit (Cloud or self-hosted) |
| Voice STT | AssemblyAI |
| Voice TTS | Deepgram Aura-2 |
| Auth | JWT (7-day expiry) + bcrypt |

## Project structure

```
KnowledgeVoice/
├── api/
│   └── index.js              # Vercel Function entry point — wraps backend/src/app.js
├── backend/
│   └── src/
│       ├── app.js            # Express app (routes, middleware) — no .listen(), used by both api/index.js and server.js
│       ├── server.js         # local-dev / traditional-hosting entry point (.listen(), signal handling)
│       ├── db.js             # cached MongoDB connection (serverless-safe reuse)
│       ├── config/           # cors.js, publicUrl.js — same-origin-aware CORS + URL resolution
│       ├── controllers/, routes/, middleware/, models/, services/   # unchanged in shape from before
├── frontend/                 # React app — pages, auth flow, chat/voice/knowledge-base UI
├── voice-agent/               # standalone LiveKit worker — STT → RAG (via the Vercel API) → TTS, hosted separately
├── package.json               # root scripts: install/build/dev orchestrate frontend + backend
├── vercel.json                 # routes /api/* to the Function, SPA fallback for everything else
└── .gitignore
```

## Local development

```bash
npm install     # installs root, then cascades into frontend/ and backend/ (postinstall)
npm run dev     # runs backend (nodemon, :5000) and frontend (Vite, :5173) together
```

This runs two processes under one command (via `concurrently`) rather than a single merged dev server — Vite's dev server proxies `/api/*` to the backend (`frontend/vite.config.js`), so the frontend code always calls same-origin-relative `/api/...` paths in both dev and production, with no `VITE_API_URL` needed either way.

If you'd rather run them in separate terminals (e.g. to see each one's logs independently), that still works:
```bash
cd backend && npm install && npm run dev     # http://localhost:5000
cd frontend && npm install && npm run dev    # http://localhost:5173
```

The voice agent is a separate process either way (it isn't part of `npm run dev`, since it isn't part of the Vercel deployment):
```bash
cd voice-agent
npm install
cp .env.example .env   # LiveKit creds must match backend/.env exactly
npm run dev
```
See [`voice-agent/README.md`](voice-agent/README.md) for how a session works and troubleshooting.

### Prerequisites
- Node.js 20+
- A MongoDB database (Atlas recommended, or local `mongod`)
- API keys/accounts:
  - [OpenRouter](https://openrouter.ai/keys) — for chat completions **and** embeddings (see above)
  - [LiveKit Cloud](https://cloud.livekit.io) (or a self-hosted LiveKit server) — same project's URL/key/secret used by **both** the API and `voice-agent`
  - [AssemblyAI](https://www.assemblyai.com/dashboard/signup) — speech-to-text for the voice agent worker (free tier available)
  - [Deepgram](https://console.deepgram.com/signup) — text-to-speech for both the Voice page and the voice agent worker (free tier available)

### Environment variables — local development

**`backend/.env`** (copy from `backend/.env.example`)
```
PORT=5000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/knowledgevoice
JWT_SECRET=<a long random string — never use the default in production>
JWT_EXPIRE=7d
OPENROUTER_API_KEY=sk-or-v1-...    # used for chat AND embeddings, see "Embeddings" above
OPENROUTER_CHAT_MODEL=openai/gpt-4o-mini
EMBEDDING_MODEL=openai/text-embedding-3-small
MAX_FILE_SIZE=4194304              # 4MB — see "File upload & processing" above for why
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
DEEPGRAM_API_KEY=...
AGENT_SHARED_SECRET=<random string — must match voice-agent/.env>
# CORS/public-URL vars (APP_URL, FRONTEND_DEV_URL, CORS_ORIGINS) are optional locally —
# defaults already trust http://localhost:5173. See backend/.env.example.
```

**`frontend/.env`** — nothing required locally (see `frontend/.env.example`); API calls are same-origin `/api/...` in both dev and production.

**`voice-agent/.env`**
```
LIVEKIT_URL=wss://your-project.livekit.cloud    # same project as backend
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
ASSEMBLYAI_API_KEY=...
DEEPGRAM_API_KEY=...
DEEPGRAM_TTS_MODEL=aura-2-luna-en
BACKEND_URL=http://localhost:5000               # your Vercel deployment URL in production
AGENT_SHARED_SECRET=<same value as backend/.env>
```

## Deploying to Vercel

1. Push this repo to GitHub (already the case if you're reading this from a clone of it).
2. [vercel.com](https://vercel.com) → **Add New...** → **Project** → import the GitHub repo.
3. Vercel auto-detects the framework from `vercel.json` — **Root Directory stays the repo root** (do not point it at `frontend/`). Leave Build & Output Settings as detected (`vercel.json` already sets `buildCommand`/`outputDirectory` explicitly).
4. **Project Settings → General → Node.js Version**: select **20.x** (matches `engines.node` in every `package.json` here).
5. **Project Settings → Environment Variables**: add every variable from the table below, for the **Production** environment (and **Preview**, if you want preview deployments to work end-to-end too).
6. **Deploy.**
7. Once deployed, if you're also running the voice agent worker: set its `BACKEND_URL` to this deployment's URL (see [`voice-agent/README.md`](voice-agent/README.md)).

### Environment variables — Vercel (Production)

| Variable | Required | Notes |
|---|---|---|
| `MONGODB_URI` | Yes | Atlas connection string, **including the database name** in the path |
| `JWT_SECRET` | Yes | Long random string — generate one, don't reuse a placeholder |
| `JWT_EXPIRE` | No | Defaults to `7d` |
| `OPENROUTER_API_KEY` | Yes | Chat completions **and** embeddings, see [Embeddings](#embeddings-why-the-local-model-was-replaced) |
| `OPENROUTER_CHAT_MODEL` | No | Defaults to `openai/gpt-4o-mini` |
| `EMBEDDING_MODEL` | No | Defaults to `openai/text-embedding-3-small` |
| `MAX_FILE_SIZE` | No | Defaults to 4MB — do not raise above ~4MB, see [File upload & processing](#file-upload--processing) |
| `LIVEKIT_URL` | Yes | `wss://your-project.livekit.cloud` |
| `LIVEKIT_API_KEY` | Yes | |
| `LIVEKIT_API_SECRET` | Yes | |
| `DEEPGRAM_API_KEY` | Yes | Powers the Voice page's `/api/tts/speak` |
| `AGENT_SHARED_SECRET` | Yes | Must match the same value on the separately-hosted voice-agent worker |
| `APP_URL` / `CORS_ORIGINS` | No | Only needed if you attach a custom domain — see [CORS](#cors) below; Vercel's own domain is trusted automatically with no config |

**Never** set `VITE_API_URL` — it was removed on purpose (see [CORS](#cors) below); the frontend always calls same-origin `/api/...`.

**Client-exposed variables:** none currently needed. Nothing in this app's frontend requires a build-time `VITE_`-prefixed secret — the LiveKit connection URL comes back from the authenticated `/api/livekit/token` response, not a build-time env var. If you ever add one, only prefix it `VITE_` if it's genuinely safe to ship in the browser bundle; never do that for any variable in the table above.

## CORS

Frontend and API are served from the same Vercel deployment, so production API calls from the browser are same-origin and don't strictly need CORS at all. `backend/src/config/cors.js` is a small custom middleware (not the `cors` npm package) whose **primary check is genuine same-origin**: does the request's `Origin` header match the host it was actually sent to (`req.headers.host` / `x-forwarded-host`)? That works automatically for the production domain, every preview deployment, and any custom domain, with zero configuration.

An earlier version instead relied on a *static allowlist* built from Vercel's auto-populated `VERCEL_URL`/`VERCEL_PROJECT_PRODUCTION_URL` env vars as the primary mechanism. That was changed after it caused a real production incident: a CORS rejection is invisible to server-side `try/catch` (the browser blocks the response client-side before the app ever sees a problem), so making login/signup depend on an env var being populated under an exact expected name was a fragile, hard-to-diagnose failure mode — it manifested as signup/login silently failing with a generic network error and no server-side clue why. The static list still exists as a secondary check (mainly for local dev, where Vite's dev server and the backend genuinely are on different origins), and covers:
- `http://localhost:5173` (Vite's default dev port, or `FRONTEND_DEV_URL` if set)
- `VERCEL_URL` / `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_BRANCH_URL`, if set (no configuration needed — Vercel populates these automatically)
- Anything listed in `CORS_ORIGINS` (comma-separated), for a custom domain

The old `FRONTEND_URL=http://localhost:5173` single-origin config is gone — it would have been wrong for production (and was explicitly a dev-only value even in the original setup).

## API reference

Unchanged from before this restructuring — same routes, same request/response shapes, same auth model. All routes except signup/login require `Authorization: Bearer <jwt>`.

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/signup` | Create an account |
| POST | `/api/auth/login` | Log in |
| POST | `/api/auth/logout` | Log out |
| GET | `/api/auth/me` | Current user |
| GET / PUT | `/api/users/profile` | Get / update profile (no frontend UI for this yet — see [Known limitations](#known-limitations)) |
| POST | `/api/files/upload` | Upload a document (PDF/DOCX/TXT, ≤4MB) — now waits for processing to finish, see [File upload & processing](#file-upload--processing) |
| GET | `/api/files` | List your documents |
| GET / DELETE | `/api/files/:id` | Get / delete a document |
| POST | `/api/chat` | Send a chat message, get a RAG answer with sources |
| GET | `/api/chat/conversations` | List your conversations |
| GET / DELETE | `/api/chat/conversations/:id` | Get / delete a conversation |
| POST | `/api/chat/stream` | Same as `/api/chat`, streamed as newline-delimited JSON so the Voice page can speak the first sentence while the rest is still being written |
| POST | `/api/tts/speak` | Synthesize a chunk of the assistant's answer (Deepgram Aura), so the key stays server-side |
| POST | `/api/livekit/token` | Get a token + room name to join a voice session |
| POST | `/api/internal/voice-chat` | **Internal only** (shared-secret auth) — the voice agent's entry point into the same RAG pipeline |
| POST | `/api/internal/voice-chat-stream` | **Internal only** — same, streamed as newline-delimited JSON so speech can start on the first sentence |
| GET | `/health`, `/api/health` | Unauthenticated health check |

See [`API_REFERENCE.md`](API_REFERENCE.md) for full request/response bodies.

## Data models

- **User** — name, email, passwordHash, gender, companyName, profileImage
- **File** — userId, fileName, fileType, fileSize, status, textContent, chunkCount *(`filePath` removed — there is no longer a filesystem path to track; see [File upload & processing](#file-upload--processing))*
- **DocumentChunk** — userId, fileId, fileName, fileType, chunkIndex, text, embedding
- **Conversation** — userId, title, updatedAt
- **Message** — conversationId, userId, role, content, inputType (`text`/`voice`), sources

Every Knowledge Base read (`retrieveRelevantChunks`) and write is scoped to `userId` — a user can never retrieve another user's chunks, files, or conversations. This was already true before the restructuring and is unchanged.

## Known limitations

- **Retrieval scans every chunk per query.** `retrievalService.js` loads all of a user's `DocumentChunk` rows and ranks them in-process (cosine similarity + keyword overlap) rather than using a vector index. This was already true before this restructuring and was intentionally left as-is (the task was to make the app Vercel-compatible, not to redesign RAG) — it's fine at moderate scale, but a knowledge base with many thousands of chunks per user would benefit from MongoDB Atlas Vector Search instead.
- **Uploads are capped at 4MB**, a hard Vercel platform limit for direct serverless uploads (see [File upload & processing](#file-upload--processing)). Larger documents need a different upload architecture (client-side direct-to-blob-storage) that wasn't implemented here.
- **The Voice page doesn't actually use `voice-agent/`/LiveKit today** — see the note in [Voice agent worker](#voice-agent-worker).
- **No Profile page in the UI** — the backend API (`/api/users/profile`) exists and works, but nothing in `frontend/src` currently renders it.
- **No React Router** — see the note at the top of this document.

None of these were introduced by the Vercel restructuring; they're called out here because they were discovered while making sure every claim in this document is accurate to the actual code, not because they need to be fixed as part of it.

## Security

- Passwords hashed with bcrypt; JWT-based auth
- Every query is scoped to `req.user.id` — no cross-user data access
- The voice agent never sees a user's JWT; it authenticates to the API's internal endpoint with a separate shared secret, and learns *which* user it's serving from LiveKit room metadata, not the caller
- File upload type/size validation
- CORS restricted to an explicit allowlist (see [CORS](#cors)) — same-origin in production by default, with no origin wildcard
- `JWT_SECRET` is validated *before* any database write in signup/login (not just before signing the token) — otherwise a misconfigured secret could leave an orphaned user record in MongoDB with no token ever returned to the client and no way to retry (the email reads as already registered)

## License

MIT
