# KnowledgeVoice API Reference

## Base URL

- **Production:** same-origin — the frontend calls `/api/...` directly (no separate host; frontend and API are one Vercel deployment).
- **Local development:** `http://localhost:5000` (the backend's own dev server; Vite's dev server proxies `/api/*` there, so frontend code still just calls `/api/...`).

All routes below are shown relative to that base, e.g. `/api/auth/signup`.

## Authentication
Endpoints below marked "Requires authentication" need a JWT token in the header:
```
Authorization: Bearer <token>
```
Signup, login, and the forgot-password/reset-password endpoints don't require one - signup and
password reset instead go through an email OTP (see below).

---

## Authentication Endpoints

Signup is two steps - `POST /api/auth/signup` only emails a code and does **not** create the
account; the account is created by `POST /api/auth/signup/verify` once that code checks out.
Password reset follows the same three-step shape (request code → verify code → set new password).

Every OTP in this flow: 6 digits, expires in 5 minutes, max 5 resends with a 30-second cooldown
between them (a resend invalidates the previous code), and verification is capped at 5 wrong
attempts before that code is locked out (a resend clears the lock).

### POST /api/auth/signup
Step 1 of signup. Validates the form and emails a 6-digit verification code - **does not create
the account yet**.

**Request:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "secure_password",
  "gender": "male",
  "companyName": "Acme Corp"
}
```

**Response (200):**
```json
{
  "message": "OTP email accepted by mail provider",
  "email": "john@example.com",
  "otpExpiresInSeconds": 300,
  "resendCooldownSeconds": 30,
  "resendsRemaining": 5
}
```
"Accepted by mail provider" means Brevo queued the email for delivery, not that it has reached
the inbox yet.

**Error Response (400):** `{"error": "Email already registered"}` - also returned if the email
is invalid or the password doesn't meet policy (8+ characters, upper/lowercase, a number).

---

### POST /api/auth/signup/resend
Requests a new code for an in-progress signup, invalidating the previous one.

**Request:** `{"email": "john@example.com"}`

**Response (200):** same shape as `POST /api/auth/signup`.

**Error Responses:**
- `404` `{"error": "...", "code": "SESSION_NOT_FOUND"}` - no signup in progress for this email
- `429` `{"error": "...", "code": "RESEND_COOLDOWN", "retryAfterSeconds": 17}` - too soon since the last send
- `429` `{"error": "...", "code": "RESEND_LIMIT"}` - 5 resends already used for this session

---

### POST /api/auth/signup/verify
Step 2 of signup. Verifies the code and, only now, creates the account.

**Request:** `{"email": "john@example.com", "otp": "123456"}`

**Response (201):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "507f1f77bcf86cd799439010",
    "name": "John Doe",
    "email": "john@example.com",
    "gender": "male",
    "companyName": "Acme Corp",
    "createdAt": "2026-09-16T12:00:00Z"
  }
}
```

**Error Responses:**
- `404` `code: "SESSION_NOT_FOUND"` - no signup in progress (or it fully expired)
- `400` `code: "OTP_EXPIRED"` - request a new code via `/signup/resend`
- `400` `code: "OTP_INVALID"`, plus `"attemptsRemaining"` - wrong code
- `429` `code: "OTP_LOCKED"` - 5 wrong attempts against this code; resend to get a fresh one

---

### POST /api/auth/forgot-password
Step 1 of password reset. Emails a 6-digit code to an *existing* account's email.

**Request:** `{"email": "john@example.com"}`

**Response (200):** same shape as `POST /api/auth/signup`.

**Error Response (404):** `{"error": "No account found with this email"}`

---

### POST /api/auth/forgot-password/resend
Same behavior and response/error shapes as `POST /api/auth/signup/resend`, against the password-reset session instead.

---

### POST /api/auth/forgot-password/verify
Step 2 of password reset. Verifies the code and issues a short-lived reset token (10 minutes) -
the password itself isn't changed yet.

**Request:** `{"email": "john@example.com", "otp": "123456"}`

**Response (200):**
```json
{
  "email": "john@example.com",
  "resetToken": "45f4754a6d27b5488ab47529cd885cc...",
  "resetTokenExpiresInSeconds": 600
}
```

**Error Responses:** same `SESSION_NOT_FOUND` / `OTP_EXPIRED` / `OTP_INVALID` / `OTP_LOCKED` shapes as `POST /api/auth/signup/verify`.

---

### POST /api/auth/reset-password
Step 3 of password reset. Consumes the reset token from the previous step, sets the new
password, and logs the user in immediately (same response shape as login).

**Request:**
```json
{
  "email": "john@example.com",
  "resetToken": "45f4754a6d27b5488ab47529cd885cc...",
  "newPassword": "new_secure_password"
}
```

**Response (200):** same `{ token, user }` shape as `POST /api/auth/login`.

**Error Responses:**
- `404` `code: "SESSION_NOT_FOUND"` - no verified reset session for this email
- `400` `code: "RESET_TOKEN_EXPIRED"` - the 10-minute window passed; verify the OTP again
- `400` `code: "RESET_TOKEN_INVALID"` - token doesn't match
- `400` `{"error": "Password must be at least 8 characters"}` (or similar) - policy violation

---

### POST /api/auth/login
Authenticate user with email and password.

**Request:**
```json
{
  "email": "john@example.com",
  "password": "secure_password"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "507f1f77bcf86cd799439010",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

---

### GET /api/auth/me
Get current user profile. Requires authentication.

**Response (200):**
```json
{
  "_id": "507f1f77bcf86cd799439010",
  "name": "John Doe",
  "email": "john@example.com",
  "gender": "male",
  "companyName": "Acme Corp",
  "createdAt": "2026-09-16T12:00:00Z"
}
```

---

### POST /api/auth/logout
Always returns `200` regardless of whether a token is sent - there's no server-side session to
invalidate (the client just discards its stored JWT). If a valid `Authorization` header is sent,
the logout event is recorded against that identity; if not, it's still recorded, just without one.

**Response (200):** `{"message": "Logged out"}`

---

## User Endpoints

### GET /api/users/profile
Get current user's profile. Alias for /auth/me.

---

### PUT /api/users/profile
Update user profile. Requires authentication.

**Request:**
```json
{
  "name": "Jane Doe",
  "gender": "female",
  "companyName": "Updated Corp",
  "profileImage": "https://..."
}
```

**Response (200):**
```json
{
  "_id": "507f1f77bcf86cd799439010",
  "name": "Jane Doe",
  "companyName": "Updated Corp"
}
```

---

## File Management Endpoints

### POST /api/files/upload
Upload a document to knowledge base. Requires authentication.

**Request:**
- Content-Type: multipart/form-data
- Body: multipart file

```bash
curl -X POST http://localhost:5000/api/files/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@document.pdf"
```

The request is only answered once processing has fully finished — extraction, chunking, and embedding all happen before the response is sent, so the returned `status` is always the *final* outcome, never a placeholder.

**Response (201) — success:**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "fileName": "document.pdf",
  "fileType": "pdf",
  "fileSize": 1024000,
  "status": "processed",
  "chunkCount": 12,
  "errorMessage": null,
  "createdAt": "2026-09-16T12:00:00Z"
}
```

**Response (201) — processing failed** (still `201`; the upload itself succeeded, extraction/embedding did not):
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "fileName": "document.pdf",
  "fileType": "pdf",
  "fileSize": 1024000,
  "status": "failed",
  "chunkCount": 0,
  "errorMessage": "PDF extraction failed: ...",
  "createdAt": "2026-09-16T12:00:00Z"
}
```

Max file size is **4MB** (`MAX_FILE_SIZE`, hard-capped by Vercel's request body limit for the production deployment).

---

### GET /api/files
List all user's uploaded files. Requires authentication.

**Query Parameters:**
- None (returns all files)

**Response (200):**
```json
[
  {
    "_id": "507f1f77bcf86cd799439011",
    "fileName": "company-policy.pdf",
    "fileType": "pdf",
    "fileSize": 1024000,
    "status": "processed",
    "chunkCount": 45,
    "createdAt": "2026-09-16T12:00:00Z"
  },
  {
    "_id": "507f1f77bcf86cd799439012",
    "fileName": "employee-handbook.docx",
    "fileType": "docx",
    "fileSize": 512000,
    "status": "processing",
    "chunkCount": 0,
    "createdAt": "2026-09-16T12:05:00Z"
  }
]
```

---

### DELETE /api/files/:id
Delete a file and all associated embeddings. Requires authentication.

**Path Parameters:**
- `id` (required): File ID

**Response (200):**
```json
{
  "message": "File deleted"
}
```

---

## Chat Endpoints

### POST /api/chat
Send message to AI. Creates new conversation if conversationId not provided.

**Request:**
```json
{
  "message": "What is the refund policy?",
  "conversationId": "optional-id"
}
```

**Response (200):**
```json
{
  "conversationId": "507f1f77bcf86cd799439013",
  "message": {
    "_id": "507f1f77bcf86cd799439014",
    "conversationId": "507f1f77bcf86cd799439013",
    "role": "assistant",
    "content": "According to your Knowledge Base, customers can request a refund within 30 days of purchase...",
    "inputType": "text",
    "sources": [
      {
        "fileId": "507f1f77bcf86cd799439011",
        "fileName": "company-policy.pdf",
        "fileType": "pdf",
        "relevantText": "Our company offers a 30-day money-back guarantee...",
        "chunkIndex": 0
      }
    ],
    "createdAt": "2026-09-16T12:10:00Z"
  },
  "usage": {
    "prompt_tokens": 250,
    "completion_tokens": 120,
    "total_tokens": 370
  }
}
```

**Error Response (400):**
```json
{
  "error": "No relevant information found in Knowledge Base"
}
```

---

### GET /api/chat/conversations
List all conversations for user. Requires authentication.

**Response (200):**
```json
[
  {
    "_id": "507f1f77bcf86cd799439013",
    "userId": "507f1f77bcf86cd799439010",
    "title": "What is the refund policy?",
    "createdAt": "2026-09-16T12:00:00Z",
    "updatedAt": "2026-09-16T12:15:00Z"
  },
  {
    "_id": "507f1f77bcf86cd799439015",
    "userId": "507f1f77bcf86cd799439010",
    "title": "How long does processing...",
    "createdAt": "2026-09-16T11:50:00Z",
    "updatedAt": "2026-09-16T12:05:00Z"
  }
]
```

---

### GET /api/chat/conversations/:id
Get specific conversation with all messages. Requires authentication.

**Path Parameters:**
- `id` (required): Conversation ID

**Response (200):**
```json
{
  "conversation": {
    "_id": "507f1f77bcf86cd799439013",
    "userId": "507f1f77bcf86cd799439010",
    "title": "What is the refund policy?",
    "createdAt": "2026-09-16T12:00:00Z"
  },
  "messages": [
    {
      "_id": "507f1f77bcf86cd799439016",
      "role": "user",
      "content": "What is the refund policy?",
      "inputType": "text",
      "createdAt": "2026-09-16T12:00:00Z"
    },
    {
      "_id": "507f1f77bcf86cd799439017",
      "role": "assistant",
      "content": "According to your Knowledge Base...",
      "sources": [/* ... */],
      "createdAt": "2026-09-16T12:00:05Z"
    }
  ]
}
```

---

### DELETE /api/chat/conversations/:id
Delete conversation and all associated messages.

**Path Parameters:**
- `id` (required): Conversation ID

**Response (200):**
```json
{
  "message": "Conversation deleted"
}
```

---

### POST /api/chat/stream
Same as `POST /api/chat`, but the answer is streamed as it's generated instead of returned all at once. Used by the Voice page so speech synthesis can start on the first sentence rather than waiting for the whole reply. Requires authentication.

**Request:** same body as `POST /api/chat`.

**Response:** `Content-Type: application/x-ndjson` — one JSON object per line:
```
{"type":"delta","text":"The refund "}
{"type":"delta","text":"policy allows..."}
{"type":"done","conversationId":"507f...","messageId":"507f...","usage":{"prompt_tokens":250,"completion_tokens":120,"total_tokens":370}}
```
An error mid-stream arrives as `{"type":"error","error":"..."}` instead of an HTTP error status, since headers are already sent by the time the answer starts generating.

---

## Voice / Text-to-Speech Endpoints

### POST /api/tts/speak
Synthesizes a short chunk of text to speech (Deepgram Aura), so the Deepgram key never reaches the browser. Used by the Voice page to speak the assistant's answer. Requires authentication.

**Request:**
```json
{
  "text": "The refund policy allows returns within 30 days.",
  "voice": "aura-2-luna-en",
  "speed": 1.0
}
```
`text` must be 1000 characters or fewer (one spoken sentence at a time). `voice` must be one of the app's allowed voice IDs (see the Voice page's settings panel); `speed` is clamped to 0.7–1.5.

**Response (200):** `Content-Type: audio/ogg` (Opus-encoded) — raw audio bytes, not JSON.

---

## LiveKit Endpoints

### POST /api/livekit/token
Generate a LiveKit room token for the browser to start a voice session. Requires authentication.
The backend generates a unique room name server-side and embeds the authenticated `userId` (plus
`conversationId` if given, to resume that conversation over voice) in the participant's metadata -
this is how the voice agent worker learns whose Knowledge Base to query, without ever seeing a JWT.

**Request:**
```json
{
  "conversationId": "optional - resume an existing text/voice conversation"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "url": "wss://your-project.livekit.cloud",
  "roomName": "voice-<userId>-<timestamp>"
}
```

---

## Internal Endpoints

Not called by the frontend. Used only by the `voice-agent` worker process to reach the same RAG
pipeline the text chat uses, authenticated with a shared secret instead of a user JWT (the agent
process has no user session).

### POST /api/internal/voice-chat
**Header:** `X-Internal-Secret: <AGENT_SHARED_SECRET>`

**Request:**
```json
{
  "userId": "507f1f77bcf86cd799439010",
  "message": "What is the refund policy?",
  "conversationId": "optional - continues that conversation"
}
```

Same response shape as `POST /api/chat`, except messages are saved with `inputType: "voice"`.
Returns `403` if the secret header is missing or wrong.

---

### POST /api/internal/voice-chat-stream
Streamed version of the above — same newline-delimited JSON shape as `POST /api/chat/stream`. This is the one the `voice-agent` worker actually calls, so it can start speaking the first sentence of the answer while the rest is still generating. Same `X-Internal-Secret` header requirement.

---

### GET /api/internal/audit-logs
Queries the operational audit trail for signup/OTP/password-reset/login/logout events (written by
the backend's `otpLogger.js` alongside its console output) — meant for inspecting what actually
happened in production without needing platform log access. Never contains OTPs, passwords, or
secrets. Entries auto-expire after 30 days. Same `X-Internal-Secret` header requirement as the
voice-agent endpoints above.

**Query parameters** (all optional): `email`, `event` (e.g. `sent`, `verify_failed`,
`login_success`), `scope` (`otp` | `auth` | `password_reset`), `level` (`info` | `warn` | `error`),
`since` (ISO date), `limit` (default 50, max 200).

```bash
curl "https://your-app.vercel.app/api/internal/audit-logs?email=john@example.com&limit=20" \
  -H "X-Internal-Secret: $AGENT_SHARED_SECRET"
```

**Response (200):**
```json
{
  "count": 2,
  "logs": [
    {
      "_id": "...",
      "scope": "otp",
      "event": "sent",
      "email": "john@example.com",
      "level": "info",
      "meta": { "provider": "brevo", "success": true, "httpStatus": 201, "messageId": "..." },
      "createdAt": "2026-09-17T09:35:22.814Z"
    },
    {
      "_id": "...",
      "scope": "auth",
      "event": "login_success",
      "email": "john@example.com",
      "level": "info",
      "meta": { "userId": "507f1f77bcf86cd799439010" },
      "createdAt": "2026-09-17T09:35:48.966Z"
    }
  ]
}
```

---

## Health Check

### GET /health
### GET /api/health
Unauthenticated, no database round-trip. Returns `{"status":"ok"}` (the `/api/health` variant also includes a `message`). Used for uptime checks.

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Message is required"
}
```

### 401 Unauthorized
```json
{
  "error": "No token provided"
}
```

### 403 Forbidden
```json
{
  "error": "Invalid or expired token"
}
```

### 404 Not Found
```json
{
  "error": "File not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Database connection failed"
}
```

---

## Request Examples

### Using cURL

**Signup** (step 1 — emails a code, doesn't create the account; see `POST /api/auth/signup/verify` above to finish)
```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "gender": "male",
    "companyName": "Acme"
  }'
```

**Login**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

**Upload File**
```bash
curl -X POST http://localhost:5000/api/files/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@document.pdf"
```

**Send Chat Message**
```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is the refund policy?"
  }'
```

---

### Using JavaScript (Fetch)

```javascript
// Login (an already-verified account - see /api/auth/signup + /api/auth/signup/verify
// above for new-account signup, which requires the emailed OTP step in between)
const response = await fetch('http://localhost:5000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'john@example.com',
    password: 'password123'
  })
});
const data = await response.json();
const token = data.token;

// Send Chat Message
const chatResponse = await fetch('http://localhost:5000/api/chat', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    message: 'What is the refund policy?'
  })
});
const chatData = await chatResponse.json();
console.log(chatData.message.content);
```

---

### Using Python (Requests)

```python
import requests

BASE_URL = "http://localhost:5000"

# Login (an already-verified account - see /api/auth/signup + /api/auth/signup/verify
# above for new-account signup, which requires the emailed OTP step in between)
login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
    "email": "john@example.com",
    "password": "password123"
})
token = login_response.json()["token"]

# Send Chat Message
headers = {"Authorization": f"Bearer {token}"}
chat_response = requests.post(f"{BASE_URL}/api/chat", 
    json={"message": "What is the refund policy?"},
    headers=headers
)
print(chat_response.json()["message"]["content"])
```

---

## Rate Limiting

Currently not implemented. Future enhancement:
- 100 requests/minute per user
- 50 chat messages/hour per user
- 10 file uploads/hour per user

---

## Pagination

Not yet implemented. Future enhancement for:
- File listing (limit/offset)
- Conversation listing (limit/offset)
- Message history (limit/offset)

---

## Webhooks

Not implemented. Would be a future enhancement for notifying an external system of events (e.g. a document finishing processing) without polling.

---

## Version

Current API Version: 1.0
Last Updated: September 17, 2026

