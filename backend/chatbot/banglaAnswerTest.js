// backend/chatbot/banglaAnswerTest.js   →   run from backend folder:
//   node chatbot/banglaAnswerTest.js          (12 fixed questions, ~20 Gemini calls)
//   node chatbot/banglaAnswerTest.js --all    (+ every natural and unrelated Bangla question in data/bangla_questions.json)
//
// End-to-end Bangla test (plan step 9): the REAL controller askChatbot() is called with the
// Bangla / Banglish text itself → detect language → Gemini translate → Atlas search → Gemini answer.
// For each question it checks:
//   on      → answered (inContext true) AND the answer is in the question's language
//   off     → blocked (inContext false) AND the refusal is in the question's language
//   en      → English question still answered in English (nothing changed for English)
// Calls Gemini (needs GEMINI_API_KEY) — waits between questions so the free quota is not hit.
// Exit code 1 if any ✗.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { closeMongo } from './mongoClient.js';
import { detectLanguage } from './translate.js';
import { askChatbot } from '../controllers/chatbotController.js';

const DATA_FILE = path.join(import.meta.dirname, 'data', 'bangla_questions.json');
const WAIT_MS = Number(process.env.BANGLA_TEST_WAIT_MS || 4000);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const FIXED_CASES = [
  { type: 'on', q: 'ফরেনট্রেস সিস্টেমটা আসলে কী কাজ করে?' },
  { type: 'on', q: 'ডিএনএ নমুনা কীভাবে নিবন্ধন করব?' },
  { type: 'on', q: 'ল্যাব টেকনিশিয়ানের কাজ কী?' },
  { type: 'on', q: 'ম্যাচ পাকা হলে কী হয়?' },
  { type: 'on', q: 'DNA sample kivabe register korbo?' },
  { type: 'on', q: 'officer ki ki korte pare?' },
  { type: 'off', q: 'ভাত কীভাবে রান্না করব?' },
  { type: 'off', q: 'বাংলাদেশের রাজধানী কোথায়?' },
  { type: 'off', q: 'biryani kivabe ranna korbo?' },
  { type: 'small', q: 'ধন্যবাদ!' },
  { type: 'small', q: 'হ্যালো' },
  { type: 'on', q: 'How do I register a DNA sample?' }
];

// Controller ke ekta nokol req/res diye call kora (server/rate limiter chara)
async function ask(question) {
  const res = {
    code: 200,
    body: null,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; }
  };
  await askChatbot({ body: { question } }, res);
  return res;
}

// Answer ta ki question er bhashay? (Bangla okkhor / Banglish / English)
function answerLanguageOk(lang, answer) {
  const hasBangla = /[\u0980-\u09FF]/.test(answer);
  if (lang === 'bn') return hasBangla;
  if (lang === 'banglish') return !hasBangla && detectLanguage(answer) === 'banglish';
  return !hasBangla;
}

function loadCases() {
  if (!process.argv.includes('--all')) return FIXED_CASES;
  const file = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const fromFile = file.questions
    .filter(x => x.bn && (x.kind === 'natural' || x.kind === 'unrelated'))
    .map(x => ({ type: x.type, q: x.bn }));
  return [...FIXED_CASES, ...fromFile.filter(c => !FIXED_CASES.some(f => f.q === c.q))];
}

async function main() {
  const cases = loadCases();
  console.log(`Bangla end-to-end test: ${cases.length} questions (threshold ${process.env.CHATBOT_SCORE_THRESHOLD || 0.65})\n`);
  let pass = 0;

  for (const [i, c] of cases.entries()) {
    const lang = detectLanguage(c.q);
    const res = await ask(c.q);
    const answer = res.body?.answer || res.body?.message || '';
    const inContext = res.body?.inContext === true;

    let ok;
    if (res.code !== 200) ok = false;
    else if (c.type === 'off') ok = !inContext && answerLanguageOk(lang, answer);
    else ok = inContext && answerLanguageOk(lang, answer);

    if (ok) pass++;
    const verdict = c.type === 'off' ? (inContext ? 'answered' : 'blocked') : (inContext ? 'answered' : 'BLOCKED');
    console.log(`${ok ? '✓' : '✗'} #${i + 1} [${c.type}, ${lang}] ${c.q}`);
    console.log(`     ${res.code} ${verdict}: ${answer.replace(/\s+/g, ' ').slice(0, 160)}\n`);

    // small talk e Gemini call hoy na, tai opekkha lage na
    if (c.type !== 'small' && i < cases.length - 1) await sleep(WAIT_MS);
  }

  console.log(`Result: ${pass}/${cases.length} ✓`);
  if (pass !== cases.length) process.exitCode = 1;
}

main()
  .catch(err => { console.error('Test failed:', err.message); process.exitCode = 1; })
  .finally(closeMongo);
