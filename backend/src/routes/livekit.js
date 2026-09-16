const express = require('express');
const authenticateToken = require('../middleware/auth');
const livekitController = require('../controllers/livekitController');

const router = express.Router();

router.post('/token', authenticateToken, livekitController.generateToken);

module.exports = router;
