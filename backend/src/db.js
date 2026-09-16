const mongoose = require('mongoose');

// Serverless-safe connection caching: Vercel reuses the same warm module instance
// across nearby invocations of the same function, so caching the connection promise
// here (rather than calling mongoose.connect() unconditionally at every request) means
// only the first invocation on a cold container pays the connect cost - every
// invocation after that reuses the existing socket/connection pool. A failed attempt
// clears the cache so the *next* invocation retries instead of permanently caching a
// rejected promise.
let connectionPromise = null;

function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve(mongoose.connection);
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    return Promise.reject(new Error('MONGODB_URI is not configured'));
  }

  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(mongoUri, {
        // Keeps each function instance's pool small - many concurrent serverless
        // invocations each hold their own pool, and Atlas' free-tier connection cap
        // (500) is shared across all of them.
        maxPoolSize: 10,
        // A cold start's first connection (DNS + TLS + Atlas handshake) is slower
        // than a warm container reusing an existing one - 15s gives it a bit more
        // room than the driver's 10s default before giving up, since app.js now
        // awaits this directly on every request rather than relying on Mongoose's
        // own (shorter) command-buffering timeout to paper over a slow cold start.
        serverSelectionTimeoutMS: 15_000,
      })
      .then((conn) => {
        console.log('✓ MongoDB connected');
        return conn;
      })
      .catch((err) => {
        connectionPromise = null;
        console.error('✗ MongoDB connection failed:', err.message);
        throw err;
      });
  }

  return connectionPromise;
}

module.exports = { connectDB };
