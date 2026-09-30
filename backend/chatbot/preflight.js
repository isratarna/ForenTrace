// backend/chatbot/preflight.js   →   run from backend folder: node chatbot/preflight.js
// One ✅ / ❌ per check, keeps going after a ❌, exit code 1 if any check failed:
//   1. .env: MONGODB_URI and CHATBOT_SCORE_THRESHOLD set (only the threshold is shown)
//   2. Embedding model works (384 numbers)
//   3. The real FAQ is loaded (no sample-seed chunks, at least 25 chunks)
//   4. vector_index exists, READY and queryable
//   5. Smoke test: a known question finds the right chunk above the threshold
// No Gemini call. (Demo/test er age ekbar chalale bojha jay shob thik ache kina)
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { embed } from './embedder.js';
import { getCollection, closeMongo } from './mongoClient.js';
import { searchTop, getThreshold, questionLine } from './evaluate.js';

const EXPECTED_SOURCE = 'forentrace_faq.pdf';
const EMBEDDING_SIZE = 384;
const MIN_CHUNKS = 25; // real FAQ e 37 ta — 25 er kom mane vul PDF ba sample data
const SMOKE_QUESTION = 'How do I register a DNA sample?';
const SMOKE_EXPECT = 'How do I register (add, create, collect) a DNA sample';
const SYNC_WAIT_MS = 10000; // ingest er por index sync er jonno 10s kore wait
const SYNC_TRIES = 7;       // mot ~60s

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Ekta check chalay — error hole ❌ print kore porer check e jay (thame na)
async function check(name, fn) {
  try {
    const detail = await fn();
    console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`);
    return true;
  } catch (err) {
    console.log(`❌ ${name} — ${err.message}`);
    return false;
  }
}

export async function runPreflight() {
  const results = [];

  results.push(await check('1. .env settings', async () => {
    const missing = [];
    if (!process.env.MONGODB_URI) missing.push('MONGODB_URI');
    if (getThreshold() === null) missing.push('CHATBOT_SCORE_THRESHOLD (number between 0 and 1)');
    if (missing.length) throw new Error(`missing: ${missing.join(', ')}`);
    return `MONGODB_URI set, CHATBOT_SCORE_THRESHOLD = ${getThreshold()}`; // URI er value kokhono print na
  }));

  results.push(await check('2. Embedding model', async () => {
    const vector = await embed('hello forentrace');
    if (vector.length !== EMBEDDING_SIZE || !vector.every(Number.isFinite)) {
      throw new Error(`vector has ${vector.length} numbers, expected ${EMBEDDING_SIZE}`);
    }
    return `vector length ${vector.length}`;
  }));

  results.push(await check('3. Real FAQ loaded', async () => {
    const col = await getCollection();
    const count = await col.countDocuments();
    const others = await col.countDocuments({ source: { $ne: EXPECTED_SOURCE } });
    if (others > 0) throw new Error(`${others} chunk(s) not from ${EXPECTED_SOURCE} (sample-seed left?) — run node chatbot/ingest.js`);
    if (count < MIN_CHUNKS) throw new Error(`only ${count} chunks, expected at least ${MIN_CHUNKS} — run node chatbot/ingest.js`);
    return `${count} chunks, all from ${EXPECTED_SOURCE}`;
  }));

  results.push(await check('4. vector_index', async () => {
    const col = await getCollection();
    const [index] = await col.listSearchIndexes('vector_index').toArray();
    if (!index) throw new Error('vector_index not found — run node chatbot/createIndex.js');
    const field = index.latestDefinition?.fields?.find(f => f.path === 'embedding');
    if (field && field.numDimensions !== EMBEDDING_SIZE) throw new Error(`index has ${field.numDimensions} dimensions, expected ${EMBEDDING_SIZE}`);
    if (index.status !== 'READY' || index.queryable === false) throw new Error(`status ${index.status}, queryable ${index.queryable} — wait 1–2 minutes and re-run`);
    return `READY, queryable, ${field?.numDimensions ?? '?'} dims, ${field?.similarity ?? '?'}`;
  }));

  results.push(await check('5. Smoke test', async () => {
    const threshold = getThreshold();
    if (threshold === null) throw new Error('no threshold to compare with (see check 1)');

    // Ingest er thik porei search faka ashe — ~60s porjonto index sync er jonno wait kori
    // (chunk ba index-i na thakle wait kore labh nei — tokhon ekbar-i try)
    const tries = results[2] && results[3] ? SYNC_TRIES : 1;
    let top;
    for (let attempt = 1; attempt <= tries; attempt++) {
      [top] = await searchTop(SMOKE_QUESTION);
      if (top) break;
      if (attempt < tries) {
        console.log(`   …no search result yet, waiting for vector_index to sync (${attempt}/${tries - 1})`);
        await sleep(SYNC_WAIT_MS);
      }
    }
    if (!top) throw new Error(tries > 1 ? 'search still returns nothing after ~60s' : 'search returns nothing (see checks 3 and 4)');

    const found = `"${SMOKE_QUESTION}" → ${questionLine(top.text)} (${top.score.toFixed(4)})`;
    if (!top.text.toLowerCase().includes(SMOKE_EXPECT.toLowerCase())) throw new Error(`wrong chunk: ${found}`);
    if (top.score < threshold) throw new Error(`score below threshold ${threshold}: ${found}`);
    return found;
  }));

  const passed = results.filter(Boolean).length;
  console.log(`\nPre-flight: ${passed}/${results.length} checks passed`);
  return passed === results.length;
}

// Shudhu "node chatbot/preflight.js" chalale — teachTest.js import kore nijei chalay
const isMain = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (isMain) {
  try {
    if (!(await runPreflight())) process.exitCode = 1;
  } catch (err) {
    console.error('Pre-flight FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await closeMongo(); // fail korleo connection bondho
  }
}
