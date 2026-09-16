const { PDFParse } = require('pdf-parse');
const fs = require('fs');

// pdf-parse v2's API is a class (`new PDFParse({ data }).getText()`), not the callable
// function v1 had - `PDFParse` must come from a destructured import, not a default one.
async function extractTextFromPDF(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: dataBuffer });

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
