const { PDFParse } = require('pdf-parse');

// Takes the file's raw bytes directly (no disk access) - the caller reads the upload
// into memory via multer's memoryStorage and never writes it to a filesystem, since
// Vercel serverless functions have no persistent/writable project disk.
// pdf-parse v2's API is a class (`new PDFParse({ data }).getText()`), not the callable
// function v1 had - `PDFParse` must come from a destructured import, not a default one.
async function extractTextFromPDF(buffer) {
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();

    return {
      text: (result.text || '').trim(),
      pageCount: result.total,
    };
  } catch (error) {
    throw new Error(`PDF extraction failed: ${error.message}`);
  } finally {
    await parser.destroy();
  }
}

module.exports = {
  extractTextFromPDF,
};
