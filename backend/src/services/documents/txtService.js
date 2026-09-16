const fs = require('fs');

async function extractTextFromTXT(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    return {
      text: text.trim(),
    };
  } catch (error) {
    throw new Error(`TXT extraction failed: ${error.message}`);
  }
}

module.exports = {
  extractTextFromTXT,
};
