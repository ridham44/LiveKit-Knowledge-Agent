// Takes the file's raw bytes directly (no disk access) - see pdfService.js for why.
async function extractTextFromTXT(buffer) {
  try {
    return {
      text: buffer.toString('utf-8').trim(),
    };
  } catch (error) {
    throw new Error(`TXT extraction failed: ${error.message}`);
  }
}

module.exports = {
  extractTextFromTXT,
};
