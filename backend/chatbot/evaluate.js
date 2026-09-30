// backend/chatbot/evaluate.js   →   run from backend folder:
//   node chatbot/evaluate.js                          (default: data/eval_questions.json)
//   node chatbot/evaluate.js holdout_questions.json   (any file in data/, or a full path)
// For every question: embed → $vectorSearch → take the single best chunk → hit/miss + score.
// Prints accuracy, lowest "on" score, highest "off" score, suggests a threshold and
// saves <file>_thresholds.csv (every threshold 0.50–0.90) for an Excel chart. No Gemini call.
// (Member 2 er retriever ekhono nei — tai ekhane nijer search; onno test script gulo eta import kore)
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { embed } from './embedder.js';
import { getCollection, closeMongo } from './mongoClient.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(here, 'data');
const DEFAULT_FILE = 'eval_questions.json';

// Phase 5 (CB-8) er tuning e je setting chilo shetai — vector_index, 100 candidate
export async function searchTop(question, limit = 1) {
  const col = await getCollection();
  const queryVector = await embed(question);
  return col.aggregate([
    { $vectorSearch: { index: 'vector_index', path: 'embedding', queryVector, numCandidates: 100, limit } },
    { $project: { _id: 0, text: 1, chunkIndex: 1, score: { $meta: 'vectorSearchScore' } } }
  ]).toArray();
}

// .env theke threshold — shudhu ei ekta value print kora allowed
export function getThreshold() {
  const t = Number(process.env.CHATBOT_SCORE_THRESHOLD);
  return Number.isFinite(t) && t > 0 && t < 1 ? t : null;
}

// "holdout_questions.json" dile data/ folder e khoje, full path dile shetai
export function resolveDataFile(name) {
  if (fs.existsSync(name)) return path.resolve(name);
  return path.join(DATA_DIR, name);
}

// Question file: { "questions": [ { "q", "type": "on"|"off", "expect"?, "status"? } ] }
// status "wait" = feature ekhono FAQ te nei (step 8) — skip kora hoy
export function loadQuestions(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.questions;
  if (!Array.isArray(list)) throw new Error(`${path.basename(file)} has no "questions" array`);

  const questions = [];
  let skipped = 0;
  list.forEach((item, i) => {
    if (typeof item.q !== 'string' || !['on', 'off'].includes(item.type)) {
      throw new Error(`${path.basename(file)} entry ${i + 1} needs "q" (text) and "type" ("on" or "off")`);
    }
    if (item.status === 'wait') skipped++;
    else questions.push(item);
  });
  return { questions, skipped };
}

// Hit = top chunk e expected text ache (upper/lower case ignore). expect ekta string ba string er list (jekono ekta)
export function isHit(text, expect) {
  const list = Array.isArray(expect) ? expect : [expect];
  const lower = String(text).toLowerCase();
  return list.some(e => lower.includes(String(e).toLowerCase()));
}

// Chunk er shudhu question line (Q: … A: er age) — table e dekhanor jonno
export function questionLine(text) {
  const t = String(text);
  return t.startsWith('Q:') ? t.split(/\bA:/)[0].trim() : t.slice(0, 60) + '…';
}

const toPct = (n, total) => (total === 0 ? '-' : `${((n / total) * 100).toFixed(1)}%`);

// Threshold suggestion: shob on > shob off hole majhkhane; noile 0.50–0.90 sweep e best balance
export function suggestThreshold(onScores, offScores) {
  const sweep = [];
  for (let i = 50; i <= 90; i++) {
    const t = i / 100; // integer loop — float jog korle 0.5700000001 hoy
    const onAnswered = onScores.filter(s => s >= t).length;
    const offBlocked = offScores.filter(s => s < t).length;
    const parts = [];
    if (onScores.length) parts.push(onAnswered / onScores.length);
    if (offScores.length) parts.push(offBlocked / offScores.length);
    const balance = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
    sweep.push({ threshold: t, onAnswered, onTotal: onScores.length, offBlocked, offTotal: offScores.length, balance });
  }

  const minOn = onScores.length ? Math.min(...onScores) : null;
  const maxOff = offScores.length ? Math.max(...offScores) : null;
  if (minOn !== null && maxOff !== null && minOn > maxOff) {
    return { value: Math.round(((minOn + maxOff) / 2) * 100) / 100, method: 'midpoint (every on > every off)', sweep };
  }

  // Best balance; same score e onek value hole tader majher ta nei (duik e shoman margin)
  const best = Math.max(...sweep.map(r => r.balance));
  const tied = sweep.filter(r => r.balance === best);
  return { value: tied[Math.floor(tied.length / 2)].threshold, method: `best balance on 0.50–0.90 sweep (${toPct(best, 1)})`, sweep };
}

function saveSweepCsv(file, sweep) {
  const csvFile = file.replace(/\.json$/i, '') + '_thresholds.csv';
  const lines = ['threshold,on_answered,on_total,on_answered_pct,off_blocked,off_total,off_blocked_pct,balance'];
  for (const r of sweep) {
    const onPct = r.onTotal ? ((r.onAnswered / r.onTotal) * 100).toFixed(1) : '';
    const offPct = r.offTotal ? ((r.offBlocked / r.offTotal) * 100).toFixed(1) : '';
    lines.push([r.threshold.toFixed(2), r.onAnswered, r.onTotal, onPct, r.offBlocked, r.offTotal, offPct, (r.balance * 100).toFixed(1)].join(','));
  }
  fs.writeFileSync(csvFile, lines.join('\n') + '\n');
  return csvFile;
}

async function main() {
  const file = resolveDataFile(process.argv[2] || DEFAULT_FILE);
  const { questions, skipped } = loadQuestions(file);
  const threshold = getThreshold();
  const problems = [];

  console.log(`Question file: ${path.relative(process.cwd(), file)}  (${questions.length} questions, ${skipped} waiting)`);
  console.log(`CHATBOT_SCORE_THRESHOLD = ${threshold ?? 'NOT SET'}`);
  if (threshold === null) problems.push('CHATBOT_SCORE_THRESHOLD is missing or not a number between 0 and 1');

  // Expected text shotti kono chunk e ache kina — na thakle question file e vul
  const col = await getCollection();
  const chunks = await col.find({}, { projection: { text: 1, chunkIndex: 1 } }).toArray();
  const expectedChunk = expect => chunks.find(c => isHit(c.text, expect));

  const rows = [];
  for (const [i, item] of questions.entries()) {
    const [top] = await searchTop(item.q);
    // Ingest er thik porei index notun chunk dhorte ~1 min lage — tokhon search faka ashe
    if (!top) problems.push(`#${i + 1} no search result — if you just re-ingested, wait ~1 minute for vector_index to sync and re-run`);
    const score = top ? top.score : 0;
    const hit = item.type === 'on' && item.expect ? isHit(top?.text ?? '', item.expect) : null;
    if (item.type === 'on' && item.expect && !expectedChunk(item.expect)) {
      problems.push(`#${i + 1} expected text not found in any chunk: ${JSON.stringify(item.expect)}`);
    }
    rows.push({ n: i + 1, item, score, hit, top });
  }

  const hasBangla = rows.some(r => r.item.bn);
  console.table(rows.map(r => ({
    '#': r.n,
    type: r.item.type,
    score: r.score.toFixed(4),
    hit: r.hit === null ? '-' : r.hit ? 'HIT' : 'MISS',
    ...(threshold !== null && { decision: r.score >= threshold ? 'answer' : 'block' }),
    ...(hasBangla && { bangla: r.item.bn ?? '' }),
    question: r.item.q
  })));

  const on = rows.filter(r => r.item.type === 'on');
  const off = rows.filter(r => r.item.type === 'off');
  const graded = on.filter(r => r.hit !== null);
  const hits = graded.filter(r => r.hit).length;
  const onScores = on.map(r => r.score);
  const offScores = off.map(r => r.score);

  console.log(`\nAccuracy (right FAQ entry first): ${hits}/${graded.length} (${toPct(hits, graded.length)})`);
  if (on.length) {
    const low = on.reduce((a, b) => (b.score < a.score ? b : a));
    console.log(`Lowest "on" score:  ${low.score.toFixed(4)}  ← ${low.item.q}`);
  }
  if (off.length) {
    const high = off.reduce((a, b) => (b.score > a.score ? b : a));
    console.log(`Highest "off" score: ${high.score.toFixed(4)}  ← ${high.item.q}`);
  }

  if (threshold !== null) {
    const onAnswered = on.filter(r => r.score >= threshold).length;
    const offBlocked = off.filter(r => r.score < threshold).length;
    console.log(`At ${threshold}: on answered ${onAnswered}/${on.length}, off blocked ${offBlocked}/${off.length}`);
    on.filter(r => r.score < threshold).forEach(r => problems.push(`"on" blocked at ${threshold}: ${r.item.q} (${r.score.toFixed(4)})`));
    off.filter(r => r.score >= threshold).forEach(r => problems.push(`"off" answered at ${threshold}: ${r.item.q} (${r.score.toFixed(4)})`));
  }

  const suggestion = suggestThreshold(onScores, offScores);
  console.log(`Suggested threshold: ${suggestion.value.toFixed(2)}  — ${suggestion.method}`);
  console.log(`Threshold sweep saved: ${path.relative(process.cwd(), saveSweepCsv(file, suggestion.sweep))}`);

  // Miss hole: ki pelo ar kon FAQ entry pawa uchit chilo
  const misses = graded.filter(r => !r.hit);
  if (misses.length) {
    console.log(`\nMisses (${misses.length}):`);
    for (const r of misses) {
      const should = expectedChunk(r.item.expect);
      console.log(`  #${r.n} "${r.item.q}"${r.item.bn ? `  [${r.item.bn}]` : ''}`);
      console.log(`     got:      [chunk ${r.top?.chunkIndex}] ${questionLine(r.top?.text ?? '')}  (${r.score.toFixed(4)})`);
      console.log(`     expected: [chunk ${should?.chunkIndex ?? '?'}] ${should ? questionLine(should.text) : JSON.stringify(r.item.expect)}`);
      problems.push(`MISS #${r.n}: ${r.item.q}`);
    }
  }

  if (problems.length) {
    console.log(`\n❌ ${problems.length} problem(s):`);
    problems.forEach(p => console.log('  - ' + p));
    process.exitCode = 1;
  } else {
    console.log('\n✅ All questions passed');
  }
}

// Shudhu "node chatbot/evaluate.js" chalale main() — onno script import korle na
const isMain = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (isMain) {
  try {
    await main();
  } catch (err) {
    console.error('Evaluation FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await closeMongo(); // fail korleo connection bondho
  }
}
