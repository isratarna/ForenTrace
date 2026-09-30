// backend/chatbot/chunker.js
// Cuts the FAQ text into small pieces ("chunks").
// Rule 1: every "Q:" starts a new chunk, so a question and its answer stay together.
// Rule 2: if a piece is still too long (> 150 words), cut it into 150-word windows
//         with 30 words of overlap so no sentence loses its meaning at the border.
// (Pura PDF er ekta embedding hole shob topic mishe jay — tai ekta Q&A = ekta chunk = ekta meaning)

// Safety split: boro block ke 150-word window e kata, protita window porer tar sathe 30 word share kore
function splitByWords(text, maxWords = 150, overlap = 30) {
  const words = text.split(' ');
  if (words.length <= maxWords) return [text]; // choto hole jemon ache temon-i ekta chunk

  const pieces = [];
  // protibar (150 - 30) = 120 word agay jai, tai porer window er shuru te ager 30 word thake
  for (let start = 0; start < words.length; start += maxWords - overlap) {
    pieces.push(words.slice(start, start + maxWords).join(' '));
    if (start + maxWords >= words.length) break; // shesh word porjonto pouche gele thamo
  }
  return pieces;
}

export function chunkText(rawText) {
  // Pre-process: PDF extraction er extra space/new line ke ekta space banano
  const clean = rawText.replace(/\s+/g, ' ').trim();

  const blocks = clean
    .split(/(?=Q:)/)             // split right before every "Q:" (lookahead, tai "Q:" chunk er vitore-i thake)
    .map(b => b.trim())
    .filter(b => b.length > 20); // ignore tiny empty pieces

  // Protita block ke dorkar hole 150-word window e bhag kore ekta flat list banano
  const chunks = [];
  for (const block of blocks) {
    chunks.push(...splitByWords(block));
  }
  return chunks;
}
