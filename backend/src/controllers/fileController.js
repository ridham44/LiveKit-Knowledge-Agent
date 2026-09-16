const File = require('../models/File');
const path = require('path');

const { processDocument } = require('../services/documents/processingService');

exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { originalname, size, buffer } = req.file;
    const fileType = getFileType(originalname);

    // Validate file type
    if (!['pdf', 'docx', 'txt'].includes(fileType)) {
      return res.status(400).json({ error: 'Unsupported file type. Supported: PDF, DOCX, TXT' });
    }

    const file = new File({
      userId: req.user.id,
      fileName: originalname,
      fileType,
      fileSize: size,
      status: 'pending',
    });

    await file.save();

    // Processed synchronously (awaited) rather than fire-and-forget: a serverless
    // function isn't guaranteed to keep running after the response is sent, so
    // extraction/chunking/embedding has to finish before responding. This also means
    // the status returned below is always the real outcome ('processed' or 'failed'),
    // not a 'pending' placeholder the client had no way to follow up on.
    await processDocument(file._id, buffer);

    const processed = await File.findById(file._id)
      .select('fileName fileType fileSize status chunkCount errorMessage createdAt');

    res.status(201).json(processed);
  } catch (error) {
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

    // Delete associated document chunks
    const DocumentChunk = require('../models/DocumentChunk');
    await DocumentChunk.deleteMany({ fileId: file._id, userId: req.user.id });

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
    '.txt': 'txt',
  };
  return typeMap[ext] || null;
}
