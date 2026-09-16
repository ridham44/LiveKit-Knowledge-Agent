const express = require('express');
const multer = require('multer');
const authenticateToken = require('../middleware/auth');
const fileController = require('../controllers/fileController');

const router = express.Router();

// Vercel serverless functions have no persistent/writable project filesystem (only a
// small ephemeral /tmp, wiped between cold starts) - and this app's RAG pipeline
// never needs the original file again after extracting its text (see
// processingService.js), so the upload is kept entirely in memory for the life of
// the request instead of ever touching disk. `req.file.buffer` is what
// fileController.uploadFile passes on to processDocument.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    // Vercel Functions hard-cap the total request body at 4.5MB - a platform limit
    // that raising MAX_FILE_SIZE cannot bypass (the platform rejects it with a 413
    // before the function even runs). 4MB leaves headroom for multipart/form-data
    // overhead while staying under that ceiling.
    fileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 4 * 1024 * 1024,
  },
});

router.post('/upload', authenticateToken, upload.single('file'), fileController.uploadFile);
router.get('/', authenticateToken, fileController.listFiles);
router.get('/:id', authenticateToken, fileController.getFile);
router.delete('/:id', authenticateToken, fileController.deleteFile);

module.exports = router;
