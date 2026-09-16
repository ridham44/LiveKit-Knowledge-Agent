const jwt = require('jsonwebtoken');
const User = require('../models/User');

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

exports.signup = async (req, res) => {
  try {
    // Checked before any DB write: if this throws, it must do so before the user is
    // created, not after - jwt.sign() happening last (after User.save()) meant a
    // missing secret left a "ghost" account in Mongo with no way for the client to
    // ever get a token for it, and no way to retry (the email is now "taken").
    const jwtSecret = getJwtSecret();

    const { name, email, password, gender, companyName } = req.body;

    // Validation
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

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create user
    const user = new User({
      name,
      email,
      gender,
      companyName,
    });

    await user.setPassword(password);
    await user.save();

    // Generate token
    const token = jwt.sign(
      { id: user._id, email: user.email },
      jwtSecret,
      { expiresIn: JWT_EXPIRE }
    );

    res.status(201).json({
      token,
      user: user.toJSON(),
    });
  } catch (error) {
    console.error('Signup error:', error);
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
