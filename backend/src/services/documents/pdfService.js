const pdfParse = require('pdf-parse');
const fs = require('fs');

async function extractTextFromPDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);

    let text = '';
    if (data.text) {
      text = data.text;
    }

    return {
      text: text.trim(),
      pageCount: data.numpages,
    };
  } catch (error) {
    throw new Error(`PDF extraction failed: ${error.message}`);
  }
}

module.exports = {
  extractTextFromPDF,
};
