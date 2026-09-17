// pdfjs-dist (via its optional @napi-rs/canvas integration) expects a handful of
// browser-only globals - DOMMatrix, Path2D, ImageData - to exist, even for pure text
// extraction with no page rendering: a module-level constant
// (`const SCALE_MATRIX = new DOMMatrix();`) runs unconditionally at import time,
// and a few internal code paths reachable from plain getTextContent() (not just
// page.render()) construct/transform DOMMatrix instances. Locally, @napi-rs/canvas's
// native binding supplies working versions of these and everything works
// transparently. On Vercel, that native binding doesn't provide a working DOMMatrix
// (confirmed in production - PDF uploads failed with "DOMMatrix is not defined"), a
// known class of problem for native canvas/graphics bindings on Lambda-like
// serverless runtimes - so this provides pure-JS substitutes instead, installed only
// if nothing (a real browser, or a working canvas polyfill) has already provided one.
//
// DOMMatrix here is a real, spec-correct 2D affine-matrix implementation (not a
// stub) - it covers exactly the methods pdfjs-dist's Node/legacy build actually
// calls (confirmed by inspecting its bundled code): the no-arg and 6-value-array
// constructor forms, translate(), scale(), multiplySelf(), preMultiplySelf(), and
// invertSelf(). Path2D/ImageData are inert stubs: because this module is only ever
// used for text extraction (getDocument + page.getTextContent(), never
// page.render()), nothing here needs to produce a correct pixel/path result - they
// only need to exist so a reachable-but-unused code path can construct one without
// throwing a ReferenceError.

function multiply2D(m1, m2) {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

class DOMMatrixPolyfill {
  constructor(init) {
    if (Array.isArray(init) && init.length === 6) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = init;
    } else {
      this.a = 1;
      this.b = 0;
      this.c = 0;
      this.d = 1;
      this.e = 0;
      this.f = 0;
    }
  }

  clone() {
    return new DOMMatrixPolyfill([this.a, this.b, this.c, this.d, this.e, this.f]);
  }

  // Mutates self to self × other (spec order for DOMMatrix.multiplySelf).
  multiplySelf(other) {
    Object.assign(this, multiply2D(this, other));
    return this;
  }

  // Mutates self to other × self (prepend - spec order for preMultiplySelf).
  preMultiplySelf(other) {
    Object.assign(this, multiply2D(other, this));
    return this;
  }

  // Mutates self to its own inverse. A singular (non-invertible) matrix becomes all
  // NaN, matching the DOMMatrix spec rather than throwing.
  invertSelf() {
    const { a, b, c, d, e, f } = this;
    const det = a * d - b * c;
    if (det === 0) {
      this.a = this.b = this.c = this.d = this.e = this.f = NaN;
    } else {
      this.a = d / det;
      this.b = -b / det;
      this.c = -c / det;
      this.d = a / det;
      this.e = (c * f - d * e) / det;
      this.f = (b * e - a * f) / det;
    }
    return this;
  }

  // Non-mutating: returns a new matrix (matches DOMMatrix.translate/scale, as
  // opposed to the *Self variants above).
  translate(tx = 0, ty = 0) {
    return this.clone().multiplySelf({ a: 1, b: 0, c: 0, d: 1, e: tx, f: ty });
  }

  scale(sx = 1, sy = sx) {
    return this.clone().multiplySelf({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
  }
}

class Path2DPolyfill {
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  arc() {}
  arcTo() {}
  ellipse() {}
  rect() {}
  roundRect() {}
  closePath() {}
  addPath() {}
}

class ImageDataPolyfill {
  constructor(dataOrWidth, widthOrHeight, height) {
    if (dataOrWidth instanceof Uint8ClampedArray) {
      this.data = dataOrWidth;
      this.width = widthOrHeight;
      this.height = height;
    } else {
      this.width = dataOrWidth;
      this.height = widthOrHeight;
      this.data = new Uint8ClampedArray(Math.max(0, this.width * this.height * 4));
    }
  }
}

function installPdfCanvasPolyfills() {
  if (!globalThis.DOMMatrix) globalThis.DOMMatrix = DOMMatrixPolyfill;
  if (!globalThis.Path2D) globalThis.Path2D = Path2DPolyfill;
  if (!globalThis.ImageData) globalThis.ImageData = ImageDataPolyfill;
}

module.exports = { installPdfCanvasPolyfills };
