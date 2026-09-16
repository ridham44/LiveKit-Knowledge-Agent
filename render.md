# Deploying KnowledgeVoice to Render

This walks through hosting all three services — `frontend`, `backend`, `voice-agent` — on
Render from this one repository. See `render.yaml` at the repo root for the declarative
version of everything below.

## Architecture recap

```
frontend    → Static Site        (free)
backend     → Web Service        (free)
voice-agent → Background Worker  (requires a paid Render plan — see below)
```

All three are independent Render services built from the same GitHub repo, each scoped to
its own subdirectory (`rootDir`). MongoDB, LiveKit, OpenRouter, AssemblyAI, and Deepgram are
external cloud services you don't host yourself.

**Storage note:** the backend does **not** use a Render Persistent Disk. Uploaded documents
are only staged on the backend's own ephemeral filesystem for the few seconds it takes to
extract their text — that extracted text, its chunks, and their embeddings are what actually
persist, and they live in MongoDB, not on disk. See "Where your data actually lives" below.

**Cost note:** `frontend` and `backend` run entirely on Render's Free plan. `voice-agent`
cannot — Render doesn't offer Background Workers on Free at all, at any size. If you don't
need live voice calls, skip Step 3 entirely and everything else (auth, uploads, RAG chat,
conversation history) runs for free. Voice dictation in the text chat box (the mic icon next
to the message input) is unaffected either way — that's the browser's own speech recognition
and never touches the voice-agent.

## 0. Prerequisites

Before touching Render, have these ready:

| What | Where to get it |
|---|---|
| This repo pushed to GitHub | `git remote -v` should show a GitHub URL |
| A Render account | https://dashboard.render.com — sign up, connect your GitHub account |
| MongoDB Atlas connection string | https://cloud.mongodb.com → create a free cluster → Database Access (user) + Network Access (allow `0.0.0.0/0`, or Render's static IPs if you're on a paid Render plan) → get the `mongodb+srv://...` URI |
| OpenRouter API key | https://openrouter.ai/keys |
| Deepgram API key | https://console.deepgram.com/signup (free tier is fine) — used by the backend's text-to-speech endpoint even without the voice agent |
| LiveKit Cloud project *(only if you want live voice calls)* | https://cloud.livekit.io → create a project → Settings → Keys, note the **Project URL**, **API Key**, **API Secret** |
| AssemblyAI API key *(only if you want live voice calls)* | https://www.assemblyai.com/dashboard/signup (free tier is fine) |
| A random shared secret *(only if you want live voice calls)* | Run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` locally — you'll paste this same value into two services |

Keep these values handy in a scratch note — you'll paste them into Render's dashboard in
Steps 1–3. **Never commit them anywhere.**

---

## Fast path: deploy with the Blueprint

1. Push this repo to GitHub (if it isn't already).
2. Render Dashboard → **New +** → **Blueprint**.
3. Connect the repo. Render finds `render.yaml` at the root and shows all three services it's
   about to create — note that it will ask you to confirm a paid plan for
   `knowledgevoice-voice-agent` specifically (see the Cost note above). You can remove that
   service from the blueprint run if you don't want voice calls and don't want to pay for it.
4. Every variable marked `sync: false` in `render.yaml` shows up as a blank field Render asks
   you to fill in during setup. Fill those in using the tables in the manual steps below.
5. Skip to **Step 4 (Wire up the cross-service URLs)** below — you still need that part
   regardless of which path you took, since those two values only exist *after* the first
   deploy.

If you want to see and control every setting yourself instead, use the manual path.

---

## Manual path: step by step

### Step 1: Backend (Web Service)

1. Render Dashboard → **New +** → **Web Service**.
2. Connect this GitHub repo.
3. Configure:
   - **Name**: `knowledgevoice-backend`
   - **Root Directory**: `backend`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: **Free** works. If you see the process getting killed/restarted
     under load, that's the local embedding model (`Xenova/all-MiniLM-L6-v2`) — it loads
     into memory on first use and Free's 512MB can be tight. Upgrading to Starter fixes
     that, but it's a RAM concern only, unrelated to storage.
4. **Advanced** → **Health Check Path**: `/health`
5. Do **not** add a disk here — this project doesn't use one (see the Storage note above).
6. Add the environment variables below (**Environment** tab → **Add Environment Variable**,
   one at a time, or **Add from .env** and paste the block).

   ```
   NODE_ENV=production
   PORT=5000
   MONGODB_URI=<your Atlas connection string, include the db name, e.g. .../knowledgevoice>
   JWT_SECRET=<a long random string — generate one, don't reuse the .env.example placeholder>
   JWT_EXPIRE=7d
   OPENROUTER_API_KEY=<your OpenRouter key>
   OPENROUTER_CHAT_MODEL=openai/gpt-4o-mini
   MAX_FILE_SIZE=52428800
   DEEPGRAM_API_KEY=<your Deepgram key — the Voice page speaks answers through the backend>
   FRONTEND_URL=http://localhost:5173
   ```

   Leave `FRONTEND_URL` as a placeholder for now — you'll come back and fix it in Step 4,
   once the frontend actually has a URL. Only add these three if you're doing Step 3 (voice):
   ```
   LIVEKIT_URL=<wss://your-project.livekit.cloud>
   LIVEKIT_API_KEY=<your LiveKit API key>
   LIVEKIT_API_SECRET=<your LiveKit API secret>
   AGENT_SHARED_SECRET=<the random secret you generated in Step 0>
   ```

   Deliberately **not** set: `UPLOAD_DIR`. Leaving it unset makes the app use its own default
   (`./uploads`, relative to the app) — perfectly fine here, since nothing needs that
   directory to survive a restart.
7. **Create Web Service**. Wait for the first deploy to finish.
8. Copy the resulting URL, e.g. `https://knowledgevoice-backend.onrender.com`. You'll need it
   in Steps 2 and 3.
9. Sanity check: open `https://knowledgevoice-backend.onrender.com/health` in a browser — it
   should return `{"status":"ok"}`.

### Step 2: Frontend (Static Site)

1. Render Dashboard → **New +** → **Static Site**.
2. Connect the same repo.
3. Configure:
   - **Name**: `knowledgevoice-frontend`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
4. Environment variables:
   ```
   VITE_API_URL=<the backend URL from Step 1.8>
   VITE_LIVEKIT_URL=wss://your-project.livekit.cloud
   ```
5. **Redirects/Rewrites** tab → add a rule:
   - Source: `/*`
   - Destination: `/index.html`
   - Action: **Rewrite**

   (The app doesn't currently have client-side routing that needs this — there's only ever
   one URL — but it's the standard safe default for a React SPA and costs nothing to add.)
6. **Create Static Site**. Wait for the build to finish.
7. Copy the resulting URL, e.g. `https://knowledgevoice-frontend.onrender.com`.

### Step 3: Voice agent (Background Worker) — optional, requires a paid Render plan

Skip this step entirely if you don't need live voice calls. Everything else in the app works
fully without it. If you do want voice:

Render's Free plan does not support Background Worker services at all — this isn't a
configuration issue, Render simply doesn't offer that service type for free at any size. This
is the one part of this project that costs money to host on Render. The cheapest fit is the
**Starter** instance type.

1. Render Dashboard → **New +** → **Background Worker**.
2. Connect the same repo.
3. Configure:
   - **Name**: `knowledgevoice-voice-agent`
   - **Root Directory**: `voice-agent`
   - **Instance Type**: Starter (the cheapest tier this service type supports)
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Environment variables:
   ```
   LIVEKIT_URL=<same value as backend's LIVEKIT_URL>
   LIVEKIT_API_KEY=<same value as backend's LIVEKIT_API_KEY>
   LIVEKIT_API_SECRET=<same value as backend's LIVEKIT_API_SECRET>
   ASSEMBLYAI_API_KEY=<your AssemblyAI key>
   DEEPGRAM_API_KEY=<your Deepgram key>
   DEEPGRAM_TTS_MODEL=aura-2-luna-en
   BACKEND_URL=<the backend URL from Step 1.8>
   AGENT_SHARED_SECRET=<the exact same random secret you put on the backend>
   ```
5. **Create Background Worker**. It has nothing to do until a browser joins a voice room —
   check its logs for a successful LiveKit connection message, not an HTTP response (it
   doesn't serve one; it's a worker, not a web service).

   The voice agent never touches the backend's filesystem or uploaded files directly — it
   only ever sends a transcribed question over HTTP to the backend's internal RAG endpoint
   and gets back an answer, so none of the storage changes above affect it.

**Looking for a free way to run this piece instead?** Any host that supports a long-running
Node process works, since `voice-agent/agent.js` doesn't listen on a port or need inbound
traffic — it just needs outbound network access to reach LiveKit Cloud and this project's
backend. That's outside the scope of this guide; this document only covers Render.

### Step 4: Wire up the cross-service URLs

Two values only exist once the other services are deployed — go fix them now:

1. Backend service → **Environment** → set `FRONTEND_URL` to the real frontend URL from
   Step 2.7 (exact scheme, no trailing slash) → save (triggers a redeploy).
2. If you did Step 3, double-check the voice agent's `BACKEND_URL` is the backend's real URL,
   not a placeholder.

### Step 5: Verify everything end to end

1. Open the frontend URL. Sign up for a new account.
2. Upload a small `.txt`/`.pdf`/`.docx` file on the Knowledge Base page. Confirm its status
   becomes "Processed".
3. Ask it a question about that document in Chat — confirm you get an answer with a cited
   source.
4. *(Only if you deployed Step 3)* Go to the Voice tab, click to start a call, allow
   microphone access, and talk to it.
   - If it never responds, check the voice-agent's logs on Render for connection errors.
   - If the call connects but nothing is transcribed, check `ASSEMBLYAI_API_KEY`.
   - If it transcribes but never speaks back, check `DEEPGRAM_API_KEY`.

---

## Where your data actually lives

| Data | Lives in |
|---|---|
| Users, passwords (hashed), profiles | MongoDB |
| Conversations, chat messages, sources | MongoDB |
| Extracted document text, chunks, embeddings | MongoDB — this is what RAG actually reads from at chat time |
| The original uploaded PDF/DOCX/TXT file | **Nowhere, after the first few seconds.** It's written to the backend's local disk only long enough for `processDocument` to extract its text, then deleted. There is no "download the original file" feature anywhere in this app today, so nothing depends on that file surviving. |

Because of that last row, the backend never needs to read an uploaded file again after the
initial processing pass, no matter how long ago it was uploaded or how many times the service
has restarted since. That's what makes it safe to run with no Persistent Disk at all.

---

## Troubleshooting

**Login/signup returns a network error or CORS error in the browser console**
`FRONTEND_URL` on the backend doesn't exactly match the frontend's actual URL. It must match
scheme and host exactly, with no trailing slash.

**Backend deploy succeeds but health checks keep failing**
Check the backend's logs for `✗ MongoDB connection failed` — usually `MONGODB_URI` is wrong,
or Atlas's Network Access list doesn't allow Render's IPs (allow `0.0.0.0/0` to unblock
quickly, then tighten later if you're on a Render plan with static outbound IPs).

**Backend restarts or is very slow on first request after a deploy**
The local embedding model (`Xenova/all-MiniLM-L6-v2`) downloads and loads into memory on
first use. On Free (512MB RAM) this can be tight under real load. Upgrade to Starter if you
see out-of-memory restarts — this is a RAM issue, not related to file storage.

**A document's status is stuck on "processing" or "failed"**
Check the backend's logs around that upload for the actual extraction error (bad/corrupted
PDF, empty document, etc.) — `File.errorMessage` in MongoDB also has it. This is unrelated to
disk persistence; it means text extraction itself failed.

**Voice agent logs show `401` on startup, retrying repeatedly**
`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` on the voice-agent don't match the same LiveKit Cloud
project as the backend. Re-copy both from LiveKit Cloud → Settings → Keys into **both**
services.

**Voice agent connects but a call never gets a response**
Check the voice-agent's logs for `Knowledge base request failed` — that means it reached
LiveKit fine but couldn't reach `BACKEND_URL`, or `AGENT_SHARED_SECRET` doesn't match the
backend's value exactly.

---

## Redeploying after code changes

Render auto-deploys each service on every push to the branch it's watching (default `main`),
scoped to its own `rootDir` — a change under `frontend/` only redeploys the frontend, etc.
No extra steps needed beyond pushing to GitHub.
