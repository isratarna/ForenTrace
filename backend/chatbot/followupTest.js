// backend/chatbot/followupTest.js   →   run from backend folder:
//   node chatbot/followupTest.js                          (default: data/followup_questions.json)
//   node chatbot/followupTest.js my_followups.json        (any file in data/, or a full path)
//   node chatbot/followupTest.js --stress                 (+ topic-change stress check, ~3 min)
//
// ⚠ NOTE: the rules below are COPIES made only for testing — the real rule lives in Member 2's code.
//   RULES.plan     = the rule from the plan (what Member 2 was asked to build)
//   RULES.proposed = the improved rule this test suggests to Member 2 (Phase 7b in the change log)
//   The marks and exit code use ACTIVE_RULE; the other rule's totals are printed for comparison.
//   If Member 2's real rule changes, change the copy here too — and tell Member 2 about any change here.
//
// For every entry it searches twice — the new question alone, and "previous + new" together —
// applies the rule and the threshold, and marks the result:
//   followup          ✓ passes with the right (previous-topic) entry, ✗ otherwise
//   change_unrelated  ✓ blocked, ⚠ passes (Gemini must refuse it later — saved for step 10)
//   change_faq        ✓ passes with the NEW topic's entry, ✗ if blocked or pulled to the old topic
// No Gemini call. Exit code 1 if any ✗ with the active rule.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { closeMongo } from './mongoClient.js';
import { searchTop, getThreshold, isHit, questionLine, resolveDataFile, DATA_DIR } from './evaluate.js';

const DEFAULT_FILE = 'followup_questions.json';
const WARNINGS_FILE = path.join(DATA_DIR, 'followup_topic_change_warnings.json'); // step 10 er jonno
const KINDS = ['followup', 'change_unrelated', 'change_faq'];
const STRESS_FILES = ['eval_questions.json', 'holdout_questions.json', 'bangla_questions.json'];
const STRESS_PREVS = ['How do I register a missing person?', 'What can a lab technician do?', 'How does DNA matching work?'];

// ---- COPIES of the follow-up rule (testing only) ----
const MAX_FOLLOWUP_WORDS = 4;
const PRONOUN_RE = /\b(it|that|this|these|those|they|them|there|he|she|him|her)\b/i;
const CUE_START_RE = /^(and|also|what about|how about|which)\b/i; // "What about …?", "Which officer …?"
const CUE_ANY_RE = /\b(instead|as well)\b/i;

const RULES = {
  // Plan: 4 word ba kom, othoba pronoun → follow-up; follow-up hole je search er score beshi sheta
  plan: { name: 'plan rule', cues: false, keepAloneAt: null },
  // Proposed: + follow-up shuru/cue word; ar notun question eka-i ≥ 0.77 pele sheta-i rakho
  // (0.77 = majhkhane: follow-up #7 eka 0.7567 — prev+new lage; topic change #30 eka 0.7902 — eka-i thik)
  proposed: { name: 'proposed rule', cues: true, keepAloneAt: 0.77 }
};
const ACTIVE_RULE = 'proposed';

function followupRule(question, rule) {
  const words = question.trim().split(/\s+/).filter(Boolean);
  if (words.length <= MAX_FOLLOWUP_WORDS) return { isFollowup: true, reason: `${words.length} words` };
  const pronoun = question.match(PRONOUN_RE);
  if (pronoun) return { isFollowup: true, reason: `"${pronoun[1].toLowerCase()}"` };
  if (rule.cues) {
    const cue = question.trim().match(CUE_START_RE) || question.match(CUE_ANY_RE);
    if (cue) return { isFollowup: true, reason: `"${cue[1].toLowerCase()}"` };
  }
  return { isFollowup: false, reason: `${words.length} words, no ${rule.cues ? 'pronoun/cue' : 'pronoun'}` };
}

function chooseSearch(rule, isFollowup, alone, combined) {
  if (!isFollowup) return { which: 'alone', top: alone };
  if (rule.keepAloneAt !== null && alone.score >= rule.keepAloneAt) return { which: 'alone', top: alone }; // eka-i jothesto bhalo
  if (combined.score > alone.score) return { which: 'prev+new', top: combined };
  return { which: 'alone', top: alone };
}
// -----------------------------------------------------

function loadEntries(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.questions;
  if (!Array.isArray(list)) throw new Error(`${path.basename(file)} has no "questions" array`);
  list.forEach((e, i) => {
    if (typeof e.prev !== 'string' || typeof e.q !== 'string' || !KINDS.includes(e.kind)) {
      throw new Error(`${path.basename(file)} entry ${i + 1} needs "prev", "q" and "kind" (${KINDS.join(' / ')})`);
    }
    if (e.kind !== 'change_unrelated' && !e.expect) throw new Error(`${path.basename(file)} entry ${i + 1} (${e.kind}) needs "expect"`);
  });
  return list;
}

// Ek-i text bar bar search na kore cache theke (stress e onek repeat hoy)
const searchCache = new Map();
async function top1(text) {
  if (!searchCache.has(text)) {
    const [top] = await searchTop(text);
    searchCache.set(text, { score: top?.score ?? 0, text: top?.text ?? '' });
  }
  return searchCache.get(text);
}

// Ekta entry ekta rule diye judge kora
function judge(e, alone, combined, rule, threshold) {
  const decision = followupRule(e.q, rule);
  const chosen = chooseSearch(rule, decision.isFollowup, alone, combined);
  const passed = chosen.top.score >= threshold;
  const rightEntry = e.expect ? isHit(chosen.top.text, e.expect) : false;

  let mark;
  if (e.kind === 'change_unrelated') mark = passed ? '⚠' : '✓';
  else mark = passed && rightEntry ? '✓' : '✗';

  // Fail keno — kon dol e porlo
  let why = '';
  if (mark === '✗' && e.kind === 'followup') {
    const combinedWouldWork = combined.score >= threshold && isHit(combined.text, e.expect);
    if (!decision.isFollowup && combinedWouldWork) why = 'rule missed a follow-up';
    else if (decision.isFollowup) why = passed ? 'rule caught it, wrong entry' : 'rule caught it, score too low';
    else why = 'not a follow-up by the rule, and prev+new would not help';
  } else if (mark === '✗' && e.kind === 'change_faq') {
    why = !passed ? 'blocked' : chosen.which === 'prev+new' ? 'pulled to the old topic by prev+new' : 'wrong entry';
  }
  return { decision, chosen, passed, mark, why };
}

function totals(rows, key) {
  const lines = [];
  for (const kind of KINDS) {
    const k = rows.filter(r => r.e.kind === kind);
    if (!k.length) continue;
    const count = m => k.filter(r => r[key].mark === m).length;
    lines.push(`  ${kind.padEnd(17)} ✓ ${count('✓')}/${k.length}${count('✗') ? `   ✗ ${count('✗')}` : ''}${count('⚠') ? `   ⚠ ${count('⚠')}` : ''}`);
  }
  const followups = rows.filter(r => r.e.kind === 'followup');
  lines.push(`  rule detected ${followups.filter(r => r[key].decision.isFollowup).length}/${followups.length} real follow-ups`);
  return lines;
}

// Stress: protiti on-topic question ke onno FAQ topic er por jiggesh kora — rule bhul kore ager topic e tene ne jay kina
async function stressCheck(threshold) {
  const questions = STRESS_FILES.flatMap(f => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')).questions)
    .filter(q => q.type === 'on' && q.status !== 'wait');
  const result = { pairs: 0, alone: 0, plan: 0, proposed: 0, pulled: { plan: [], proposed: [] } };
  for (const prev of STRESS_PREVS) {
    const prevTop = await top1(prev);
    for (const q of questions) {
      if (isHit(prevTop.text, q.expect)) continue; // ager question ek-i topic → topic change na
      result.pairs++;
      const alone = await top1(q.q);
      const combined = await top1(`${prev} ${q.q}`);
      const good = t => t.score >= threshold && isHit(t.text, q.expect);
      if (good(alone)) result.alone++;
      for (const key of ['plan', 'proposed']) {
        const rule = RULES[key];
        const chosen = chooseSearch(rule, followupRule(q.q, rule).isFollowup, alone, combined).top;
        if (good(chosen)) result[key]++;
        else if (good(alone)) result.pulled[key].push(`"${q.q}" after "${prev}"`);
      }
    }
  }
  return result;
}

try {
  const args = process.argv.slice(2);
  const file = resolveDataFile(args.find(a => !a.startsWith('--')) || DEFAULT_FILE);
  const entries = loadEntries(file);
  const threshold = getThreshold();
  if (threshold === null) throw new Error('CHATBOT_SCORE_THRESHOLD is not set');
  const active = RULES[ACTIVE_RULE];
  const other = ACTIVE_RULE === 'plan' ? 'proposed' : 'plan';
  console.log(`Follow-up file: ${path.relative(process.cwd(), file)}  (${entries.length} entries)`);
  console.log(`CHATBOT_SCORE_THRESHOLD = ${threshold}`);
  console.log(`Active: ${active.name} (≤ 4 words or a pronoun${active.cues ? ', or starts with and/also/what about/how about/which, or has instead/as well' : ''}` +
    `${active.keepAloneAt !== null ? `; follow-up keeps the new question alone if it scores ≥ ${active.keepAloneAt}` : ''})\n`);

  const rows = [];
  for (const [i, e] of entries.entries()) {
    const alone = await top1(e.q);
    const combined = await top1(`${e.prev} ${e.q}`);
    rows.push({
      n: i + 1, e, alone, combined,
      [ACTIVE_RULE]: judge(e, alone, combined, active, threshold),
      [other]: judge(e, alone, combined, RULES[other], threshold)
    });
  }

  console.table(rows.map(r => ({
    '#': r.n,
    kind: r.e.kind,
    question: r.e.q,
    alone: r.alone.score.toFixed(4),
    'prev+new': r.combined.score.toFixed(4),
    rule: `${r[ACTIVE_RULE].decision.isFollowup ? 'follow-up' : 'new'} (${r[ACTIVE_RULE].decision.reason})`,
    used: r[ACTIVE_RULE].chosen.which,
    result: r[ACTIVE_RULE].passed ? 'passed' : 'blocked',
    mark: r[ACTIVE_RULE].mark,
    [`${other}`]: r[other].mark
  })));

  // Kon entry pelo — shudhu ✗ ar ⚠ er jonno detail (active rule)
  const problems = rows.filter(r => r[ACTIVE_RULE].mark !== '✓');
  if (problems.length) {
    console.log(`\nDetails (✗ and ⚠, ${active.name}):`);
    for (const r of problems) {
      const j = r[ACTIVE_RULE];
      console.log(`  #${r.n} ${j.mark} [${r.e.kind}] prev: "${r.e.prev}" → "${r.e.q}"${j.why ? `  — ${j.why}` : ''}`);
      console.log(`     used ${j.chosen.which} (${j.chosen.top.score.toFixed(4)}): ${questionLine(j.chosen.top.text).slice(0, 90)}`);
      if (r.e.expect) console.log(`     expected: ${JSON.stringify(r.e.expect)}`);
    }
  }

  console.log(`\nTotals — ${active.name} (active):`);
  totals(rows, ACTIVE_RULE).forEach(l => console.log(l));
  console.log(`Totals — ${RULES[other].name} (for comparison):`);
  totals(rows, other).forEach(l => console.log(l));

  // ⚠ list (active rule) — step 10 e dekhte hobe Gemini egulo refuse kore kina
  const warnings = rows.filter(r => r[ACTIVE_RULE].mark === '⚠').map(r => ({
    prev: r.e.prev, q: r.e.q, used: r[ACTIVE_RULE].chosen.which,
    score: Number(r[ACTIVE_RULE].chosen.top.score.toFixed(4)), topChunk: questionLine(r[ACTIVE_RULE].chosen.top.text)
  }));
  fs.writeFileSync(WARNINGS_FILE, JSON.stringify({ description: 'Topic changes that pass the threshold (⚠). Step 10: Gemini must refuse each of these.', warnings }, null, 2) + '\n');
  console.log(`\n⚠ topic changes that reach Gemini: ${warnings.length} (saved to ${path.relative(process.cwd(), WARNINGS_FILE)})`);

  const missed = rows.filter(r => r[ACTIVE_RULE].why === 'rule missed a follow-up');
  if (missed.length) {
    console.log('\nFor Member 2 — follow-ups the rule missed (prev+new would have found the right entry):');
    missed.forEach(r => console.log(`  prev: "${r.e.prev}" → "${r.e.q}"  (alone ${r.alone.score.toFixed(4)}, prev+new ${r.combined.score.toFixed(4)})`));
  }

  if (args.includes('--stress')) {
    console.log('\nStress check: every on-topic question from the main, holdout and Bangla files asked right after an unrelated FAQ question…');
    const s = await stressCheck(threshold);
    console.log(`  ${s.pairs} topic-change pairs — right entry and answered:`);
    console.log(`    no follow-up logic (alone): ${s.alone}/${s.pairs}`);
    for (const key of ['plan', 'proposed']) {
      console.log(`    ${RULES[key].name.padEnd(26)}: ${s[key]}/${s.pairs}   (pulled away from a right answer: ${s.pulled[key].length})`);
    }
    s.pulled[ACTIVE_RULE].slice(0, 5).forEach(p => console.log(`      e.g. ${p}`));
  }

  if (rows.some(r => r[ACTIVE_RULE].mark === '✗')) {
    console.log(`\n❌ ${rows.filter(r => r[ACTIVE_RULE].mark === '✗').length} ✗ (${active.name})`);
    process.exitCode = 1;
  } else {
    console.log(`\n✅ No ✗ (${active.name})`);
  }
} catch (err) {
  console.error('Follow-up test FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await closeMongo(); // fail korleo connection bondho
}
