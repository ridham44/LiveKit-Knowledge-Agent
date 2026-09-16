const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authenticateToken = require('../middleware/auth');
const fileController = require('../controllers/fileController');

const router = express.Router();

// Purely a temporary staging spot for the duration of one upload request - the file
// written here is deleted by processDocument (see services/documents/processingService.js)
// as soon as its text has been extracted into MongoDB, which is the actual persistent
// store. That means this can safely be the app's own ephemeral filesystem in production
// (no Persistent Disk needed); UPLOAD_DIR just exists so local dev/tests can point it
// elsewhere if useful. Relative paths resolve against the backend project root; absolute
// paths are used as-is.
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
