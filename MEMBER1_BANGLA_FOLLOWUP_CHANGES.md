# ForenTrace AI Chatbot — Member 1: Bangla & Follow-up Readiness Change Log

**Role:** Knowledge Base, Index & Tuning (Member 1)
**Branch:** `chatbot/m1-ingestion`
**Source plan:** `Member1_Now_vs_Wait.md` (Part A = do now, Part B = wait for Members 2 and 3)

This file records every change made to get the knowledge base ready for **Bangla questions** and **follow-up questions**: what was added, the full code, and why.
The earlier CB-1…CB-8 work is in `MEMBER1_CHATBOT_CHANGES.md`.

---

## Phase overview

| Phase | Plan step | Goal | Main file(s) | Status |
| --- | --- | --- | --- | --- |
| 1 | Step 1 | Fix the chunker (`Q:` only at a word start) + chunk checker | `chunker.js`, `checkChunks.js` | ✅ Done (0 problems, 37 chunks) |
| 2 | Step 2 | Evaluation script, main + holdout question files, choose the threshold | `evaluate.js`, `data/eval_questions.json`, `data/holdout_questions.json` | ⏳ Next |
| 3 | Step 3 | Pre-flight check (env, model, FAQ loaded, index, smoke test) | `preflight.js` | ⏳ |
| 4 | Step 4 | Teach-the-bot test (swap in FAQ v2, re-ingest, restore) | `teachTest.js` | ⏳ (needs `forentrace_faq_v2.pdf` on the Desktop) |
| 5 | Step 5 | FAQ checker (roles, exact menu names, vague answers) + wording list | `checkFaq.js`, `data/faq_terms.json` | ⏳ |
| 6 | Step 6 | Bangla search-side test file | `data/bangla_questions.json` | ⏳ |
| 7 | Step 7 | Follow-up search-side test (copy of Member 2's rule) | `followupTest.js`, `data/followup_questions.json` | ⏳ |
| 8 | Step 8 | Draft FAQ entries for the new features (not added yet) | `data/new_feature_faq_drafts.txt` | ⏳ |
| — | Steps 9–13 | End-to-end Bangla / follow-up tests, run-all, team message | — | ⏸ Waiting for Members 2 and 3 |

**Rules followed in every phase**
- Only Member 1 files change: the chunker, the JSON files in `backend/chatbot/data/`, and the test scripts. `embedder.js`, `mongoClient.js` and all Member 2/3 files are only imported, never edited.
- ES modules, `import 'dotenv/config'` at the top, and `closeMongo()` in `finally`, so the connection closes even when the script fails.
- A failed check sets `process.exitCode = 1`, so "run all tests" (step 13) can see it.
- No script calls Gemini. No script prints `.env` values except `CHATBOT_SCORE_THRESHOLD`.
- The FAQ text is never edited by the agent. Wording changes are written here, and you apply them in Word.

---

## Phase 1 — Step 1: Fix the chunker, check the chunks

### Goal
1. The chunker split at **every** `Q:`, including the one inside `FAQ:`. A Word header like "ForenTrace FAQ: Help" would then create a broken chunk. Now it only splits when `Q:` starts a new word.
2. Add a script that reads every chunk in Atlas and flags anything that would blur a chunk's meaning.

### Files changed

| File | Type | Purpose |
| --- | --- | --- |
| `backend/chatbot/chunker.js` | Modified (1 line + 1 comment) | Split regex `/(?=Q:)/` → `/(?=\bQ:)/` |
| `backend/chatbot/checkChunks.js` | **New** | Reads `faq_chunks` and flags problems; exit code 1 if any |
| `MEMBER1_BANGLA_FOLLOWUP_CHANGES.md` | **New** | This change log |

### Code — `backend/chatbot/chunker.js` (diff)

```diff
-// Rule 1: every "Q:" starts a new chunk, so a question and its answer stay together.
+// Rule 1: every "Q:" that starts a word begins a new chunk, so a question and its answer stay together.
 ...
-    .split(/(?=Q:)/)             // split right before every "Q:" (lookahead, tai "Q:" chunk er vitore-i thake)
+    .split(/(?=\bQ:)/)           // split right before every "Q:" that starts a word (\b — "FAQ:" er vitorer Q: e ar kata hoy na)
```

| Part | What it does |
| --- | --- |
| `\b` | A "word boundary": the position between a non-letter (space, start of text, bracket) and a letter. In `FAQ:` the `Q` comes right after `A`, so there is no boundary and no split. In `… sidebar. Q: How …` there is a space before `Q`, so it still splits. |
| `(?= … )` | Lookahead (unchanged): split *before* `Q:` without removing it, so every chunk still starts with `Q:`. |

Nothing else in the chunker changed (150-word windows with 30-word overlap are the same).

### Code — `backend/chatbot/checkChunks.js` (full new file)

```js
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
```

### What each part does

| Part | What it does |
| --- | --- |
| `EXPECTED_SOURCE` / sample-seed check | `ingest.js` saves every real chunk with `source: 'forentrace_faq.pdf'`. Any other source (e.g. Member 2's old `sample-seed`) is a leftover and gets flagged. |
| Embedding length check | Every vector must have 384 numbers, or `vector_index` (384 dims) can't search it. |
| Intro rule | Only the **first** chunk may start without `Q:` (the title + "About ForenTrace" intro). Any other chunk that doesn't start with `Q:` means text leaked in between Q&As. |
| `MIN_WORDS` / `MAX_WORDS` | Under 15 words means something was cut off. Over 120 words (the longest real Q&A is ~75) means two Q&As were probably glued together. |
| `Q:` / `A:` count | More than one `Q:` or `A:` in a chunk = two Q&As in one vector, which blurs both meanings. |
| `PAGE_NUMBER_PATTERNS` | Catches "Page 3", "Page 3 of 5", "- 3 -", and a lone 1–3 digit number at the start, at the end, or between two sentences. These are what Word's page numbers look like after PDF extraction. |
| `HEADER_PATTERNS` | Title/header words ("Frequently Asked Questions", "FAQ", "About ForenTrace", "Confidential", "Section 2" …) are allowed only in the intro. If they appear in a Q&A chunk, a Word header, footer or heading leaked in. |
| "Text after the last sentence" | Every answer ends with a full stop. Words after the final `.`/`?`/`!` with no punctuation (e.g. `… login page. Accounts and Login`) are a section heading or footer glued to the end. |
| Duplicate check | Same full text, or same question line, in two chunks → flagged (e.g. the FAQ was pasted twice). |
| Repeated ending check | A header/footer repeats on every page, so if 3+ chunks end with the same 4 words, it's flagged. |
| `process.exitCode = 1` + `finally { closeMongo() }` | Failure is visible to "run all tests", and the Atlas connection always closes. |

### Testing results

**1. Chunker fix (offline, fake text with a Word-style header):**
```text
input:  "ForenTrace FAQ: Help Q: What is X? A: … Q: What is Y? A: …"
0 "Q: What is X? A: X is a thing …"
1 "Q: What is Y? A: Y is another thing …"
```
`FAQ:` is no longer a split point. The 3-word header piece is under 20 characters, so the chunker's existing filter drops it.

**2. Checker rules (offline, each bad case injected into a good chunk):**

| Case | Flagged as |
| --- | --- |
| good chunk | *(nothing)* ✅ |
| `… page. 3` | stray page number ✅ |
| `… sidebar. Page 2 of 5 …` | stray page number ✅ |
| `… page. Accounts and Login` | text after the last sentence (heading) ✅ |
| `… ForenTrace FAQ Your …` | header/footer text ✅ |
| `Q: Hi? A: Yes.` | very short ✅ |
| two Q&As joined | 2 `Q:` and 2 `A:` ✅ |
| `source: 'sample-seed'` | leftover chunk ✅ |
| answer text without `Q:` | does not start with "Q:" ✅ |

**3. Real run (re-ingest with the fixed chunker, then check Atlas):**
```text
> node chatbot/ingest.js
PDF read: 12233 characters
Created 37 chunks
Inserted 37 chunks into MongoDB

> node chatbot/checkChunks.js
Checked 37 chunks in faq_chunks
Q&A chunks: 36, intro/other: 1
✅ No problems found
```

### What you (Member 1) still do for this step
- The current `forentrace_faq.pdf` was exported without a header, footer, page numbers or section headings, so the checker found nothing to remove. **If** you re-export from the Word FAQ, remove the header, the footer, the page numbers and any section headings first, then run `node chatbot/ingest.js` and `node chatbot/checkChunks.js`. Any leak shows up with the exact text to delete.
- Tell Member 2 you re-ingested. The chunk text is the same (37 chunks), so their scores should not change, but the `_id`s are new.

### Known gaps / notes
- The page-number rule ignores numbers inside sentences on purpose (the FAQ has "6 to 50", "7 of 8 positions", "90%"). A page number glued mid-sentence without punctuation next to it would not be caught, but the "repeated ending" and "text after the last sentence" rules usually catch the footer around it.
