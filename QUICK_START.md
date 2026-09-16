# Quick Start Guide

## Current Configuration

This project is already configured to use:
- **Database**: MongoDB Atlas (cloud) — no local `mongod` needed
- **LLM**: OpenRouter (`openai/gpt-4o-mini`) — set via `OPENROUTER_API_KEY`
- **Embeddings**: Local, in-process (`Xenova/all-MiniLM-L6-v2`) — no API key, no cost
- **Voice**: LiveKit Cloud — set via `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`

All of this lives in `backend/.env`. If that file already has real values filled in (not the placeholder `sk-...` strings), you can skip straight to **Running the App**.

## Prerequisites
- Node.js 18+
- A `backend/.env` file (copy from `backend/.env.example` if missing) with:
  - `MONGODB_URI` — your MongoDB Atlas connection string, **including the database name** in the path, e.g. `mongodb+srv://user:pass@cluster.mongodb.net/knowledgevoice?appName=Cluster0` (a common mistake is leaving the path empty, which silently connects to Atlas's default `test` database instead)
  - `OPENROUTER_API_KEY` — get one free at https://openrouter.ai/keys
  - `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` — from your LiveKit Cloud project (only needed once voice is wired up)

> **Windows note**: `npm install` for packages with native dependencies (e.g. `@huggingface/transformers`, `sharp`) can fail under Git Bash with `ERR_INVALID_ARG_TYPE: The "file" argument must be of type string`. If you hit that, run the same `npm install` command in **PowerShell** instead — it resolves the issue. Running the dev servers themselves (`npm run dev`) works fine in either shell.

## Running the App

### Terminal 1 — Backend
```powershell
cd backend
npm install       # first time only
npm run dev
```

Expected output:
```
🚀 Server running on http://localhost:5000
📝 API docs: http://localhost:5000/api
✓ MongoDB connected
```

If you instead see `MongoDB connection failed` or nothing after "injected env", check `MONGODB_URI` in `backend/.env` (network access / IP allowlist in Atlas is a common culprit — Atlas requires your current IP, or `0.0.0.0/0` for testing, to be allowed under Network Access).

### Terminal 2 — Frontend
```powershell
cd frontend
npm install       # first time only
npm run dev
```

Expected output:
```
VITE v8.3.0  ready in XXX ms
➜  Local:   http://localhost:5173/
```

### Terminal 3 — Voice Agent (only needed to test voice, not text chat)
```powershell
cd voice-agent
npm install       # first time only
cp .env.example .env   # then fill in LiveKit + AssemblyAI + Deepgram keys, see voice-agent/README.md
npm run dev
```

### Open the App
Go to **http://localhost:5173**

## First-Time Walkthrough

1. **Sign up** with a name, email, password, gender, and company name.
2. You'll land on the **Dashboard**, logged in.
3. Go to **Knowledge Base** and upload a `.pdf`, `.docx`, or `.txt` file.
   - Status starts as `pending` → `processing` → `processed`.
   - **First upload only**: processing takes noticeably longer (~30-60s) because the local embedding model (~90MB) downloads and caches on first use. Subsequent uploads are fast (a few seconds for a short document).
4. Go to **Chat** and ask a question about the content of the file you uploaded.
5. The AI answers using only your uploaded document and lists it under **Sources**.
6. Ask a follow-up question — it's the same conversation, so context carries over.
7. Go to **Voice** (with the voice agent running from Terminal 3) and click the microphone. Allow
   mic access when prompted. Ask the same kind of question out loud - the agent transcribes it,
   queries the same Knowledge Base, and speaks the answer back. The exchange also appears in
   **Chat**'s conversation history afterward.

## Testing the API Directly (optional)

### Signup
```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123","companyName":"Test Co"}'
```
Returns a `token` and `user` object — save the token for the next calls.

### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Upload a file
```bash
curl -X POST http://localhost:5000/api/files/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/document.txt"
```

### Chat
```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"What does the document say?"}'
```

See [API_REFERENCE.md](API_REFERENCE.md) for the full endpoint list.

## Troubleshooting

### Backend hangs after "injected env" with no further output
Usually MongoDB Atlas taking a while to respond, or a network/allowlist issue. Give it ~30s (Mongoose's connection timeout); if nothing prints, check:
- Atlas → Network Access → your IP is allowed
- `MONGODB_URI` has the right username/password and includes `/knowledgevoice` before the `?`

### `npm install` fails with `ERR_INVALID_ARG_TYPE` on Windows
Re-run the exact same command in **PowerShell** instead of Git Bash — this is a known Git-Bash/npm shell-spawning issue with native-addon install scripts (e.g. `sharp`), not a problem with the package itself.

### Chat returns "LLM request failed: 401 Unauthorized"
`OPENROUTER_API_KEY` is missing or invalid in `backend/.env`. Get a key at https://openrouter.ai/keys.

### Voice agent logs "Unexpected server response: 401" repeatedly and never connects
The worker's `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` don't match `LIVEKIT_URL` - a LiveKit Cloud
project/key mismatch, not a code bug. Go to your LiveKit Cloud project's Settings → Keys and copy a
fresh key/secret pair into **both** `backend/.env` and `voice-agent/.env` (they must reference the
exact same project). See `voice-agent/README.md` for more voice-specific troubleshooting.

### File stuck on "processing" or shows "failed"
Check the backend terminal for the error. Most common causes: unreadable/corrupt file, or the embedding model still downloading on first run (wait a bit longer before assuming failure).

### Frontend can't reach backend / network errors in console
- Confirm backend is running on port 5000 (`curl http://localhost:5000/api/health`)
- Check `VITE_API_URL` in `frontend/.env`

### Signup fails with "Email already registered"
Use a different email, or delete the user from MongoDB Atlas (Atlas UI → Browse Collections → `knowledgevoice.users`).

## Next Steps

Text chat + Knowledge Base (Phases 1-9) is fully working. Voice integration via LiveKit (Phases 11-14) is next — see [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) for the roadmap.
