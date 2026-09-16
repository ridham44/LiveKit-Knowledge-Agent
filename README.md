# KnowledgeVoice - AI Knowledge Base Assistant

A full-stack application that combines real-time voice communication via LiveKit with a RAG-based knowledge base for intelligent question answering.

## Features

- **User Authentication**: Sign up, login, and manage user profiles
- **Knowledge Base Management**: Upload and manage documents (PDF, DOCX, TXT)
- **Document Processing**: Automatic text extraction and chunking
- **RAG (Retrieval-Augmented Generation)**: Intelligent retrieval of relevant documents
- **AI Chat**: Text-based conversation with the knowledge base
- **Voice Chat**: Real-time voice conversation using LiveKit
- **Conversation History**: Track and manage chat conversations
- **User Isolation**: Multi-tenant architecture with complete user data isolation

## Architecture

### Frontend
- React 18 + Vite
- Tailwind CSS for styling
- LiveKit WebRTC SDK for voice
- Axios for API communication

### Backend
- Node.js + Express
- MongoDB for data storage
- OpenRouter API for LLM chat completions (model-agnostic, OpenAI-compatible)
- Local embeddings (Xenova/all-MiniLM-L6-v2 via @huggingface/transformers, no API key needed)
- LiveKit Server SDK for voice infrastructure
- JWT-based authentication

### Services
- **Embedding Service**: Local in-process embeddings for semantic search
- **Document Processing**: Text extraction from PDF, DOCX, TXT
- **RAG Service**: Retrieval and ranking of relevant documents
- **Voice Agent**: LiveKit-based voice interaction

## Installation

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- OpenRouter API key (https://openrouter.ai/keys)
- LiveKit instance (local or hosted)

### Setup Instructions

1. **Clone the repository**
```bash
cd "D:\Work24\LiveKit Knowledge Agent"
```

2. **Backend Setup**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env and add your credentials
```

3. **Frontend Setup**
```bash
cd ../frontend
npm install
cp .env.example .env
```

4. **Environment Configuration**

Backend `.env`:
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/knowledgevoice
JWT_SECRET=your-secret-key
OPENROUTER_API_KEY=sk-or-v1-your-key
OPENROUTER_CHAT_MODEL=openai/gpt-4o-mini
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=your-key
LIVEKIT_API_SECRET=your-secret
FRONTEND_URL=http://localhost:5173
```

Frontend `.env`:
```
VITE_API_URL=http://localhost:5000
VITE_LIVEKIT_URL=ws://localhost:7880
```

## Running the Application

### Start MongoDB
```bash
mongod
```

### Start Backend
```bash
cd backend
npm run dev
# Backend running on http://localhost:5000
```

### Start Frontend (in another terminal)
```bash
cd frontend
npm run dev
# Frontend running on http://localhost:5173
```

## Current Phase: PHASE 1 - Project Setup ✓

The basic project structure has been initialized:
- ✓ React + Vite frontend with Tailwind CSS
- ✓ Node + Express backend
- ✓ MongoDB models (User, File, DocumentChunk, Conversation, Message)
- ✓ Authentication system (signup/login)
- ✓ Dashboard with navigation
- ✓ Environment configuration

## Next Phases

### PHASE 2: Authentication Completion
- Complete login/signup flow
- JWT token handling
- Protected routes

### PHASE 3-16: Full Feature Implementation
- User profiles
- File upload and processing
- Document text extraction
- Embeddings and vector search
- RAG chat
- Voice integration with LiveKit
- Conversation history
- Security and isolation
- UI polish

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Create new account
- `POST /api/auth/login` - Login to account
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### To Be Implemented
- User management
- File upload and retrieval
- Chat and messages
- LiveKit token generation

## Database Schema

### User
- id, name, email, passwordHash, gender, companyName, profileImage, timestamps

### File
- id, userId, fileName, fileType, fileSize, filePath, status, textContent, chunkCount, timestamps

### DocumentChunk
- id, userId, fileId, fileName, fileType, chunkIndex, text, embedding, createdAt

### Conversation
- id, userId, title, timestamps

### Message
- id, conversationId, userId, role, content, inputType, sources, createdAt

## Security

- Passwords are hashed with bcryptjs
- JWT-based authentication with 7-day expiration
- User isolation enforced on all queries
- File upload validation
- CORS configuration for frontend origin

## Technology Choices

| Component | Choice | Reason |
|-----------|--------|--------|
| Frontend | React + Vite | Modern, fast development |
| Styling | Tailwind CSS | Utility-first, rapid UI development |
| Backend | Express.js | Lightweight, flexible Node.js framework |
| Database | MongoDB | Document flexibility, easy to scale |
| Authentication | JWT | Stateless, scalable |
| LLM | OpenRouter (openai/gpt-4o-mini) | Model-agnostic, easy to swap models/providers |
| Embeddings | Local (Xenova/all-MiniLM-L6-v2) | No API key/cost, runs in-process |
| Voice | LiveKit | Purpose-built for real-time voice |

## Development Notes

- The application uses modular service architecture for easy provider switching
- All API endpoints require authentication except signup/login
- User isolation is enforced at the service layer
- Documents are processed asynchronously to avoid blocking

## Status

🚀 **Current**: Phase 1 - Project Setup Complete

Initial project structure has been scaffolded with basic authentication. Ready to proceed with Phase 2.

## License

MIT
