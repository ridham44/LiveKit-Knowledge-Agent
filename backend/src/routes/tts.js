const express = require('express');
const authenticateToken = require('../middleware/auth');
const ttsController = require('../controllers/ttsController');

const router = express.Router();

router.post('/speak', authenticateToken, ttsController.speak);

module.exports = router;
