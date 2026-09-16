const { getPublicAppUrl } = require('./publicUrl');

// Static allowlist for the cases that are NOT same-origin: local development, where
// Vite's dev server (5173) calls the API on a different port (5000), and any custom
// domain that for some reason isn't reflected in the request's own Host header.
function buildStaticAllowlist() {
  const origins = new Set();

  origins.add(process.env.FRONTEND_DEV_URL || 'http://localhost:5173');
  origins.add(getPublicAppUrl());

  if (process.env.VERCEL_URL) origins.add(`https://${process.env.VERCEL_URL}`);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) origins.add(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  if (process.env.VERCEL_BRANCH_URL) origins.add(`https://${process.env.VERCEL_BRANCH_URL}`);

  (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((o) => origins.add(o));

  return origins;
}

const staticAllowlist = buildStaticAllowlist();

// The primary check is genuine same-origin: does the request's Origin header match
// the host it was actually sent to? That works automatically for the production
// domain, every preview deployment, and any custom domain - with no dependency on
// Vercel's system env vars being populated under a particular name, which the
// `cors` package's static-origin-list approach would otherwise require (and which
// silently breaks login/signup with an opaque browser-side "network error" if that
// env var ever isn't what's expected - CORS rejections are invisible to
// try/catch on the server, since the browser blocks the response client-side).
function isAllowedOrigin(origin, req) {
  if (!origin) return true; // same-origin navigations and non-browser callers don't send this
  if (staticAllowlist.has(origin)) return true;

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function cors(req, res, next) {
  const origin = req.headers.origin;

  if (origin && isAllowedOrigin(origin, req)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      req.headers['access-control-request-headers'] || 'Content-Type,Authorization,X-Internal-Secret'
    );
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }

  next();
}

module.exports = { cors };
