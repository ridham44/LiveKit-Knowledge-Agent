const { getPublicAppUrl } = require('./publicUrl');

// Frontend and API are served from the same Vercel deployment (same-origin), so in
// production the browser doesn't even need CORS for its own calls - this allowlist
// exists for local development (Vite dev server on a different port than the API)
// and for any custom domain attached to the Vercel project.
function buildAllowedOrigins() {
  const origins = new Set();

  origins.add(process.env.FRONTEND_DEV_URL || 'http://localhost:5173');
  origins.add(getPublicAppUrl());

  // Vercel auto-populates these for every deployment (production and previews) - no
  // manual configuration needed for the deployed frontend to be trusted by its own API.
  if (process.env.VERCEL_URL) origins.add(`https://${process.env.VERCEL_URL}`);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) origins.add(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  if (process.env.VERCEL_BRANCH_URL) origins.add(`https://${process.env.VERCEL_BRANCH_URL}`);

  // Extra custom domain(s), comma-separated, for anything not covered above.
  (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((o) => origins.add(o));

  return origins;
}

const allowedOrigins = buildAllowedOrigins();

const corsOptions = {
  origin(origin, callback) {
    // No Origin header means a same-origin page navigation or a non-browser caller
    // (curl, server-to-server) - neither is subject to CORS in the first place.
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

module.exports = { corsOptions, allowedOrigins };
