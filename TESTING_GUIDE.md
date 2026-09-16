# KnowledgeVoice - Testing & Deployment Guide

## What's Been Implemented

### ✅ Complete Features

**Authentication System**
- Signup with full user profile (name, email, password, gender, company)
- Login with email/password
- JWT-based authentication
- Protected API endpoints

**Knowledge Base Management**
- File upload (PDF, DOCX, TXT)
- File validation and size limits (50MB max)
- Async document processing
- File list with status tracking
- File deletion

**Document Processing Pipeline**
- PDF text extraction
- DOCX text extraction with XML parsing
- TXT file processing
- Text chunking with overlap (1000 chars, 100 char overlap)
- Automatic embedding generation via OpenAI

**RAG System (Retrieval-Augmented Generation)**
- Vector similarity search using cosine similarity
- Multi-document retrieval (top-5 by default)
- User isolation (automatic userId filtering)
- Context-aware answer generation

**AI Chat**
- Text-based conversation
- Integration with RAG system
- Source citations
- Conversation history
- Multiple conversations support

**Additional Infrastructure**
- MongoDB integration with proper schema
- User session management
- Error handling and validation
- CORS configuration
- File upload middleware

## Installation & Setup

### Prerequisites
1. **MongoDB** - Running on localhost:27017
   ```bash
   mongod
   ```

2. **OpenRouter API Key**
   - Sign up at https://openrouter.ai
   - Generate API key from https://openrouter.ai/keys
   - Save in backend/.env as OPENROUTER_API_KEY
   - (Embeddings run locally in-process — no key needed for those)

3. **Node.js 18+**

### Step 1: Configure Environment Variables

**Backend** (`backend/.env`):
```
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/knowledgevoice
JWT_SECRET=your-secret-key-change-this
OPENROUTER_API_KEY=sk-or-v1-your-key
OPENROUTER_CHAT_MODEL=openai/gpt-4o-mini
MAX_FILE_SIZE=52428800
UPLOAD_DIR=./uploads
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=your-key
LIVEKIT_API_SECRET=your-secret
FRONTEND_URL=http://localhost:5173
```

**Frontend** (`frontend/.env`):
```
VITE_API_URL=http://localhost:5000
VITE_LIVEKIT_URL=ws://localhost:7880
```

### Step 2: Start Services

**Terminal 1 - MongoDB**:
```bash
mongod
```

**Terminal 2 - Backend**:
```bash
cd backend
npm run dev
```

Expected output:
```
✓ MongoDB connected
🚀 Server running on http://localhost:5000
```

**Terminal 3 - Frontend**:
```bash
cd frontend
npm run dev
```

Expected output:
```
VITE v8.3.0  ready in XXX ms
➜  Local:   http://localhost:5173/
```

## Testing the Full Flow

### 1. User Registration & Login

1. Open http://localhost:5173
2. Click "Sign up"
3. Fill in:
   - Full Name: "Test User"
   - Email: "test@example.com"
   - Password: "test123456"
   - Gender: "not-specified"
   - Company: "Test Company"
4. Click "Sign up"
5. You should be logged in to Dashboard

### 2. Upload a Knowledge Base Document

**Option A: Using the UI**
1. Click "Knowledge Base" in sidebar
2. Drag & drop a PDF/DOCX/TXT file or click to browse
3. Wait for file to upload
4. Status changes from "pending" → "processing" → "processed"
5. Shows chunk count when complete

**Option B: Using cURL**
```bash
curl -X POST http://localhost:5000/api/files/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@path/to/your/file.pdf"
```

### 3. Test Document Content

For testing, create a simple text file with content:

**test-document.txt**:
```
Company Refund Policy

Our company offers a 30-day money-back guarantee on all products.
Customers can request a refund within 30 days of purchase without any questions asked.
Simply contact our support team with your order number and reason for the refund.

Once received, refund requests are processed within 5-7 business days.
Refunds are issued to the original payment method.

For more information, please visit our support page or email support@company.com.
```

Upload this file to the Knowledge Base.

### 4. Test Chat with Knowledge Base

1. Click "Chat" in sidebar
2. Ask: "What is your refund policy?"
3. Expected response: AI should answer based on the uploaded document
4. Response should include sources citing "test-document.txt"

**Example Questions to Try**:
- "How many days to request a refund?"
- "How long does processing take?"
- "What is your refund policy?"
- "Can I get a refund?" 
- "How do I contact support?" (will say not in KB if not in document)

### 5. Test Conversation History

1. Ask multiple questions in chat
2. Messages appear in order
3. Close and reopen - conversation is preserved
4. Can delete conversations from list

### 6. Test File Management

1. Upload multiple files
2. See them listed with status and chunk count
3. Delete files - they disappear from list
4. Can't query deleted files

## API Endpoints Reference

### Authentication
```bash
# Signup
POST /api/auth/signup
{
  "name": "User",
  "email": "user@example.com",
  "password": "password",
  "gender": "not-specified",
  "companyName": "Company"
}

# Login
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password"
}

# Get Current User
GET /api/auth/me
Header: Authorization: Bearer TOKEN
```

### Files
```bash
# Upload File
POST /api/files/upload
Header: Authorization: Bearer TOKEN
Content-Type: multipart/form-data
Body: file

# List Files
GET /api/files
Header: Authorization: Bearer TOKEN

# Delete File
DELETE /api/files/{fileId}
Header: Authorization: Bearer TOKEN
```

### Chat
```bash
# Send Message
POST /api/chat
Header: Authorization: Bearer TOKEN
{
  "message": "What is your refund policy?",
  "conversationId": "optional-conversation-id"
}

# List Conversations
GET /api/chat/conversations
Header: Authorization: Bearer TOKEN

# Get Conversation
GET /api/chat/conversations/{conversationId}
Header: Authorization: Bearer TOKEN

# Delete Conversation
DELETE /api/chat/conversations/{conversationId}
Header: Authorization: Bearer TOKEN
```

### LiveKit (Voice - Not Yet Implemented)
```bash
# Get Token for Voice
POST /api/livekit/token
Header: Authorization: Bearer TOKEN
{
  "roomName": "room-name"
}
```

## Expected Responses

### Successful Chat Response
```json
{
  "conversationId": "507f1f77bcf86cd799439011",
  "message": {
    "_id": "507f1f77bcf86cd799439012",
    "conversationId": "507f1f77bcf86cd799439011",
    "userId": "507f1f77bcf86cd799439010",
    "role": "assistant",
    "content": "According to your Knowledge Base, customers can request a refund within 30 days of purchase...",
    "inputType": "text",
    "sources": [
      {
        "fileId": "507f1f77bcf86cd799439013",
        "fileName": "test-document.txt",
        "fileType": "txt",
        "relevantText": "Our company offers a 30-day money-back guarantee...",
        "chunkIndex": 0
      }
    ],
    "createdAt": "2026-09-16T12:00:00Z"
  },
  "usage": {
    "prompt_tokens": 200,
    "completion_tokens": 100,
    "total_tokens": 300
  }
}
```

## Troubleshooting

### MongoDB Connection Failed
```
✗ MongoDB connection failed: connect ECONNREFUSED 127.0.0.1:27017
```
**Solution**: Start MongoDB first
```bash
mongod
```

### OpenAI API Error
```
LLM request failed: 401 Unauthorized
```
**Solution**: Check OPENROUTER_API_KEY is valid in backend/.env (get one at https://openrouter.ai/keys)

### File Upload Returns 400
```
{"error":"Unsupported file type"}
```
**Solution**: Only upload PDF, DOCX (.doc), or TXT files

### Chat Returns "No relevant information"
**Reason**: No files uploaded yet or query doesn't match document content
**Solution**: Upload relevant documents first

### Frontend Can't Connect to Backend
```
TypeError: Failed to fetch
```
**Solution**: 
- Ensure backend is running on port 5000
- Check VITE_API_URL in frontend/.env
- Check browser console for CORS errors

## Performance Notes

- **Embeddings**: OpenAI API calls (~20ms per chunk)
- **Vector Search**: O(n) similarity calculation on all chunks
- **Large Documents**: 100+ page PDFs may take 30-60 seconds to process
- **Chat Response**: 2-5 seconds (depends on OpenAI API latency)

## Security Notes

✅ **Implemented**
- Passwords hashed with bcryptjs
- JWT authentication on protected endpoints
- User isolation (can't access other users' data)
- File upload validation
- CORS configured

⚠️ **Future Improvements**
- Rate limiting on API endpoints
- File encryption at rest
- Audit logging
- Input sanitization
- Role-based access control (RBAC)

## Next Steps: Voice Integration (Phases 11-14)

The backend is ready for LiveKit integration:
- POST /api/livekit/token endpoint exists
- LiveKit Server SDK installed
- Ready to implement voice agent

## Testing Checklist

- [ ] MongoDB connects successfully
- [ ] Backend starts without errors
- [ ] Frontend loads at localhost:5173
- [ ] Can sign up new user
- [ ] Can login with credentials
- [ ] Can upload PDF/DOCX/TXT file
- [ ] File processing completes (status = "processed")
- [ ] Can ask question in chat
- [ ] AI responds with relevant answer
- [ ] Response includes sources
- [ ] Can ask follow-up questions
- [ ] Conversation history preserved
- [ ] Can delete files
- [ ] Can create new conversations

---

**Status**: ✅ Phases 1-9 Complete - Full Text Chat with RAG Ready for Testing
