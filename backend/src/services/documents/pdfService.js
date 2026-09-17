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

  // pdfjs-dist loads its worker module via `await import(this.workerSrc)`, where
  // workerSrc is a runtime string (not a static import specifier) - Vercel's function
  // bundler (@vercel/nft) can only include files it can trace through *static*
  // require()/import() calls, so a dynamic import like that is invisible to it and
  // the worker file silently doesn't make it into the deployed bundle (confirmed in
  // production: "Cannot find module '.../pdf.worker.mjs'" even though it exists in
  // node_modules at build time). require.resolve() with a literal string argument
  // (unlike the dynamic import above) IS something the bundler's static analysis
  // recognizes and traces - using it here, purely for its side effect of forcing this
  // file's inclusion, and pointing workerSrc at the resolved absolute path so the
  // dynamic import above finds it at the same location the bundler placed it.
  // pathToFileURL, not the raw resolved path: Node's ESM dynamic import() requires a
  // file:// URL for absolute paths on Windows (a bare "D:\..." path errors with
  // "Only URLs with a scheme in: file, data, and node are supported") - this works
  // correctly on both Windows (local dev) and Linux (Vercel) either way.
  pdfjsLib.GlobalWorkerOptions.workerSrc = require('url').pathToFileURL(
    require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
  ).href;

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
