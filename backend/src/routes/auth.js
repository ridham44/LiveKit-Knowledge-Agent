const express = require('express');
const authController = require('../controllers/authController');
const authenticateToken = require('../middleware/auth');
const { connectDB } = require('../db');

const router = express.Router();

// The app starts the cached connection during module initialization, but a Vercel
// invocation can reach an auth route before that asynchronous connection settles.
// Await it here instead of letting Mongoose buffer a query and eventually surface a
// misleading generic 500. The same cached promise is reused on warm invocations.
router.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('Authentication database unavailable:', error.message);
    res.status(503).json({ error: 'Authentication service is temporarily unavailable' });
  }
});

router.post('/signup', authController.signup);
router.post('/signup/resend', authController.resendSignupOtp);
router.post('/signup/verify', authController.verifySignupOtp);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', authenticateToken, authController.getMe);

module.exports = router;
