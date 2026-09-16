const express = require('express');
const internalAuth = require('../middleware/internalAuth');
const internalController = require('../controllers/internalController');

const router = express.Router();

router.post('/voice-chat', internalAuth, internalController.voiceChat);

module.exports = router;
