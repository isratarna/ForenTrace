// backend/chatbot/teachTest.js   →   run from backend folder:
//   node chatbot/teachTest.js                        (v2 = Desktop/forentrace_faq_v2.pdf)
//   node chatbot/teachTest.js "D:\some\faq_v2.pdf"   (any other v2 path)
// Shows that the bot learns from the FAQ alone, with no code change:
//   1. search the new question on the current FAQ   → should be BLOCKED (below threshold)
//   2. back up the original FAQ PDF
//   3. put v2 in its place, re-ingest, search again  → should be ANSWERED by the new entry
//   4. ALWAYS restore the original PDF and re-ingest (even if step 3 failed)
//   5. run the pre-flight check to confirm everything is back to normal
// No Gemini call. (FAQ e notun Q&A dilei bot shikhe fele — code change chara)
import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getCollection, closeMongo } from './mongoClient.js';
import { searchTop, getThreshold, isHit, questionLine } from './evaluate.js';
import { runPreflight } from './preflight.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.dirname(here);
const FAQ_PDF = path.join(here, 'data', 'forentrace_faq.pdf');
const BACKUP_PDF = path.join(here, 'data', 'forentrace_faq.backup.pdf'); // crash hole ekhane theke restore
const V2_PDF = process.argv[2] || path.join(os.homedir(), 'Desktop', 'forentrace_faq_v2.pdf');

// v2 er notun Q&A — original FAQ e nei
const NEW_ENTRY = 'Can I delete (remove) an investigation case';
const MAIN_QUESTION = 'Can I delete a case?'; // BEFORE e eta block hote hobe
const EXTRA_QUESTIONS = [                    // onno wording — AFTER e shobai notun entry pabe
  'Can an officer delete an investigation case?',
  'Who can delete a case?',
  'How do I remove a case?'
];
const SYNC_WAIT_MS = 5000;
const SYNC_TRIES = 30; // ~150s porjonto index sync er jonno wait

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// ingest.js alada process e chalano — tar nijer closeMongo amader connection bondho kore na
function runIngest(label) {
  console.log(`\n→ Re-ingest (${label})`);
  const result = spawnSync(process.execPath, ['chatbot/ingest.js'], { cwd: BACKEND_DIR, encoding: 'utf8' });
  const lines = `${result.stdout}\n${result.stderr}`.split(/\r?\n/).filter(l => /Created|Inserted|FAILED/.test(l));
  lines.forEach(l => console.log(`   ${l.trim()}`));
  if (result.status !== 0) throw new Error(`ingest.js failed (${label})`);
  const inserted = lines.join(' ').match(/Inserted (\d+) chunks/);
  return inserted ? Number(inserted[1]) : null;
}

// Ingest er por index notun chunk dhorte shomoy ney — shob chunk search e asha porjonto wait
// Network ekbar timeout dileo (ETIMEDOUT) thami na — porer attempt e abar try
async function waitForIndexSync() {
  let lastError = null;
  for (let attempt = 1; attempt <= SYNC_TRIES; attempt++) {
    try {
      const col = await getCollection();
      const expected = await col.countDocuments();
      const found = (await searchTop('index sync check', 100)).length; // limit 100 ≥ chunk count
      if (found === expected) {
        console.log(`   vector_index synced (${found}/${expected} chunks searchable)`);
        return;
      }
      console.log(`   …waiting for vector_index to sync (${found}/${expected} chunks searchable)`);
    } catch (err) {
      lastError = err;
      console.log(`   …Atlas not reachable (${err.message}), retrying`);
    }
    await sleep(SYNC_WAIT_MS);
  }
  throw new Error(`vector_index did not sync within ~150s${lastError ? ` (last error: ${lastError.message})` : ''}`);
}

// Shob question search kore top result, score, decision table e dekhay
async function measure(label, threshold) {
  const rows = [];
  for (const q of [MAIN_QUESTION, ...EXTRA_QUESTIONS]) {
    const [top] = await searchTop(q);
    const score = top?.score ?? 0;
    rows.push({ q, score, answered: score >= threshold, newEntryFirst: isHit(top?.text ?? '', NEW_ENTRY), top: questionLine(top?.text ?? '') });
  }
  console.log(`\n${label}`);
  console.table(rows.map(r => ({
    question: r.q,
    score: r.score.toFixed(4),
    decision: r.answered ? 'answer' : 'block',
    'new entry first': r.newEntryFirst ? 'yes' : 'no',
    'top chunk': r.top.slice(0, 60)
  })));
  return rows;
}

const results = []; // { step, ok, detail }
const record = (step, ok, detail) => results.push({ step, ok, detail });

try {
  const threshold = getThreshold();
  if (threshold === null) throw new Error('CHATBOT_SCORE_THRESHOLD is not set');
  if (!fs.existsSync(V2_PDF)) throw new Error(`v2 PDF not found: ${V2_PDF}`);
  if (fs.existsSync(BACKUP_PDF)) {
    // Ager run majhpothe theme gele backup theke jay — tokhon original e ki ache bola jay na
    throw new Error(`${path.basename(BACKUP_PDF)} already exists, so an earlier teach test did not finish. ` +
      'Copy it over forentrace_faq.pdf, run node chatbot/ingest.js, delete the backup, then run this again.');
  }
  console.log(`CHATBOT_SCORE_THRESHOLD = ${threshold}`);
  console.log(`v2 PDF: ${V2_PDF}`);

  const col = await getCollection();
  const originalCount = await col.countDocuments();

  // 1. BEFORE — original FAQ
  const before = await measure(`1. BEFORE (original FAQ, ${originalCount} chunks)`, threshold);
  const mainBefore = before[0];
  record('1. Before: main question blocked', !mainBefore.answered,
    `"${MAIN_QUESTION}" ${mainBefore.score.toFixed(4)} → ${mainBefore.answered ? 'ANSWERED (should be blocked)' : 'blocked'}`);
  // Onno wording threshold par hole Gemini ke bolte hobe FAQ te nei — shudhu info
  for (const r of before.slice(1).filter(r => r.answered && !r.newEntryFirst)) {
    console.log(`   ⚠ "${r.q}" passes (${r.score.toFixed(4)}) with an unrelated entry — Gemini must say the FAQ doesn't cover it`);
  }

  // 2. Backup
  const originalHash = sha256(FAQ_PDF);
  fs.copyFileSync(FAQ_PDF, BACKUP_PDF);
  if (sha256(BACKUP_PDF) !== originalHash) throw new Error('backup copy is not identical to the original');
  console.log(`\n2. Backed up original FAQ → ${path.basename(BACKUP_PDF)}`);

  try {
    // 3. v2 boshano + re-ingest + abar search
    fs.copyFileSync(V2_PDF, FAQ_PDF);
    console.log('\n3. Swapped in FAQ v2');
    const v2Count = runIngest('FAQ v2');
    await waitForIndexSync();
    const after = await measure(`3. AFTER (FAQ v2, ${v2Count} chunks)`, threshold);
    const allTaught = after.every(r => r.answered && r.newEntryFirst);
    record('3. After: new entry first and answered', allTaught,
      `"${MAIN_QUESTION}" ${after[0].score.toFixed(4)}; ${after.filter(r => r.answered && r.newEntryFirst).length}/${after.length} wordings answered by the new entry`);
  } catch (err) {
    record('3. After: new entry first and answered', false, err.message);
  } finally {
    // 4. RESTORE — step 3 fail korleo shob shomoy
    try {
      fs.copyFileSync(BACKUP_PDF, FAQ_PDF);
      if (sha256(FAQ_PDF) !== originalHash) throw new Error('restored PDF is not identical to the original');
      console.log('\n4. Restored original FAQ PDF (identical, sha256 checked)');
      const restoredCount = runIngest('original FAQ');
      await waitForIndexSync();
      if (restoredCount !== originalCount) throw new Error(`restored ${restoredCount} chunks, expected ${originalCount}`);
      fs.unlinkSync(BACKUP_PDF); // restore thik hole tobei backup muchi
      record('4. Original FAQ restored', true, `PDF identical, ${restoredCount} chunks re-ingested, backup removed`);
    } catch (err) {
      record('4. Original FAQ restored', false, `${err.message} — backup kept at ${BACKUP_PDF}`);
    }
  }

  // 5. Pre-flight — shob abar normal kina
  console.log('\n5. Pre-flight');
  const preflightOk = await runPreflight();
  record('5. Pre-flight after restore', preflightOk, preflightOk ? 'all checks passed' : 'see ❌ above');
} catch (err) {
  record('Teach test', false, err.message);
} finally {
  console.log('\nTeach test summary:');
  for (const r of results) console.log(`${r.ok ? '✅' : '❌'} ${r.step} — ${r.detail}`);
  if (results.some(r => !r.ok)) process.exitCode = 1;
  await closeMongo(); // fail korleo connection bondho
}
