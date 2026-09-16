// Resolves this app's own public URL, used for both the OpenRouter `HTTP-Referer`
// header (aiProvider.js) and as a trusted CORS origin (app.js) - one computation
// shared by both instead of two separately-configured env vars that could drift.
//
// Priority:
//   1. APP_URL              - explicit override, e.g. a custom domain attached to the
//                              Vercel project (https://app.example.com).
//   2. VERCEL_PROJECT_PRODUCTION_URL - auto-populated by Vercel; the project's stable
//                              production domain (survives across deploys).
//   3. VERCEL_URL            - auto-populated by Vercel for every deployment, including
//                              previews; always the *current* deployment's own domain.
//   4. FRONTEND_DEV_URL      - local development fallback (Vite's default port).
function getPublicAppUrl() {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.FRONTEND_DEV_URL || 'http://localhost:5173';
}

module.exports = { getPublicAppUrl };
