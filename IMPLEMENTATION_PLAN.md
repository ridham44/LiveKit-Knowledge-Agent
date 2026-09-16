# KnowledgeVoice - Full-Stack Implementation Plan

## Architecture Overview

### Frontend
- **Framework**: React 18 + Vite
- **Styling**: Tailwind CSS
- **State Management**: React Context + Hooks
- **HTTP Client**: Fetch API / Axios
- **Real-time Voice**: LiveKit WebRTC SDK
- **File Upload**: Native file input + drag-drop

### Backend
- **Runtime**: Node.js + Express.js
- **Database**: MongoDB (Mongoose ORM)
- **Authentication**: JWT + bcrypt
- **File Storage**: Local filesystem (uploads/ folder)
- **Text Extraction**: 
  - PDF: pdfjs-dist
  - DOCX: docx-parser
  - TXT: native fs
- **Embeddings**: OpenAI Embedding API
- **Vector Search**: MongoDB (with simplified vector similarity search)
- **LLM**: OpenAI API (abstracted for provider switching)
- **CORS**: Enable for frontend origin
- **Validation**: Input validation + file validation

### Vector Database Strategy
- **Primary**: Store embeddings in MongoDB alongside chunks
- **Search**: Cosine similarity in application code
- **Migration Path**: Easy upgrade to Pinecone/Weaviate later

### LiveKit Architecture
- **Frontend**: LiveKit WebRTC SDK for real-time audio
- **Backend**: LiveKit Agents framework for voice pipeline
- **Voice Agent Flow**:
  1. User connects via browser → LiveKit room
  2. Voice audio → LiveKit Agent
  3. Agent: STT (Speech-to-Text) → Query user's KB → RAG retrieval → LLM → TTS (Text-to-Speech)
  4. Audio response back to user
  5. Transcript logged to chat history

### Authentication Flow
- Sign up → JWT token generation + HTTP-only cookie
- Protected routes on frontend + backend middleware
- User context preserved with localStorage + React Context

---

## Phase Breakdown

### PHASE 1: Project Setup
- [ ] Initialize frontend (React + Vite + Tailwind)
- [ ] Initialize backend (Node + Express + MongoDB connection)
- [ ] Set up folder structure
- [ ] Configure environment variables
- [ ] Test basic frontend/backend communication

### PHASE 2: Authentication
- [ ] User model (MongoDB)
- [ ] Signup API
- [ ] Login API
- [ ] Logout API
- [ ] JWT middleware
- [ ] Protected routes (frontend)
- [ ] Protected endpoints (backend)

### PHASE 3: User Profile
- [ ] GET /api/users/profile
- [ ] PUT /api/users/profile
- [ ] Profile page UI
- [ ] Settings page

### PHASE 4: Knowledge Base UI
- [ ] Files page UI
- [ ] Drag-drop area
- [ ] File list display
- [ ] Processing status indicators
- [ ] Delete file UI

### PHASE 5: File Upload
- [ ] POST /api/files/upload endpoint
- [ ] File validation (type, size)
- [ ] Secure file storage
- [ ] Upload progress tracking
- [ ] Error handling

### PHASE 6: Document Text Extraction
- [ ] PDF text extraction service
- [ ] DOCX text extraction service
- [ ] TXT text processing service
- [ ] Test extraction quality

### PHASE 7: Chunking + Embeddings
- [ ] Text chunking service (overlap strategy)
- [ ] OpenAI embeddings API integration
- [ ] DocumentChunk model (MongoDB)
- [ ] Store chunks + embeddings
- [ ] Async processing pipeline

### PHASE 8: Vector Search / RAG Retrieval
- [ ] Cosine similarity search function
- [ ] retrieve() service (by userId, text query)
- [ ] Ensure user isolation in queries
- [ ] Return top-K relevant chunks

### PHASE 9: RAG Chat Endpoint
- [ ] POST /api/chat endpoint
- [ ] Integrate retrieval service
- [ ] OpenAI chat completion with system prompt
- [ ] Return answer + sources
- [ ] Track tokens/usage

### PHASE 10: Conversation History
- [ ] Conversation model (MongoDB)
- [ ] Message model (MongoDB)
- [ ] Save user/AI messages
- [ ] Retrieve conversation history
- [ ] Conversation list UI

### PHASE 11: LiveKit Integration
- [ ] Create LiveKit room on backend
- [ ] Generate room token (POST /api/livekit/token)
- [ ] LiveKit client setup (frontend)
- [ ] Microphone connection UI
- [ ] Real-time audio transport

### PHASE 12: Voice Agent Setup
- [ ] Create LiveKit Voice Agent (Python or Node)
- [ ] Setup agent to receive audio from room
- [ ] Integrate STT (Speech-to-Text)
- [ ] Connect to RAG retrieval
- [ ] Connect to LLM
- [ ] Integrate TTS (Text-to-Speech)
- [ ] Send audio back to room

### PHASE 13: Voice Pipeline
- [ ] Test end-to-end voice flow
- [ ] User speaks → STT → Transcript
- [ ] Query KB with transcript
- [ ] LLM generates response
- [ ] TTS generates audio
- [ ] User hears response

### PHASE 14: Voice ↔ Chat History
- [ ] Log voice messages to conversation
- [ ] Display voice transcript in chat
- [ ] Preserve conversation context
- [ ] Support follow-up questions

### PHASE 15: Security & User Isolation
- [ ] Verify user filters on all KB queries
- [ ] Test user A cannot see user B's files
- [ ] Secure file permissions
- [ ] Validate API endpoints
- [ ] Rate limiting

### PHASE 16: UI Polish
- [ ] Responsive design (mobile + tablet + desktop)
- [ ] Loading states
- [ ] Error states
- [ ] Animations
- [ ] Color scheme (purple accent)
- [ ] Professional polish

---

## Technology Choices & Rationale

### OpenAI for LLM & Embeddings
- Mature, reliable, well-documented
- Embeddings: `text-embedding-3-small` (cost-effective)
- Chat: `gpt-4` or `gpt-3.5-turbo`
- **Rationale**: Production-ready, easy to switch later via abstraction layer

### MongoDB for All Data
- Flexible schema (documents)
- Vector support (via extensions)
- Scalable
- **Rationale**: Single database simplifies deployment, can use MongoDB Atlas later

### LiveKit for Voice
- Industry standard for real-time voice
- Open-source voice agents
- Simple WebRTC setup
- **Rationale**: Purpose-built for this use case

### Modular Service Architecture
- `services/ai/` for LLM abstraction
- `services/rag/` for retrieval
- `services/documents/` for file processing
- `services/livekit/` for voice
- **Rationale**: Easy to swap providers, testable, maintainable

---

## Required Environment Variables

```
# Backend
PORT=5000
MONGODB_URI=mongodb://localhost:27017/knowledgevoice
JWT_SECRET=your-secret-key-here

# LLM
OPENAI_API_KEY=sk-...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_CHAT_MODEL=gpt-4

# LiveKit
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=your-key
LIVEKIT_API_SECRET=your-secret

# File Upload
MAX_FILE_SIZE=52428800  # 50MB
UPLOAD_DIR=./uploads

# Frontend
VITE_API_URL=http://localhost:5000
VITE_LIVEKIT_URL=ws://localhost:7880
```

---

## File Structure

```
KnowledgeVoice/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   │   ├── ChatArea.jsx
│   │   │   │   ├── MessageList.jsx
│   │   │   │   ├── VoiceButton.jsx
│   │   │   │   └── SourcesDisplay.jsx
│   │   │   ├── files/
│   │   │   │   ├── FileUpload.jsx
│   │   │   │   ├── FileList.jsx
│   │   │   │   └── DragDropZone.jsx
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.jsx
│   │   │   │   ├── TopNav.jsx
│   │   │   │   └── Layout.jsx
│   │   │   └── common/
│   │   │       ├── Button.jsx
│   │   │       ├── Card.jsx
│   │   │       └── LoadingSpinner.jsx
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Signup.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Chat.jsx
│   │   │   ├── KnowledgeBase.jsx
│   │   │   └── Profile.jsx
│   │   ├── services/
│   │   │   ├── api.js
│   │   │   ├── auth.service.js
│   │   │   ├── chat.service.js
│   │   │   ├── file.service.js
│   │   │   └── livekit.service.js
│   │   ├── hooks/
│   │   │   ├── useAuth.js
│   │   │   └── useChat.js
│   │   ├── context/
│   │   │   └── AuthContext.jsx
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── userController.js
│   │   │   ├── fileController.js
│   │   │   ├── chatController.js
│   │   │   └── livekitController.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── users.js
│   │   │   ├── files.js
│   │   │   ├── chat.js
│   │   │   └── livekit.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   ├── errorHandler.js
│   │   │   └── validation.js
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   ├── File.js
│   │   │   ├── DocumentChunk.js
│   │   │   ├── Conversation.js
│   │   │   └── Message.js
│   │   ├── services/
│   │   │   ├── ai/
│   │   │   │   ├── openai.provider.js
│   │   │   │   ├── ai.service.js
│   │   │   │   └── embedding.service.js
│   │   │   ├── rag/
│   │   │   │   ├── retrieval.service.js
│   │   │   │   └── rag.service.js
│   │   │   ├── documents/
│   │   │   │   ├── pdf.service.js
│   │   │   │   ├── docx.service.js
│   │   │   │   ├── txt.service.js
│   │   │   │   └── chunking.service.js
│   │   │   └── livekit/
│   │   │       ├── token.service.js
│   │   │       └── voice.agent.js
│   │   ├── utils/
│   │   │   ├── logger.js
│   │   │   └── errors.js
│   │   ├── config/
│   │   │   └── db.js
│   │   └── server.js
│   ├── uploads/  (gitignored)
│   ├── package.json
│   ├── .env.example
│   └── .env (gitignored)
└── voice-agent/
    ├── agent.py
    ├── requirements.txt
    └── config.py
```

---

## Starting Point: PHASE 1

Ready to begin Phase 1 (project setup).
