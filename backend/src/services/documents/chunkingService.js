function chunkText(text, chunkSize = 1000, overlap = 100) {
  const chunks = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = Math.min(startIndex + chunkSize, text.length);

    // Try to break at sentence boundary
    if (endIndex < text.length) {
      const lastPeriod = text.lastIndexOf('.', endIndex);
      const lastNewline = text.lastIndexOf('\n', endIndex);
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > startIndex + chunkSize / 2) {
        endIndex = breakPoint + 1;
      }
    }

    const chunk = text.substring(startIndex, endIndex).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // Move start index for next chunk, accounting for overlap
    startIndex = endIndex - overlap;

    // Prevent infinite loop on very small remaining text
    if (startIndex >= text.length) break;
    if (text.length - startIndex < chunkSize / 4) {
      // If remaining text is small, include it in previous chunk or skip
      if (startIndex < text.length) {
        chunks.push(text.substring(startIndex).trim());
      }
      break;
    }
  }

  return chunks;
}

module.exports = {
  chunkText,
};
