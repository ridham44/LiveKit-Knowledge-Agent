// Talks to pdfjs-dist directly (getDocument + page.getTextContent()) rather than
// through the `pdf-parse` wrapper package. pdf-parse v2's getText() turned out to
// also exercise pdfjs-dist's canvas-based page-rendering/glyph-painting code
// internally (paintChar, Path2D, DOMMatrix.invertSelf/multiplySelf) - not just plain
// text-layer extraction - which depends on a full 2D canvas implementation via the
// @napi-rs/canvas native binding. On Vercel that binding doesn't provide a working
// DOMMatrix/canvas (confirmed in production: uploads failed with "DOMMatrix is not
// defined"), which is a known class of problem for native canvas/graphics bindings on
// Lambda-like serverless runtimes (missing shared libraries, or the platform-specific
// binary not surviving the function's dependency bundling).
//
// getDocument() + page.getTextContent() is the standard way most Node.js tooling
// extracts PDF text and does not touch canvas/rendering at all - it walks the
// content stream's text-showing operators directly. pdfjs-dist still *optionally*
// tries to load @napi-rs/canvas at import time (for the page-rendering features this
// module never calls), but gracefully degrades with a warning if that fails, rather
// than throwing - which is exactly the behavior this needs.
//
// require()'d lazily inside the function, not at module top-level, for the same
// reason as before: this route's dependency should never be able to affect the
// cold-start of every other route sharing app.js. pdfjs-dist ships ESM-only, so this
// is a dynamic import() rather than require().
async function extractTextFromPDF(buffer) {
  // Must run before pdfjs-dist is imported - it references `new DOMMatrix()` at
  // module load time (a top-level constant), not just inside functions this module
  // calls. See pdfCanvasPolyfills.js for why this is needed on Vercel specifically.
  require('./pdfCanvasPolyfills').installPdfCanvasPolyfills();

  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    // No worker thread in a serverless function invocation - run inline.
    useWorkerFetch: false,
    isEvalSupported: false,
  });

  let doc;
  try {
    doc = await loadingTask.promise;

    const pageTexts = [];
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      pageTexts.push(content.items.map((item) => item.str).join(' '));
    }

    return {
      text: pageTexts.join('\n').trim(),
      pageCount: doc.numPages,
    };
  } catch (error) {
    throw new Error(`PDF extraction failed: ${error.message}`);
  } finally {
    if (doc) await doc.destroy();
  }
}

module.exports = {
  extractTextFromPDF,
};
