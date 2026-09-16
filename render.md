# Hosting the voice-agent worker on Render

The frontend and backend API are **not** deployed here anymore — they're one Vercel
project now (see the root `README.md`). This document only covers the one piece that
can't run on Vercel: `voice-agent/`, a long-running LiveKit worker process. Render is
one option for hosting it, not a requirement — any host that runs a persistent Node.js
process works equally well (Railway, Fly.io, a small VPS, etc.), since `agent.js`
doesn't listen on a port or need inbound traffic; it only needs outbound network access
to reach LiveKit Cloud and your Vercel deployment's `/api/internal/*` routes.

See `render.yaml` at the repo root for the declarative version of everything below.

## Cost note

Render does not offer Background Worker services on its Free plan at all, at any size.
The cheapest fit is the **Starter** instance type. If you don't need live voice calls,
you don't need this service at all — text chat, uploads, RAG, and voice *dictation* in
the chat box (the browser's own speech recognition) all work fully without it, and are
already covered by the Vercel deployment.

## Prerequisites

| What | Where to get it |
|---|---|
| This repo pushed to GitHub | `git remote -v` should show a GitHub URL |
| A Render account | https://dashboard.render.com |
| The deployed Vercel project's URL | e.g. `https://your-app.vercel.app`, from the Vercel dashboard after deploying |
| LiveKit Cloud project | https://cloud.livekit.io → Settings → Keys — **same project** as the one configured on Vercel (`LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`) |
| AssemblyAI API key | https://www.assemblyai.com/dashboard/signup (free tier is fine) |
| Deepgram API key | https://console.deepgram.com/signup (free tier is fine) |
| `AGENT_SHARED_SECRET` | The exact same value you set on the Vercel project - this authenticates the worker's calls to `/api/internal/*` |

## Deploy

### Fast path: Blueprint

1. Render Dashboard → **New +** → **Blueprint** → connect this repo. Render finds
   `render.yaml` and shows the one `knowledgevoice-voice-agent` service it's about to
   create.
2. Fill in the env vars marked `sync: false` when prompted (see the table above).
3. Deploy, then check its logs for a successful LiveKit connection.

### Manual path

1. Render Dashboard → **New +** → **Background Worker**.
2. Connect this repo.
3. Configure:
   - **Name**: `knowledgevoice-voice-agent`
   - **Root Directory**: `voice-agent`
   - **Instance Type**: Starter (the cheapest tier this service type supports)
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Environment variables:
   ```
   LIVEKIT_URL=<same LiveKit project as configured on Vercel>
   LIVEKIT_API_KEY=<same LiveKit project as configured on Vercel>
   LIVEKIT_API_SECRET=<same LiveKit project as configured on Vercel>
   ASSEMBLYAI_API_KEY=<your AssemblyAI key>
   DEEPGRAM_API_KEY=<your Deepgram key>
   DEEPGRAM_TTS_MODEL=aura-2-luna-en
   BACKEND_URL=<your Vercel deployment URL, e.g. https://your-app.vercel.app - no trailing slash, no /api suffix>
   AGENT_SHARED_SECRET=<the exact same value set on the Vercel project>
   ```
5. **Create Background Worker**. It has nothing to do until a browser joins a voice
   room - check its logs for a successful LiveKit connection message, not an HTTP
   response (it doesn't serve one; it's a worker, not a web service).

The worker never touches a filesystem for knowledge base data - it only ever sends a
transcribed question over HTTPS to the Vercel deployment's internal RAG endpoint and
gets back an answer. Nothing about how the API stores/retrieves documents affects it.

## Troubleshooting

See `voice-agent/README.md` for the full troubleshooting guide (401 on startup, agent
never joins, cold-start latency, native binding errors, etc.) - it applies the same way
regardless of where the worker is hosted.

## Redeploying after code changes

Render auto-deploys this service on every push to the branch it's watching (default
`main`), scoped to its own `rootDir: voice-agent` - a change under `frontend/`,
`backend/`, or `api/` never triggers a redeploy of this service (and vice versa: a
change under `voice-agent/` never triggers a Vercel redeploy).
