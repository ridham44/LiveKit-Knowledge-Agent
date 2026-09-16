// Local-development (and traditional/long-lived hosting) entry point. On Vercel this
// file is never run - api/index.js imports ./app.js directly and Vercel invokes it
// per-request without ever calling .listen(). Keeping the Express app definition
// (app.js) separate from this process-lifecycle wrapper is what lets the same app
// work both ways.
const mongoose = require('mongoose');
const app = require('./app');

// A truly uncaught exception leaves the process in an unknown state - log it and
// exit so the process manager (nodemon, pm2, a host's restart policy) restarts a
// clean process, rather than silently continuing on corrupted state. Unhandled
// rejections are logged only: every route/service already wraps its own awaits in
// try/catch, so one reaching here is an unexpected edge case worth surfacing, not
// proof the process is unsafe to keep running. Deliberately not registered in app.js:
// calling process.exit() from inside a Vercel serverless invocation would kill the
// whole function environment out from under any other in-flight request.
process.on('uncaughtException', (err) => {
  console.error('✗ Uncaught exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('✗ Unhandled promise rejection:', reason);
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 API docs: http://localhost:${PORT}/api`);
});

// Most host platforms send SIGTERM before replacing/stopping an instance. Stop
// accepting new connections and close the DB connection cleanly instead of having
// in-flight requests or the Mongo socket cut off mid-operation.
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
