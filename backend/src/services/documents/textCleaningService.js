function normalizeText(text) {
  return text
    // Strip decorative divider/separator lines (----, ====, ____, ~~~~, ****, etc.)
    // that carry no semantic meaning but dominate embeddings when repeated often.
    .replace(/^[ \t]*[-=_~*.]{8,}[ \t]*$/gm, '')
    // Collapse long runs of spaces (table alignment padding) into one space.
    .replace(/[ \t]{3,}/g, ' ')
    // Collapse 3+ blank lines left behind into a single blank line.
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = {
  normalizeText,
};
