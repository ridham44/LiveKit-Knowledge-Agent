const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const PendingSignup = require('../models/PendingSignup');
const PasswordReset = require('../models/PasswordReset');
const { sendOtpEmail } = require('../services/emailService');
const { logOtpEvent, logAuthEvent, logPasswordResetEvent } = require('../utils/otpLogger');
const {
  OTP_TTL_MS,
  MAX_RESENDS,
  RESEND_COOLDOWN_MS,
  MAX_VERIFY_ATTEMPTS,
  RESET_TOKEN_TTL_MS,
  generateOtp,
  hashOtp,
  verifyOtp,
  generateResetToken,
} = require('../services/otpService');

const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return process.env.JWT_SECRET;
}

function passwordPolicyError(password) {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  return null;
}

// Timing info the frontend needs to drive the OTP screen's countdowns - derived from
// the stored document rather than kept in separate state, so it's always consistent
// with whatever was just persisted.
function buildOtpResponse(pending) {
  const now = Date.now();
  return {
    email: pending.email,
    otpExpiresInSeconds: Math.max(0, Math.ceil((pending.otpExpiresAt.getTime() - now) / 1000)),
    resendCooldownSeconds: Math.max(0, Math.ceil((RESEND_COOLDOWN_MS - (now - pending.lastSentAt.getTime())) / 1000)),
    resendsRemaining: Math.max(0, MAX_RESENDS - pending.resendCount),
  };
}

// Step 1 of signup: validates the form, does NOT create the account, and emails a
// 6-digit OTP instead. The account is only created by verifySignupOtp below.
exports.signup = async (req, res) => {
  try {
    // Checked before any DB write or email send, same reasoning as before this flow
    // existed: a missing secret must fail before the user is asked to check their
    // inbox, not after (see verifySignupOtp, which is where it's actually used).
    const jwtSecret = getJwtSecret();
    void jwtSecret;

    const { name, email, password, gender, companyName } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }

    const policyError = passwordPolicyError(password);
    if (policyError) {
      return res.status(400).json({ error: policyError });
    }

    const normalizedEmail = email.toLowerCase();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, await bcrypt.genSalt(10));

    // Fetched once and reused for the rest of this request - NEVER discard this
    // reference in favor of `new PendingSignup(...)` while a document for this email
    // might still exist in the DB. Doing that (an earlier version of this code set
    // `pending = null` here to "start a fresh session") makes Mongoose treat the next
    // save() as an INSERT, which collides with the unique index on `email` and throws
    // E11000 - the "duplicate pending signup" bug. Below, an exhausted session is
    // reset via the `sessionExhausted` flag and updated in place instead.
    let pending = await PendingSignup.findOne({ email: normalizedEmail });
    const now = Date.now();
    let sessionExhausted = false;

    if (pending) {
      // Keep the stored form data current regardless of which path below runs - the
      // user may have fixed a typo in name/password before the code arrived.
      pending.name = name;
      pending.passwordHash = passwordHash;
      pending.gender = gender;
      pending.companyName = companyName;

      const otpStillValid = pending.otpExpiresAt.getTime() > now;
      if (otpStillValid) {
        // A code is already out and still valid - resubmitting the form (double
        // click, reopened tab) resumes that session instead of spamming a new email
        // or spending resend budget on nothing.
        await pending.save();
        await logOtpEvent('requested', normalizedEmail, { reused: true });
        return res.status(200).json({
          message: 'A verification code was already accepted by the mail provider for this email. Please check your inbox.',
          ...buildOtpResponse(pending),
        });
      }

      if (pending.resendCount >= MAX_RESENDS) {
        // The last code expired AND resends are exhausted - this session is dead.
        // Rather than trapping the user until the 1-hour TTL cleans it up, start a
        // fresh session with a full resend budget - but reset the SAME document in
        // place (see comment above `pending` for why). Only reachable once the OTP
        // has actually expired, so this can't be used to bypass the resend limit.
        sessionExhausted = true;
      }
    }

    const otp = generateOtp();
    const otpHash = await hashOtp(otp);
    const otpExpiresAt = new Date(now + OTP_TTL_MS);
    const isNewSession = !pending;

    if (!pending) {
      pending = new PendingSignup({
        email: normalizedEmail,
        name,
        passwordHash,
        gender,
        companyName,
        otpHash,
        otpExpiresAt,
        otpAttempts: 0,
        resendCount: 0,
        lastSentAt: new Date(now),
      });
    } else {
      pending.otpHash = otpHash;
      pending.otpExpiresAt = otpExpiresAt;
      pending.otpAttempts = 0;
      pending.resendCount = sessionExhausted ? 0 : pending.resendCount + 1;
      pending.lastSentAt = new Date(now);
    }

    await logOtpEvent('requested', normalizedEmail, sessionExhausted ? { restarted: true } : undefined);
    let sendInfo;
    try {
      sendInfo = await sendOtpEmail(normalizedEmail, otp);
    } catch (err) {
      await logOtpEvent('send_failed', normalizedEmail, {
        error: err.message,
        httpStatus: err.httpStatus,
        brevoCode: err.brevoCode,
      }, 'error');
      return res.status(502).json({ error: 'Failed to send verification email. Please try again.' });
    }
    // A 201 here only means Brevo accepted the message - not that it reached the
    // inbox. messageId/httpStatus let a delivery issue be traced against Brevo's own
    // Transactional > Logs dashboard.
    await logOtpEvent('sent', normalizedEmail, sendInfo);

    try {
      await pending.save();
    } catch (err) {
      if (err.code === 11000 && isNewSession) {
        // Lost a race with a concurrent signup request for the same email that
        // inserted its own PendingSignup between our findOne and this save (two
        // requests both saw "no existing session" and both tried to create one).
        // Re-fetch the document that won the race and apply this request's OTP to
        // it instead, so we still end up with exactly one PendingSignup per email
        // and the code we just emailed is the one that's actually verifiable.
        const winner = await PendingSignup.findOne({ email: normalizedEmail });
        if (!winner) throw err; // genuinely unexpected - don't swallow it
        winner.name = name;
        winner.passwordHash = passwordHash;
        winner.gender = gender;
        winner.companyName = companyName;
        winner.otpHash = otpHash;
        winner.otpExpiresAt = otpExpiresAt;
        winner.otpAttempts = 0;
        winner.resendCount = Math.min(winner.resendCount + 1, MAX_RESENDS);
        winner.lastSentAt = new Date(now);
        await winner.save();
        pending = winner;
        await logOtpEvent('requested', normalizedEmail, { racedDuplicateInsert: true }, 'warn');
      } else {
        throw err;
      }
    }

    res.status(200).json({
      message: 'OTP email accepted by mail provider',
      ...buildOtpResponse(pending),
    });
  } catch (error) {
    console.error('Signup error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// Explicit "Resend code" action from the OTP screen. Always issues a brand new code
// (invalidating the previous one) subject to the cooldown and resend-limit rules.
exports.resendSignupOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    const normalizedEmail = email.toLowerCase();

    const pending = await PendingSignup.findOne({ email: normalizedEmail });
    if (!pending) {
      await logOtpEvent('resend_failed', normalizedEmail, { reason: 'session_not_found' }, 'warn');
      return res.status(404).json({
        error: 'Signup session not found or expired. Please start signup again.',
        code: 'SESSION_NOT_FOUND',
      });
    }

    const now = Date.now();
    const msSinceLastSent = now - pending.lastSentAt.getTime();
    if (msSinceLastSent < RESEND_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((RESEND_COOLDOWN_MS - msSinceLastSent) / 1000);
      await logOtpEvent('resend_blocked_cooldown', normalizedEmail, { retryAfterSeconds }, 'warn');
      return res.status(429).json({
        error: `Please wait ${retryAfterSeconds}s before requesting another code.`,
        code: 'RESEND_COOLDOWN',
        retryAfterSeconds,
      });
    }

    if (pending.resendCount >= MAX_RESENDS) {
      await logOtpEvent('resend_limit_reached', normalizedEmail, { resendCount: pending.resendCount }, 'warn');
      return res.status(429).json({
        error: 'Maximum resend attempts reached. Please restart signup.',
        code: 'RESEND_LIMIT',
      });
    }

    const otp = generateOtp();
    pending.otpHash = await hashOtp(otp);
    pending.otpExpiresAt = new Date(now + OTP_TTL_MS);
    pending.otpAttempts = 0;
    pending.resendCount += 1;
    pending.lastSentAt = new Date(now);

    await logOtpEvent('requested', normalizedEmail, { resend: true });
    let sendInfo;
    try {
      sendInfo = await sendOtpEmail(normalizedEmail, otp);
    } catch (err) {
      await logOtpEvent('send_failed', normalizedEmail, {
        resend: true,
        error: err.message,
        httpStatus: err.httpStatus,
        brevoCode: err.brevoCode,
      }, 'error');
      return res.status(502).json({ error: 'Failed to send verification email. Please try again.' });
    }
    await logOtpEvent('sent', normalizedEmail, { resend: true, ...sendInfo });

    await pending.save();

    res.status(200).json({
      message: 'OTP email accepted by mail provider',
      ...buildOtpResponse(pending),
    });
  } catch (error) {
    console.error('Resend OTP error:', error.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};

// Step 2 of signup: the account is created here, only after the OTP checks out.
exports.verifySignupOtp = async (req, res) => {
  try {
    const jwtSecret = getJwtSecret();

    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and verification code are required' });
    }
    const normalizedEmail = email.toLowerCase();

    const pending = await PendingSignup.findOne({ email: normalizedEmail });
    if (!pending) {
      await logOtpEvent('verify_failed', normalizedEmail, { reason: 'session_not_found' }, 'warn');
      return res.status(404).json({
        error: 'Signup session not found or expired. Please start signup again.',
        code: 'SESSION_NOT_FOUND',
      });
    }

    if (pending.otpAttempts >= MAX_VERIFY_ATTEMPTS) {
      await logOtpEvent('verify_failed', normalizedEmail, { reason: 'locked' }, 'warn');
      return res.status(429).json({
        error: 'Too many incorrect attempts. Please request a new code.',
        code: 'OTP_LOCKED',
      });
    }

    if (pending.otpExpiresAt.getTime() <= Date.now()) {
      await logOtpEvent('expired', normalizedEmail);
      return res.status(400).json({
        error: 'Verification code expired. Please request a new code.',
        code: 'OTP_EXPIRED',
      });
    }

    const isValid = await verifyOtp(String(otp).trim(), pending.otpHash);
    if (!isValid) {
      pending.otpAttempts += 1;
      await pending.save();
      const attemptsRemaining = Math.max(0, MAX_VERIFY_ATTEMPTS - pending.otpAttempts);
      await logOtpEvent('verify_failed', normalizedEmail, { reason: 'invalid_code', attemptsRemaining }, 'warn');
      return res.status(400).json({
        error: 'Incorrect verification code.',
        code: 'OTP_INVALID',
        attemptsRemaining,
      });
    }

    // Guard against the account having been created by a parallel request between
    // the OTP being sent and being verified (e.g. two tabs racing).
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      await PendingSignup.deleteOne({ _id: pending._id });
      await logOtpEvent('verify_failed', normalizedEmail, { reason: 'already_registered' }, 'warn');
      return res.status(400).json({ error: 'Email already registered' });
    }

    const user = new User({
      name: pending.name,
      email: pending.email,
      gender: pending.gender,
      companyName: pending.companyName,
      passwordHash: pending.passwordHash,
    });

    try {
      await user.save();
    } catch (err) {
      if (err.code === 11000) {
        await PendingSignup.deleteOne({ _id: pending._id });
        await logOtpEvent('verify_failed', normalizedEmail, { reason: 'already_registered' }, 'warn');
        return res.status(400).json({ error: 'Email already registered' });
      }
      throw err;
    }

    await PendingSignup.deleteOne({ _id: pending._id });
    await logOtpEvent('verify_success', normalizedEmail);

    const token = jwt.sign(
      { id: user._id, email: user.email },
      jwtSecret,
      { expiresIn: JWT_EXPIRE }
    );

    await logOtpEvent('signup_completed', normalizedEmail, { userId: user._id.toString() });

    res.status(201).json({
      token,
      user: user.toJSON(),
    });
  } catch (error) {
    console.error('Verify OTP error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// Step 1 of password reset: validates the account exists, does NOT change the
// password yet, and emails a 6-digit OTP. Reuses the exact same session-reuse /
// exhausted-session-restart / duplicate-key-race handling as signup's PendingSignup
// (see the comments there) - PasswordReset is a separate collection from
// PendingSignup (this is for an EXISTING, already-verified account) but the same
// class of E11000 bug applies to it, so the same fix applies here too.
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }

    const normalizedEmail = email.toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ error: 'No account found with this email' });
    }

    let reset = await PasswordReset.findOne({ email: normalizedEmail });
    const now = Date.now();
    let sessionExhausted = false;

    if (reset) {
      const otpStillValid = reset.otpExpiresAt.getTime() > now;
      if (otpStillValid) {
        await reset.save();
        await logPasswordResetEvent('requested', normalizedEmail, { reused: true });
        return res.status(200).json({
          message: 'A verification code was already accepted by the mail provider for this email. Please check your inbox.',
          ...buildOtpResponse(reset),
        });
      }

      if (reset.resendCount >= MAX_RESENDS) {
        sessionExhausted = true;
      }
    }

    const otp = generateOtp();
    const otpHash = await hashOtp(otp);
    const otpExpiresAt = new Date(now + OTP_TTL_MS);
    const isNewSession = !reset;

    if (!reset) {
      reset = new PasswordReset({
        email: normalizedEmail,
        otpHash,
        otpExpiresAt,
        otpAttempts: 0,
        resendCount: 0,
        lastSentAt: new Date(now),
      });
    } else {
      reset.otpHash = otpHash;
      reset.otpExpiresAt = otpExpiresAt;
      reset.otpAttempts = 0;
      reset.resendCount = sessionExhausted ? 0 : reset.resendCount + 1;
      reset.lastSentAt = new Date(now);
      reset.verified = false;
      reset.resetTokenHash = null;
      reset.resetTokenExpiresAt = null;
    }

    await logPasswordResetEvent('requested', normalizedEmail, sessionExhausted ? { restarted: true } : undefined);
    let sendInfo;
    try {
      sendInfo = await sendOtpEmail(normalizedEmail, otp, 'password_reset');
    } catch (err) {
      await logPasswordResetEvent('send_failed', normalizedEmail, {
        error: err.message,
        httpStatus: err.httpStatus,
        brevoCode: err.brevoCode,
      }, 'error');
      return res.status(502).json({ error: 'Failed to send verification email. Please try again.' });
    }
    await logPasswordResetEvent('sent', normalizedEmail, sendInfo);

    try {
      await reset.save();
    } catch (err) {
      if (err.code === 11000 && isNewSession) {
        const winner = await PasswordReset.findOne({ email: normalizedEmail });
        if (!winner) throw err; // genuinely unexpected - don't swallow it
        winner.otpHash = otpHash;
        winner.otpExpiresAt = otpExpiresAt;
        winner.otpAttempts = 0;
        winner.resendCount = Math.min(winner.resendCount + 1, MAX_RESENDS);
        winner.lastSentAt = new Date(now);
        winner.verified = false;
        winner.resetTokenHash = null;
        winner.resetTokenExpiresAt = null;
        await winner.save();
        reset = winner;
        await logPasswordResetEvent('requested', normalizedEmail, { racedDuplicateInsert: true }, 'warn');
      } else {
        throw err;
      }
    }

    res.status(200).json({
      message: 'OTP email accepted by mail provider',
      ...buildOtpResponse(reset),
    });
  } catch (error) {
    console.error('Forgot password error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// Explicit "Resend code" action from the password reset OTP screen. Mirrors
// resendSignupOtp exactly, just against PasswordReset instead of PendingSignup.
exports.resendPasswordResetOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    const normalizedEmail = email.toLowerCase();

    const reset = await PasswordReset.findOne({ email: normalizedEmail });
    if (!reset) {
      await logPasswordResetEvent('resend_failed', normalizedEmail, { reason: 'session_not_found' }, 'warn');
      return res.status(404).json({
        error: 'Password reset session not found or expired. Please start again.',
        code: 'SESSION_NOT_FOUND',
      });
    }

    const now = Date.now();
    const msSinceLastSent = now - reset.lastSentAt.getTime();
    if (msSinceLastSent < RESEND_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((RESEND_COOLDOWN_MS - msSinceLastSent) / 1000);
      await logPasswordResetEvent('resend_blocked_cooldown', normalizedEmail, { retryAfterSeconds }, 'warn');
      return res.status(429).json({
        error: `Please wait ${retryAfterSeconds}s before requesting another code.`,
        code: 'RESEND_COOLDOWN',
        retryAfterSeconds,
      });
    }

    if (reset.resendCount >= MAX_RESENDS) {
      await logPasswordResetEvent('resend_limit_reached', normalizedEmail, { resendCount: reset.resendCount }, 'warn');
      return res.status(429).json({
        error: 'Maximum resend attempts reached. Please restart password reset.',
        code: 'RESEND_LIMIT',
      });
    }

    const otp = generateOtp();
    reset.otpHash = await hashOtp(otp);
    reset.otpExpiresAt = new Date(now + OTP_TTL_MS);
    reset.otpAttempts = 0;
    reset.resendCount += 1;
    reset.lastSentAt = new Date(now);
    reset.verified = false;
    reset.resetTokenHash = null;
    reset.resetTokenExpiresAt = null;

    await logPasswordResetEvent('requested', normalizedEmail, { resend: true });
    let sendInfo;
    try {
      sendInfo = await sendOtpEmail(normalizedEmail, otp, 'password_reset');
    } catch (err) {
      await logPasswordResetEvent('send_failed', normalizedEmail, {
        resend: true,
        error: err.message,
        httpStatus: err.httpStatus,
        brevoCode: err.brevoCode,
      }, 'error');
      return res.status(502).json({ error: 'Failed to send verification email. Please try again.' });
    }
    await logPasswordResetEvent('sent', normalizedEmail, { resend: true, ...sendInfo });

    await reset.save();

    res.status(200).json({
      message: 'OTP email accepted by mail provider',
      ...buildOtpResponse(reset),
    });
  } catch (error) {
    console.error('Resend password reset OTP error:', error.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};

// Step 2 of password reset: verifies the OTP and, on success, issues a short-lived
// reset token (stored hashed, same as the OTP itself) that the client then sends to
// resetPassword below. The password itself is not changed here.
exports.verifyPasswordResetOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and verification code are required' });
    }
    const normalizedEmail = email.toLowerCase();

    const reset = await PasswordReset.findOne({ email: normalizedEmail });
    if (!reset) {
      await logPasswordResetEvent('verify_failed', normalizedEmail, { reason: 'session_not_found' }, 'warn');
      return res.status(404).json({
        error: 'Password reset session not found or expired. Please start again.',
        code: 'SESSION_NOT_FOUND',
      });
    }

    if (reset.otpAttempts >= MAX_VERIFY_ATTEMPTS) {
      await logPasswordResetEvent('verify_failed', normalizedEmail, { reason: 'locked' }, 'warn');
      return res.status(429).json({
        error: 'Too many incorrect attempts. Please request a new code.',
        code: 'OTP_LOCKED',
      });
    }

    if (reset.otpExpiresAt.getTime() <= Date.now()) {
      await logPasswordResetEvent('expired', normalizedEmail);
      return res.status(400).json({
        error: 'Verification code expired. Please request a new code.',
        code: 'OTP_EXPIRED',
      });
    }

    const isValid = await verifyOtp(String(otp).trim(), reset.otpHash);
    if (!isValid) {
      reset.otpAttempts += 1;
      await reset.save();
      const attemptsRemaining = Math.max(0, MAX_VERIFY_ATTEMPTS - reset.otpAttempts);
      await logPasswordResetEvent('verify_failed', normalizedEmail, { reason: 'invalid_code', attemptsRemaining }, 'warn');
      return res.status(400).json({
        error: 'Incorrect verification code.',
        code: 'OTP_INVALID',
        attemptsRemaining,
      });
    }

    const resetToken = generateResetToken();
    reset.verified = true;
    reset.resetTokenHash = await hashOtp(resetToken);
    reset.resetTokenExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await reset.save();

    await logPasswordResetEvent('verify_success', normalizedEmail);

    res.status(200).json({
      email: normalizedEmail,
      resetToken,
      resetTokenExpiresInSeconds: Math.round(RESET_TOKEN_TTL_MS / 1000),
    });
  } catch (error) {
    console.error('Verify password reset OTP error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// Step 3 of password reset: consumes the reset token issued by
// verifyPasswordResetOtp above and actually changes the password, then logs the
// user in immediately - same as verifySignupOtp does right after account creation.
exports.resetPassword = async (req, res) => {
  try {
    const jwtSecret = getJwtSecret();

    const { email, resetToken, newPassword } = req.body;
    if (!email || !resetToken || !newPassword) {
      return res.status(400).json({ error: 'Email, reset token, and new password are required' });
    }

    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      return res.status(400).json({ error: policyError });
    }

    const normalizedEmail = email.toLowerCase();

    const reset = await PasswordReset.findOne({ email: normalizedEmail });
    if (!reset || !reset.verified || !reset.resetTokenHash || !reset.resetTokenExpiresAt) {
      await logPasswordResetEvent('reset_failed', normalizedEmail, { reason: 'session_not_found' }, 'warn');
      return res.status(404).json({
        error: 'Password reset session not found or expired. Please verify your code again.',
        code: 'SESSION_NOT_FOUND',
      });
    }

    if (reset.resetTokenExpiresAt.getTime() <= Date.now()) {
      await logPasswordResetEvent('reset_failed', normalizedEmail, { reason: 'token_expired' }, 'warn');
      return res.status(400).json({
        error: 'This reset session has expired. Please verify your code again.',
        code: 'RESET_TOKEN_EXPIRED',
      });
    }

    const tokenValid = await verifyOtp(resetToken, reset.resetTokenHash);
    if (!tokenValid) {
      await logPasswordResetEvent('reset_failed', normalizedEmail, { reason: 'invalid_token' }, 'warn');
      return res.status(400).json({
        error: 'Invalid reset session. Please verify your code again.',
        code: 'RESET_TOKEN_INVALID',
      });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      await PasswordReset.deleteOne({ _id: reset._id });
      await logPasswordResetEvent('reset_failed', normalizedEmail, { reason: 'user_not_found' }, 'warn');
      return res.status(404).json({ error: 'No account found with this email' });
    }

    await user.setPassword(newPassword);
    await user.save();
    await PasswordReset.deleteOne({ _id: reset._id });

    await logPasswordResetEvent('reset_completed', normalizedEmail, { userId: user._id.toString() });

    const token = jwt.sign(
      { id: user._id, email: user.email },
      jwtSecret,
      { expiresIn: JWT_EXPIRE }
    );

    await logAuthEvent('login_success', normalizedEmail, { userId: user._id.toString(), viaPasswordReset: true });

    res.status(200).json({
      token,
      user: user.toJSON(),
    });
  } catch (error) {
    console.error('Reset password error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const jwtSecret = getJwtSecret();

    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      await logAuthEvent('login_failed', email, { reason: 'user_not_found' }, 'warn');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isValid = await user.comparePassword(password);
    if (!isValid) {
      await logAuthEvent('login_failed', email, { reason: 'invalid_password', userId: user._id.toString() }, 'warn');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { id: user._id, email: user.email },
      jwtSecret,
      { expiresIn: JWT_EXPIRE }
    );

    await logAuthEvent('login_success', email, { userId: user._id.toString() });

    res.json({
      token,
      user: user.toJSON(),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user.toJSON());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.logout = async (req, res) => {
  // No auth middleware guards this route (logout must still succeed with an
  // expired/missing token), so identity here is best-effort only: decode the bearer
  // token if one was sent, but never reject the request over it - the response
  // contract (always 200, "Logged out") is unchanged either way.
  let email = null;
  let userId = null;
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token && process.env.JWT_SECRET) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      email = decoded.email;
      userId = decoded.id;
    } catch {
      // Ignore - an expired/invalid token still logs out successfully, just without
      // an identity attached to the audit entry.
    }
  }
  await logAuthEvent('logout', email, userId ? { userId } : undefined);
  res.json({ message: 'Logged out' });
};
