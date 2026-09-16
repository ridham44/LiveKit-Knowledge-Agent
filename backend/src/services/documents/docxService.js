const fs = require('fs');
const JSZip = require('jszip');
const xml2js = require('xml2js');

async function extractTextFromDOCX(filePath) {
  try {
    const data = fs.readFileSync(filePath);
    const zip = new JSZip();
    const zipData = await zip.loadAsync(data);

    // Read document.xml
    const documentXml = await zipData.file('word/document.xml').async('text');

    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(documentXml);

    // Extract text from paragraphs
    const body = result['w:document']['w:body'][0];
    let text = '';

    if (body['w:p']) {
      for (const para of body['w:p']) {
        const paraText = extractParagraphText(para);
        if (paraText) {
          text += paraText + '\n';
        }
      }
    }

    return {
      text: text.trim(),
    };
  } catch (error) {
    throw new Error(`DOCX extraction failed: ${error.message}`);
  }
}

function extractParagraphText(para) {
  let text = '';

  if (para['w:r']) {
    for (const run of para['w:r']) {
      if (run['w:t']) {
        for (const t of run['w:t']) {
          // xml2js only wraps a node's text in `{ _: ... }` when it also has XML
          // attributes (e.g. xml:space="preserve"). A <w:t> with no attributes -
          // common for ordinary runs with no leading/trailing whitespace to
          // preserve - parses to a plain string instead, which `t._` would silently
          // skip entirely.
          text += typeof t === 'string' ? t : (t._ || '');
        }
      }
    }
  }

  return text;
}

module.exports = {
  extractTextFromDOCX,
};
