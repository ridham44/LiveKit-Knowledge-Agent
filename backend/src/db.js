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

  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/knowledgevoice', {
        // Keeps each function instance's pool small - many concurrent serverless
        // invocations each hold their own pool, and Atlas' free-tier connection cap
        // (500) is shared across all of them.
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10_000,
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
