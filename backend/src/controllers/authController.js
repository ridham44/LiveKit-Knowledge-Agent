const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const PendingSignup = require('../models/PendingSignup');
const { sendOtpEmail } = require('../services/emailService');
const { logOtpEvent } = require('../utils/otpLogger');
const {
  OTP_TTL_MS,
  MAX_RESENDS,
  RESEND_COOLDOWN_MS,
  MAX_VERIFY_ATTEMPTS,
  generateOtp,
  hashOtp,
  verifyOtp,
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

    let pending = await PendingSignup.findOne({ email: normalizedEmail });
    const now = Date.now();

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
        logOtpEvent('requested', normalizedEmail, { reused: true });
        return res.status(200).json({
          message: 'A verification code was already sent to your email.',
          ...buildOtpResponse(pending),
        });
      }

      if (pending.resendCount >= MAX_RESENDS) {
        // The last code expired AND resends are exhausted - this session is dead.
        // Rather than trapping the user until the 1-hour TTL cleans it up, start a
        // fresh session with a full resend budget. Only reachable once the OTP has
        // actually expired, so this can't be used to bypass the resend limit.
        pending = null;
      }
    }

    const otp = generateOtp();
    const otpHash = await hashOtp(otp);
    const otpExpiresAt = new Date(now + OTP_TTL_MS);

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
      pending.resendCount += 1;
      pending.lastSentAt = new Date(now);
    }

    logOtpEvent('requested', normalizedEmail);
    let sendInfo;
    try {
      sendInfo = await sendOtpEmail(normalizedEmail, otp);
    } catch (err) {
      logOtpEvent('send_failed', normalizedEmail, {
        error: err.message,
        code: err.code,
        responseCode: err.responseCode,
        response: err.response,
      }, 'error');
      return res.status(502).json({ error: 'Failed to send verification email. Please try again.' });
    }
    // A 250 OK here only means the SMTP relay (SMTP2GO) queued the message - not that
    // it reached the inbox. messageId/response let a delivery issue be traced against
    // SMTP2GO's own Activity dashboard.
    logOtpEvent('sent', normalizedEmail, sendInfo);

    await pending.save();

    res.status(200).json({
      message: 'Verification code sent to your email',
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
      logOtpEvent('resend_failed', normalizedEmail, { reason: 'session_not_found' }, 'warn');
      return res.status(404).json({
        error: 'Signup session not found or expired. Please start signup again.',
        code: 'SESSION_NOT_FOUND',
      });
    }

    const now = Date.now();
    const msSinceLastSent = now - pending.lastSentAt.getTime();
    if (msSinceLastSent < RESEND_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((RESEND_COOLDOWN_MS - msSinceLastSent) / 1000);
      logOtpEvent('resend_blocked_cooldown', normalizedEmail, { retryAfterSeconds }, 'warn');
      return res.status(429).json({
        error: `Please wait ${retryAfterSeconds}s before requesting another code.`,
        code: 'RESEND_COOLDOWN',
        retryAfterSeconds,
      });
    }

    if (pending.resendCount >= MAX_RESENDS) {
      logOtpEvent('resend_limit_reached', normalizedEmail, { resendCount: pending.resendCount }, 'warn');
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

    logOtpEvent('requested', normalizedEmail, { resend: true });
    let sendInfo;
    try {
      sendInfo = await sendOtpEmail(normalizedEmail, otp);
    } catch (err) {
      logOtpEvent('send_failed', normalizedEmail, {
        resend: true,
        error: err.message,
        code: err.code,
        responseCode: err.responseCode,
        response: err.response,
      }, 'error');
      return res.status(502).json({ error: 'Failed to send verification email. Please try again.' });
    }
    logOtpEvent('sent', normalizedEmail, { resend: true, ...sendInfo });

    await pending.save();

    res.status(200).json({
      message: 'Verification code resent',
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
      logOtpEvent('verify_failed', normalizedEmail, { reason: 'session_not_found' }, 'warn');
      return res.status(404).json({
        error: 'Signup session not found or expired. Please start signup again.',
        code: 'SESSION_NOT_FOUND',
      });
    }

    if (pending.otpAttempts >= MAX_VERIFY_ATTEMPTS) {
      logOtpEvent('verify_failed', normalizedEmail, { reason: 'locked' }, 'warn');
      return res.status(429).json({
        error: 'Too many incorrect attempts. Please request a new code.',
        code: 'OTP_LOCKED',
      });
    }

    if (pending.otpExpiresAt.getTime() <= Date.now()) {
      logOtpEvent('expired', normalizedEmail);
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
      logOtpEvent('verify_failed', normalizedEmail, { reason: 'invalid_code', attemptsRemaining }, 'warn');
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
      logOtpEvent('verify_failed', normalizedEmail, { reason: 'already_registered' }, 'warn');
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
        logOtpEvent('verify_failed', normalizedEmail, { reason: 'already_registered' }, 'warn');
        return res.status(400).json({ error: 'Email already registered' });
      }
      throw err;
    }

    await PendingSignup.deleteOne({ _id: pending._id });
    logOtpEvent('verify_success', normalizedEmail);

    const token = jwt.sign(
      { id: user._id, email: user.email },
      jwtSecret,
      { expiresIn: JWT_EXPIRE }
    );

    logOtpEvent('signup_completed', normalizedEmail, { userId: user._id.toString() });

    res.status(201).json({
      token,
      user: user.toJSON(),
    });
  } catch (error) {
    console.error('Verify OTP error:', error.message);
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
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isValid = await user.comparePassword(password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { id: user._id, email: user.email },
      jwtSecret,
      { expiresIn: JWT_EXPIRE }
    );

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

exports.logout = (req, res) => {
  res.json({ message: 'Logged out' });
};
