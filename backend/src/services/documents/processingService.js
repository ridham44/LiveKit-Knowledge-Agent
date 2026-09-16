const File = require('../../models/File');
const DocumentChunk = require('../../models/DocumentChunk');
const { extractTextFromPDF } = require('./pdfService');
const { extractTextFromDOCX } = require('./docxService');
const { extractTextFromTXT } = require('./txtService');
const { chunkText } = require('./chunkingService');
const { generateEmbeddings } = require('../ai/embeddingService');

async function processDocument(fileId) {
  let file;
  try {
    file = await File.findById(fileId);
    if (!file) {
      throw new Error('File not found');
    }

    file.status = 'processing';
    await file.save();

    // Extract text based on file type
    let extractedData;
    switch (file.fileType) {
      case 'pdf':
        extractedData = await extractTextFromPDF(file.filePath);
        break;
      case 'docx':
        extractedData = await extractTextFromDOCX(file.filePath);
        break;
      case 'txt':
        extractedData = await extractTextFromTXT(file.filePath);
        break;
      default:
        throw new Error(`Unsupported file type: ${file.fileType}`);
    }

    const { text } = extractedData;
    file.textContent = text;

    // Chunk the text
    const chunks = chunkText(text, 1000, 100);

    if (chunks.length === 0) {
      throw new Error('No text content extracted from file');
    }

    // Generate embeddings for all chunks
    const embeddings = await generateEmbeddings(chunks);

    // Store chunks with embeddings
    const documentChunks = chunks.map((chunk, index) => ({
      userId: file.userId,
      fileId: file._id,
      fileName: file.fileName,
      fileType: file.fileType,
      chunkIndex: index,
      text: chunk,
      embedding: embeddings[index],
    }));

    await DocumentChunk.insertMany(documentChunks);

    // Update file status
    file.status = 'processed';
    file.chunkCount = chunks.length;
    file.updatedAt = new Date();
    await file.save();

    console.log(`✓ Document processed: ${file.fileName} (${chunks.length} chunks)`);
  } catch (error) {
    console.error('Document processing error:', error);
    if (file) {
      file.status = 'failed';
      file.errorMessage = error.message;
      file.updatedAt = new Date();
      await file.save();
    }
  }
}

module.exports = {
  processDocument,
};
