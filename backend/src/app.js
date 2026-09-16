require('dotenv').config();
const express = require('express');

const { connectDB } = require('./db');
const { cors } = require('./config/cors');

// Node's default behavior for an unhandled promise rejection (Node 15+) is to crash
// the process, exactly as if it were an uncaught exception. On a traditional server
// that's arguably fine (server.js restarts on exactly that basis), but inside a
// Vercel serverless invocation there is no separate process manager to restart
// anything - Node crashing the process IS the request crashing, and Vercel reports it
// as a bare FUNCTION_INVOCATION_FAILED with no application-level detail at all. Every
// route handler in this app already wraps its own logic in try/catch, so this is a
// safety net for anything that manages to reject outside that (a detached promise
// somewhere), not the primary error path - logging instead of exiting is deliberate:
// exiting here would kill the whole function instance out from under any other
// in-flight invocation sharing it.
process.on('unhandledRejection', (reason) => {
  console.error('✗ Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('✗ Uncaught exception:', err);
});

const app = express();

app.use(cors);
app.use(express.json());
app.use(express.urlencoded({ limit: '2mb', extended: true }));

// Fired once per cold start (or once locally) so the connection is already underway
// by the time the first request's gate middleware (below) awaits it, rather than
// only starting to connect once that middleware runs. Errors are logged inside
// connectDB rather than thrown here, so a transient DB hiccup at boot can't take the
// whole module (and therefore every route) down with it.
connectDB().catch(() => {});

// Opens the pooled TLS connections to the services on the voice/chat critical path
// ahead of time, so the first real request of a cold start doesn't also pay a ~700ms
// handshake on top of everything else. Best-effort: prewarmConnection swallows its
// own failures, since a dead network here should surface on the real request instead.
// One entry covers both chat (aiProvider.js) and embeddings (embeddingService.js) -
// both now go through OpenRouter, sharing the same keep-alive connection.
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

// Plain, unauthenticated health check. Deliberately returns nothing beyond a status -
// no DB state, versions, or config details. Registered before the DB-readiness gate
// below so it never depends on Mongo being reachable - it's meant to answer even when
// the database is down.
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

// Every route below this point touches MongoDB. Mongoose's own command buffering
// (queuing a query until the connection resolves, or failing it after
// bufferTimeoutMS - default 10s) is the right idea, but on a cold start the
// connection itself (DNS + TLS + Atlas handshake) can occasionally take close to
// that same 10s, and if it does, whichever query happened to run first loses that
// race and fails with a raw, confusing "buffering timed out" error - exactly what
// was reported in production on a conversations.insertOne() during a fresh cold
// start. Explicitly awaiting the connection here, ONCE, before any route's queries
// even start, removes that race entirely: every request either proceeds against an
// established connection or gets one clear, immediate error instead of a silent
// 10-second stall.
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('Database unavailable:', error.message);
    res.status(503).json({ error: 'Database temporarily unavailable, please try again' });
  }
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

module.exports = app;
