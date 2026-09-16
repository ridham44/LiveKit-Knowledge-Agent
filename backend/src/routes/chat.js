const express = require('express');
const authenticateToken = require('../middleware/auth');
const chatController = require('../controllers/chatController');

const router = express.Router();

router.post('/', authenticateToken, chatController.chat);
router.get('/conversations', authenticateToken, chatController.listConversations);
router.get('/conversations/:id', authenticateToken, chatController.getConversation);
router.delete('/conversations/:id', authenticateToken, chatController.deleteConversation);

module.exports = router;
