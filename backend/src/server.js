require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// A truly uncaught exception leaves the process in an unknown state - log it and
// exit so the platform (Render, pm2, etc.) restarts a clean process, rather than
// silently continuing on corrupted state. Unhandled rejections are logged only:
// every route/service already wraps its own awaits in try/catch, so one reaching
// here is an unexpected edge case worth surfacing, not proof the process is unsafe
// to keep running.
process.on('uncaughtException', (err) => {
  console.error('✗ Uncaught exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('✗ Unhandled promise rejection:', reason);
});

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Database connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/knowledgevoice');
    console.log('✓ MongoDB connected');
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

connectDB();

// The local embedding model is loaded lazily on first use and takes several seconds
// the first time. Without this, that cost lands on whoever asks the first question
// after a restart - which over voice is the worst possible place to spend it.
const { generateEmbedding } = require('./services/ai/embeddingService');
generateEmbedding('warmup')
  .then(() => console.log('✓ Embedding model ready'))
  .catch(err => console.error('✗ Embedding model warmup failed:', err.message));

// Open the pooled TLS connections to the two services on the voice critical path, so
// the first spoken answer doesn't pay a ~700ms handshake on top of everything else.
const { prewarmConnection } = require('./services/httpAgent');
Promise.all([
  prewarmConnection('https://openrouter.ai/api/v1/models'),
  process.env.DEEPGRAM_API_KEY
    ? prewarmConnection('https://api.deepgram.com/v1/projects', {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      })
    : Promise.resolve(),
]).then(() => console.log('✓ Upstream connections warmed'));

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const fileRoutes = require('./routes/files');
const chatRoutes = require('./routes/chat');
const livekitRoutes = require('./routes/livekit');
const internalRoutes = require('./routes/internal');
const ttsRoutes = require('./routes/tts');

// Routes

// Plain, unauthenticated health check for Render's health check path / uptime
// monitors. Deliberately returns nothing beyond a status - no DB state, versions,
// or config details.
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/livekit', livekitRoutes);
app.use('/api/internal', internalRoutes);
app.use('/api/tts', ttsRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 API docs: http://localhost:${PORT}/api`);
});

// Render (and most platforms) send SIGTERM before replacing/stopping an instance.
// Stop accepting new connections and close the DB connection cleanly instead of
// having in-flight requests or the Mongo socket cut off mid-operation.
function shutdown(signal) {
  console.log(`\n${signal} received, shutting down gracefully...`);
  server.close(() => {
    mongoose.connection.close(false).then(() => {
      console.log('✓ HTTP server and MongoDB connection closed');
      process.exit(0);
    });
  });

  // Don't hang forever if something (a stuck request, a slow Mongo close) never
  // resolves - force-exit so the platform's restart isn't blocked indefinitely.
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
