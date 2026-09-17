const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RESENDS = 5; // resend requests allowed per signup verification session
const RESEND_COOLDOWN_MS = 30 * 1000; // minimum gap between resends
const MAX_VERIFY_ATTEMPTS = 5; // wrong-code guesses allowed against one OTP

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

module.exports = {
  OTP_LENGTH,
  OTP_TTL_MS,
  MAX_RESENDS,
  RESEND_COOLDOWN_MS,
  MAX_VERIFY_ATTEMPTS,
  generateOtp,
  hashOtp,
  verifyOtp,
};
