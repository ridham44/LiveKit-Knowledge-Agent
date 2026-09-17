const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RESENDS = 5; // resend requests allowed per verification session (signup or password reset)
const RESEND_COOLDOWN_MS = 30 * 1000; // minimum gap between resends
const MAX_VERIFY_ATTEMPTS = 5; // wrong-code guesses allowed against one OTP
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000; // window to actually set a new password after OTP verification

// Each digit drawn uniformly so the padded form (e.g. "004321") stays a true 6-digit,
// 10^6-combination code rather than only ever producing values >= 100000.
function generateOtp() {
  return crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0');
}

async function hashOtp(otp) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(otp, salt);
}

function verifyOtp(otp, otpHash) {
  return bcrypt.compare(otp, otpHash);
}

// High-entropy bearer credential handed to the client once, after a password-reset
// OTP verifies, so the final "set new password" call doesn't need the OTP re-entered.
// Stored hashed (via hashOtp/verifyOtp above - same bcrypt operations, just reused for
// a different secret) exactly like the OTP itself, never in plaintext.
function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  OTP_LENGTH,
  OTP_TTL_MS,
  MAX_RESENDS,
  RESEND_COOLDOWN_MS,
  MAX_VERIFY_ATTEMPTS,
  RESET_TOKEN_TTL_MS,
  generateOtp,
  hashOtp,
  verifyOtp,
  generateResetToken,
};
