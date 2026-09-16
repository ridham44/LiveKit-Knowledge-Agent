# KnowledgeVoice API Reference

## Base URL
```
http://localhost:5000
```

## Authentication
All endpoints except signup/login require JWT token in header:
```
Authorization: Bearer <token>
```

---

## Authentication Endpoints

### POST /api/auth/signup
Create new user account.

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

**Response (201):**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "fileName": "document.pdf",
  "fileType": "pdf",
  "fileSize": 1024000,
  "status": "pending",
  "createdAt": "2026-09-16T12:00:00Z"
}
```

**Status Values:**
- `pending`: File uploaded, waiting to be processed
- `processing`: Currently extracting text and generating embeddings
- `processed`: Complete, ready to query
- `failed`: Error during processing

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

**Signup**
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
// Signup
const response = await fetch('http://localhost:5000/api/auth/signup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com',
    password: 'password123',
    gender: 'male',
    companyName: 'Acme'
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

# Signup
signup_response = requests.post(f"{BASE_URL}/api/auth/signup", json={
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "gender": "male",
    "companyName": "Acme"
})
token = signup_response.json()["token"]

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

Not implemented. Future enhancement for:
- File processing completion
- Async job status updates

---

## Version

Current API Version: 1.0
Last Updated: September 16, 2026

