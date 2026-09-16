const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authenticateToken = require('../middleware/auth');
const fileController = require('../controllers/fileController');

const router = express.Router();

// Configurable so production can point this at a mounted persistent disk
// (e.g. Render: UPLOAD_DIR=/var/data/uploads) instead of the app's own ephemeral
// filesystem. Relative paths (the local-dev default) resolve against the backend
// project root; absolute paths are used as-is.
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, '../../uploads');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
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
