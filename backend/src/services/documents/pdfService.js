// Takes the file's raw bytes directly (no disk access) - the caller reads the upload
// into memory via multer's memoryStorage and never writes it to a filesystem, since
// Vercel serverless functions have no persistent/writable project disk.
// pdf-parse v2's API is a class (`new PDFParse({ data }).getText()`), not the callable
// function v1 had - `PDFParse` must come from a destructured import, not a default one.
//
// require()'d lazily, inside the function, rather than at module top-level: pdf-parse
// pulls in @napi-rs/canvas, a native (non-JS) binary dependency, transitively. Every
// route in this app is reachable through one shared Express app module (app.js), which
// requires every route file - including this one - unconditionally at cold start. If a
// native dependency ever fails to load on Vercel's runtime (a missing native binding,
// a platform mismatch, a missing system shared library - all real, documented failure
// modes for native canvas/graphics bindings specifically on Lambda-like runtimes), a
// top-level require() throws synchronously and takes down the ENTIRE app - every route,
// including login/signup, which have nothing to do with PDFs. Deferring the require to
// call time means that failure - if it happens - is scoped to PDF uploads only, caught
// by processDocument's try/catch (status becomes 'failed' with a clear error message),
// instead of crashing the whole API.
async function extractTextFromPDF(buffer) {
  const { PDFParse } = require('pdf-parse');
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
