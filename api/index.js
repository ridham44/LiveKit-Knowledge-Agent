// Vercel serverless function entry point. Every request under /api/* is rewritten to
// this function (see vercel.json), and Vercel's Node.js runtime accepts any
// (req, res) => {} handler - an Express app instance satisfies that signature
// directly, so the existing Express app can be exported as-is with no adapter
// package (e.g. serverless-http) needed. Express itself still does the routing: the
// rewrite preserves the original request path, so req.url inside the app is the
// real path (e.g. /api/auth/login), not literally "/api/index".
//
// This process never calls .listen() and never binds a port - Vercel invokes the
// exported handler directly per request, reusing the warm module (and therefore the
// cached DB connection and keep-alive HTTP agent from backend/src/app.js) across
// nearby invocations of the same function instance.
module.exports = require('../backend/src/app');
