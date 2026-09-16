const express = require('express');
const multer = require('multer');
const path = require('path');
const authenticateToken = require('../middleware/auth');
const fileController = require('../controllers/fileController');

const router = express.Router();

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1E9);
    cb(null, `${timestamp}-${random}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 52428800,
  },
});

router.post('/upload', authenticateToken, upload.single('file'), fileController.uploadFile);
router.get('/', authenticateToken, fileController.listFiles);
router.get('/:id', authenticateToken, fileController.getFile);
router.delete('/:id', authenticateToken, fileController.deleteFile);

module.exports = router;
