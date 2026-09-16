const File = require('../../models/File');
const DocumentChunk = require('../../models/DocumentChunk');
const { extractTextFromPDF } = require('./pdfService');
const { extractTextFromDOCX } = require('./docxService');
const { extractTextFromTXT } = require('./txtService');
const { normalizeText } = require('./textCleaningService');
const { chunkText } = require('./chunkingService');
const { generateEmbeddings } = require('../ai/embeddingService');

// Runs synchronously inside the upload request (the caller awaits this) rather than
// fire-and-forget in the background. A serverless function's execution is not
// guaranteed to keep running once a response has been sent, so there's no reliable
// way to keep extracting/chunking/embedding *after* responding to the client - unlike
// a long-lived server process, which is what the original fire-and-forget version of
// this assumed. `buffer` is the upload's raw bytes, held only in memory for the life
// of this request; nothing here ever touches a filesystem, so nothing depends on a
// temp file still existing afterward.
async function processDocument(fileId, buffer) {
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
        extractedData = await extractTextFromPDF(buffer);
        break;
      case 'docx':
        extractedData = await extractTextFromDOCX(buffer);
        break;
      case 'txt':
        extractedData = await extractTextFromTXT(buffer);
        break;
      default:
        throw new Error(`Unsupported file type: ${file.fileType}`);
    }

    const { text } = extractedData;
    const cleanedText = normalizeText(text);
    file.textContent = cleanedText;

    // Chunk the cleaned text
    const chunks = chunkText(cleanedText, 1000, 100);

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
