// backend/chatbot/checkChunks.js   →   run from backend folder: node chatbot/checkChunks.js
// Reads every chunk in Atlas (faq_chunks) and flags anything that would blur a chunk's meaning:
// not starting with "Q:", page numbers, header/footer/heading text, too short, too long,
// duplicates, and leftover sample-seed chunks. Exit code 1 if any problem is found.
// (Word er header/footer/page number PDF e dhuke chunk e mishe jay — ei script sheta dhore)
import 'dotenv/config';
import { getCollection, closeMongo } from './mongoClient.js';

const EXPECTED_SOURCE = 'forentrace_faq.pdf'; // ingest.js ei source diye insert kore
const EMBEDDING_SIZE = 384;
const MIN_WORDS = 15;   // er cheye choto hole kichu ekta kete gese
const MAX_WORDS = 120;  // er cheye boro hole shomvoboto duita Q&A jora lege gese (FAQ er longest ~75)

// Header / footer / section-heading text — intro chunk chara onno kothao thakar kotha na
const HEADER_PATTERNS = [
  /Frequently Asked Questions/i,
  /\bFAQ\b/,
  /\bAbout ForenTrace\b/,
  /\bConfidential\b/i,
  /\bSection \d+/i,
  /\bTable of Contents\b/i
];

// Page number er chehara: "Page 3", "Page 3 of 5", "- 3 -", ba sentence er por eka ekta number
const PAGE_NUMBER_PATTERNS = [
  /\bPage\s+\d+(\s+of\s+\d+)?\b/i,
  /(^|\s)-\s?\d{1,3}\s?-(\s|$)/,
  /^\d{1,3}\s/,                       // chunk er shurute number
  /[.!?")]\s+\d{1,3}$/,               // chunk er sheshe eka number
  /[.!?")]\s+\d{1,3}\s+(?=[A-Z])/     // duita sentence er majhe eka number
];

const wordCount = text => text.split(/\s+/).filter(Boolean).length;
const snippet = (text, n = 70) => (text.length > n ? text.slice(0, n) + '…' : text);

// Ekta chunk er shob problem list kore (intro = shob cheye choto chunkIndex, "Q:" chara shuru hote pare)
function findProblems(doc, isIntro) {
  const problems = [];
  const text = doc.text || '';
  const words = wordCount(text);

  if (doc.source !== EXPECTED_SOURCE || /seed/i.test(String(doc.source))) {
    problems.push(`leftover chunk from source "${doc.source}" (not the real FAQ)`);
  }
  if (!Array.isArray(doc.embedding) || doc.embedding.length !== EMBEDDING_SIZE) {
    problems.push(`embedding has ${doc.embedding?.length ?? 0} numbers, expected ${EMBEDDING_SIZE}`);
  }
  if (!isIntro && !text.startsWith('Q:')) {
    problems.push(`does not start with "Q:" → starts with "${snippet(text, 40)}"`);
  }
  if (words === 0) {
    problems.push('empty chunk');
  } else if (words < MIN_WORDS) {
    problems.push(`very short (${words} words)`);
  }
  if (words > MAX_WORDS) {
    problems.push(`very long (${words} words) — probably two Q&As glued together`);
  }
  if (!isIntro && text.startsWith('Q:') && !/\bA:/.test(text)) {
    problems.push('question has no "A:" answer');
  }
  const qCount = (text.match(/\bQ:/g) || []).length;
  const aCount = (text.match(/\bA:/g) || []).length;
  if (qCount > 1 || aCount > 1) {
    problems.push(`contains ${qCount} "Q:" and ${aCount} "A:" — two Q&As in one chunk`);
  }

  for (const re of PAGE_NUMBER_PATTERNS) {
    const m = text.match(re);
    if (m) {
      problems.push(`stray page number → "${m[0].trim()}"`);
      break; // ekta chunk e ekbar bollei jothesto
    }
  }

  if (!isIntro) {
    for (const re of HEADER_PATTERNS) {
      const m = text.match(re);
      if (m) problems.push(`header/footer/heading text → "${m[0]}"`);
    }
  }

  // Answer shob shomoy full stop diye shesh hoy — sheshe punctuation chara lekha thakle sheta heading/footer
  const tail = text.match(/[.!?")]\s+([^.!?]*[^\s.!?")])$/);
  if (tail && wordCount(tail[1]) >= 1) {
    problems.push(`text after the last sentence (heading/footer?) → "${snippet(tail[1], 50)}"`);
  } else if (words > 0 && !/[.!?")]$/.test(text.trim())) {
    problems.push(`does not end with a full stop → "…${text.slice(-40)}"`);
  }

  return problems;
}

try {
  const col = await getCollection();
  const docs = await col.find({}).sort({ chunkIndex: 1 }).toArray();
  const allProblems = []; // { chunkIndex, problem, text }

  if (docs.length === 0) {
    allProblems.push({ chunkIndex: '-', problem: 'faq_chunks is empty — run node chatbot/ingest.js', text: '' });
  }

  docs.forEach((doc, i) => {
    const isIntro = i === 0 && !String(doc.text).startsWith('Q:');
    for (const problem of findProblems(doc, isIntro)) {
      allProblems.push({ chunkIndex: doc.chunkIndex, problem, text: doc.text });
    }
  });

  // Duplicate: same full text, ba same question line (Q: ... A: er age porjonto)
  const seenText = new Map();
  const seenQuestion = new Map();
  for (const doc of docs) {
    const norm = String(doc.text).toLowerCase().replace(/\s+/g, ' ').trim();
    const question = norm.startsWith('q:') ? norm.split(/\ba:/)[0].trim() : null;
    if (seenText.has(norm)) {
      allProblems.push({ chunkIndex: doc.chunkIndex, problem: `duplicate of chunk ${seenText.get(norm)}`, text: doc.text });
    } else {
      seenText.set(norm, doc.chunkIndex);
      if (question && seenQuestion.has(question)) {
        allProblems.push({ chunkIndex: doc.chunkIndex, problem: `same question as chunk ${seenQuestion.get(question)}`, text: doc.text });
      } else if (question) {
        seenQuestion.set(question, doc.chunkIndex);
      }
    }
  }

  // Header/footer protita page e repeat hoy — ekoi 4-word ending 3+ chunk e thakle flag
  const endings = new Map();
  for (const doc of docs) {
    const ending = String(doc.text).split(/\s+/).slice(-4).join(' ').toLowerCase();
    if (!endings.has(ending)) endings.set(ending, []);
    endings.get(ending).push(doc.chunkIndex);
  }
  for (const [ending, indexes] of endings) {
    if (indexes.length >= 3) {
      allProblems.push({ chunkIndex: indexes.join(','), problem: `same ending "${ending}" in ${indexes.length} chunks (repeated header/footer?)`, text: '' });
    }
  }

  console.log(`Checked ${docs.length} chunks in faq_chunks`);
  const questions = docs.filter(d => String(d.text).startsWith('Q:')).length;
  console.log(`Q&A chunks: ${questions}, intro/other: ${docs.length - questions}`);

  if (allProblems.length === 0) {
    console.log('✅ No problems found');
  } else {
    console.log(`❌ ${allProblems.length} problem(s) found:`);
    console.table(allProblems.map(p => ({ chunk: p.chunkIndex, problem: p.problem, text: snippet(p.text, 60) })));
    process.exitCode = 1;
  }
} catch (err) {
  console.error('Chunk check FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await closeMongo(); // fail korleo connection bondho
}
