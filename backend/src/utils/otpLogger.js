const AuditLog = require('../models/AuditLog');

// Structured, secret-free logging for auth/signup/OTP events. Every call site passes
// an explicit `extra` object built from known-safe fields (email, attempt counts,
// timings, HTTP status) - never req.body or an OTP/password/secret value - so there
// is no path for a secret to reach these logs by accident.
const LEVELS = {
  info: 'log',
  warn: 'warn',
  error: 'error',
};

// Writes to both the console (for platforms where function logs are reachable) and
// the AuditLog collection (for this project's Vercel deployment, where they
// generally aren't - see GET /api/internal/audit-logs). The DB write is best-effort
// and awaited by every caller so it completes before the response is sent - a
// serverless invocation can be frozen right after res.json() returns, which would
// silently drop an un-awaited write. A logging failure is swallowed (after being
// reported to the console) so it can never break the actual auth/OTP flow.
async function logEvent(scope, event, email, extra = {}, level = 'info') {
  const entry = {
    ts: new Date().toISOString(),
    scope,
    event,
    email,
    ...extra,
  };
  const method = LEVELS[level] || 'log';
  console[method](JSON.stringify(entry));

  try {
    await AuditLog.create({ scope, event, email, level, meta: extra });
  } catch (err) {
    console.error('Failed to persist audit log:', err.message);
  }
}

function logOtpEvent(event, email, extra = {}, level = 'info') {
  return logEvent('otp', event, email, extra, level);
}

function logAuthEvent(event, email, extra = {}, level = 'info') {
  return logEvent('auth', event, email, extra, level);
}

module.exports = { logOtpEvent, logAuthEvent };
