// Structured, secret-free logging for the signup-OTP flow. Every call site passes an
// explicit `extra` object built from known-safe fields (email, attempt counts,
// timings) - never req.body or an OTP/password value - so there is no path for a
// secret to reach these logs by accident.
const LEVELS = {
  info: 'log',
  warn: 'warn',
  error: 'error',
};

function logOtpEvent(event, email, extra = {}, level = 'info') {
  const entry = {
    ts: new Date().toISOString(),
    scope: 'otp',
    event,
    email,
    ...extra,
  };
  const method = LEVELS[level] || 'log';
  console[method](JSON.stringify(entry));
}

module.exports = { logOtpEvent };
