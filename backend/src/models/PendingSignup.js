const mongoose = require('mongoose');

// Holds signup form data + OTP state for an account that has NOT been created yet -
// the real User document is only written once verifySignupOtp succeeds (see
// authController.js). passwordHash is stored pre-hashed (same bcrypt as User), never
// the plaintext password, so this collection carries no more risk than User itself.
//
// createdAt has a TTL index: Mongo deletes the whole document 1 hour after the
// session started, regardless of resends. That's the hard ceiling on a stuck/abandoned
// signup session - well past the 5 resends x 30s cooldown any legitimate flow needs,
// and it means expired sessions clean themselves up with no manual job.
const pendingSignupSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  name: {
    type: String,
    required: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other', 'not-specified'],
    default: 'not-specified',
  },
  companyName: {
    type: String,
    default: '',
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
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60, // seconds - TTL index, see comment above
  },
});

module.exports = mongoose.model('PendingSignup', pendingSignupSchema);
