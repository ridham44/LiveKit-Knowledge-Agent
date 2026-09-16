const File = require('../models/File');
const fs = require('fs').promises;
const path = require('path');

const { processDocument } = require('../services/documents/processingService');

exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { originalname, filename, size, mimetype } = req.file;
    const fileType = getFileType(originalname);

    // Validate file type
    if (!['pdf', 'docx', 'txt'].includes(fileType)) {
      await fs.unlink(req.file.path);
      return res.status(400).json({ error: 'Unsupported file type. Supported: PDF, DOCX, TXT' });
    }

    // Validate file size (50MB max)
    const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 52428800;
    if (size > MAX_FILE_SIZE) {
      await fs.unlink(req.file.path);
      return res.status(400).json({ error: 'File too large. Max size: 50MB' });
    }

    // Create file record
    const file = new File({
      userId: req.user.id,
      fileName: originalname,
      fileType,
      fileSize: size,
      filePath: req.file.path,
      status: 'pending',
    });

    await file.save();

    // Process document asynchronously
    processDocument(file._id).catch(err => {
      console.error('Document processing error:', err);
    });

    res.status(201).json({
      _id: file._id,
      fileName: file.fileName,
      fileType: file.fileType,
      fileSize: file.fileSize,
      status: file.status,
      createdAt: file.createdAt,
    });
  } catch (error) {
    if (req.file) {
      await fs.unlink(req.file.path).catch(err => console.error(err));
    }
    res.status(500).json({ error: error.message });
  }
};

exports.listFiles = async (req, res) => {
  try {
    const files = await File.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .select('fileName fileType fileSize status chunkCount createdAt');

    res.json(files);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getFile = async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json(file);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteFile = async (req, res) => {
  try {
    const file = await File.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete physical file
    try {
      await fs.unlink(file.filePath);
    } catch (err) {
      console.error('Error deleting file:', err);
    }

    // Delete associated document chunks
    const DocumentChunk = require('../models/DocumentChunk');
    await DocumentChunk.deleteMany({ fileId: file._id });

    res.json({ message: 'File deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const typeMap = {
    '.pdf': 'pdf',
    '.docx': 'docx',
    '.doc': 'docx',
    '.txt': 'txt',
  };
  return typeMap[ext] || null;
}
