const mongoose = require('mongoose');

// Holds OTP + reset-token state for a forgot-password request. Separate from
// PendingSignup (which carries full signup form data for an account that doesn't
// exist yet) since this is for an EXISTING, already-verified User - conflating the
// two would mean a signup attempt and a password-reset attempt for the same email
// fight over one document.
//
// createdAt has a TTL index for the same reason as PendingSignup: a hard 1-hour
// ceiling on an abandoned reset session, well past the 5 resends x 30s cooldown any
// legitimate flow needs, so stale sessions clean themselves up with no manual job.
const passwordResetSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  otpHash: {
    type: String,
    required: true,
  },
  otpExpiresAt: {
    type: Date,
    required: true,
  },
  otpAttempts: {
    type: Number,
    default: 0,
  },
  resendCount: {
    type: Number,
    default: 0,
  },
  lastSentAt: {
    type: Date,
    required: true,
  },
  // Set once the OTP has been verified - only then can resetTokenHash be used to
  // actually change the password, via POST /api/auth/reset-password.
  verified: {
    type: Boolean,
    default: false,
  },
  resetTokenHash: {
    type: String,
    default: null,
  },
  resetTokenExpiresAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60, // seconds - TTL index, see comment above
  },
});

module.exports = mongoose.model('PasswordReset', passwordResetSchema);
