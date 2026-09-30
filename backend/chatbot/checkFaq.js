// backend/chatbot/checkFaq.js   →   run from backend folder: node chatbot/checkFaq.js
// Reads every chunk in Atlas and flags FAQ wording that will hurt follow-up answers:
//   - "How do I… / How does…" answers that don't name a role (Admin / Officer / Lab Technician)
//   - menu/button names after "open / click / go to / choose / select / use / in" that are not
//     an exact name from data/faq_terms.json (taken from the real app on main)
//   - the same menu written a different way ("Add a Sample" vs "Add Sample", wrong capital letters)
//   - answers that are very short or vague ("an Add button", "etc")
// Exit code 1 if anything is flagged. (Follow-up e "Who can do that?" er uttor dite role/menu naam lagbe)
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCollection, closeMongo } from './mongoClient.js';
import { questionLine } from './evaluate.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const TERMS = JSON.parse(fs.readFileSync(path.join(here, 'data', 'faq_terms.json'), 'utf8'));

// Lomba naam age — "Register DNA Sample" ke "Register DNA" er age mele
const KNOWN = [...TERMS.menus, ...TERMS.buttons, ...TERMS.fields].sort((a, b) => b.length - a.length);
const ROLE_WORDS = Object.values(TERMS.roles).flat();
const MIN_ANSWER_WORDS = 20;

// Ei word er porer Title Case phrase = menu/button/page er naam
const NAV = /\b(open|opens|click|clicks|go to|goes to|choose|select|use|uses|in)\s+(?:the\s+|an?\s+)?/gi;
// "+ Add Family Member", "Users & Accounts", "Unknown / Evidence Sample", "Export Report (CSV)",
// ar vul "Add a Family Member" o puro dhore (majhe a/an/the/of thakle)
const TITLE_PHRASE = /^(?:\+\s)?[A-Z][\w()]*(?:\s(?:&|\/|(?:(?:a|an|the|of)\s)?[A-Z(][\w()]*))*/;
const VAGUE = [
  [/\ban? (Add|Edit|Save|Delete) button\b/i, 'generic button — say the exact label'],
  [/\bthe button\b/i, 'generic "the button" — say the exact label'],
  [/\betc\b\.?/i, '"etc" — list the items'],
  [/\bsomewhere\b/i, '"somewhere" — say where'],
  [/\band so on\b/i, '"and so on" — list the items']
];

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordCount = s => s.split(/\s+/).filter(Boolean).length;
// "+ Add a Sample" → "add sample" — article, symbol, capital letter, plural 's' bad diye tulona
const norm = s => s.toLowerCase().replace(/\b(a|an|the)\b/g, ' ').replace(/[^a-z0-9&/]+/g, ' ').trim()
  .split(' ').map(w => (w.length > 3 ? w.replace(/s$/, '') : w)).join(' ');
const NORM_KNOWN = new Map(KNOWN.map(k => [norm(k), k]));
const endsWord = (text, len) => !/[A-Za-z0-9]/.test(text[len] ?? '');

// Ektu mile emon known naam (word overlap) — suggestion er jonno
function closestKnown(phrase) {
  const words = new Set(norm(phrase).split(' '));
  let best = null;
  for (const k of KNOWN) {
    const kw = norm(k).split(' ');
    const overlap = kw.filter(w => words.has(w)).length / Math.max(kw.length, words.size);
    if (!best || overlap > best.overlap) best = { k, overlap };
  }
  return best && best.overlap >= 0.34 ? best.k : null;
}

function splitQA(text) {
  const [q, ...rest] = String(text).split(/\bA:/);
  return { question: q.replace(/^Q:/, '').trim(), answer: rest.join('A:').trim() };
}

// Answer er shob menu/button naam check
function checkNames(answer) {
  const problems = [];
  for (const m of answer.matchAll(NAV)) {
    if (m[1] === 'In') continue; // boro haater "In" = sentence er shuru ba "In Analysis" status, menu na
    const trigger = m[1].toLowerCase();
    const rest = answer.slice(m.index + m[0].length);

    const exact = KNOWN.find(k => rest.startsWith(k) && endsWord(rest, k.length));
    if (exact) continue; // thik naam

    // Choto/boro haat vul: "click register dna sample" ("in" er por prose hote pare, tai bad)
    if (trigger !== 'in') {
      const loose = KNOWN.find(k => k.includes(' ') && rest.toLowerCase().startsWith(k.toLowerCase()) && endsWord(rest, k.length));
      if (loose) {
        problems.push(`"${rest.slice(0, loose.length)}" is written differently from the menu name "${loose}"`);
        continue;
      }
    }

    const title = rest.match(TITLE_PHRASE);
    if (!title) continue; // lowercase prose ("open a sample") — UI naam na
    const phrase = title[0].replace(/[.,;:]+$/, '').trim();
    if (TERMS.ignore.includes(phrase) || ROLE_WORDS.includes(phrase)) continue;

    const same = NORM_KNOWN.get(norm(phrase));
    if (same) {
      problems.push(`"${phrase}" is written differently from the menu name "${same}"`);
    } else {
      const hint = closestKnown(phrase);
      problems.push(`"${phrase}" (after "${m[1]}") is not an exact menu/button name${hint ? ` — did you mean "${hint}"?` : ''}`);
    }
  }
  return problems;
}

function checkChunk(text) {
  const problems = [];
  const { question, answer } = splitQA(text);

  // "How do I / How does … work" — step-by-step answer e ke korte pare sheta thakte hobe
  // (follow-up "Who can do that?" er uttor ei chunk thekei ashbe)
  if (/\bHow (do|does|can)\b/i.test(question)) {
    const namesRole = ROLE_WORDS.some(r => new RegExp(`\\b${esc(r)}\\b`).test(answer));
    if (!namesRole) problems.push('"How do I…" answer does not say which role can do it (Admin / Officer / Lab Technician)');
  }

  problems.push(...checkNames(answer));

  const words = wordCount(answer);
  if (words < MIN_ANSWER_WORDS) problems.push(`very short answer (${words} words)`);
  for (const [re, why] of VAGUE) {
    const m = answer.match(re);
    if (m) problems.push(`vague: "${m[0]}" — ${why}`);
  }
  return problems;
}

try {
  const col = await getCollection();
  const docs = await col.find({}, { projection: { text: 1, chunkIndex: 1 } }).sort({ chunkIndex: 1 }).toArray();
  const qaDocs = docs.filter(d => String(d.text).startsWith('Q:')); // intro chunk e Q&A nei

  const flagged = [];
  for (const doc of qaDocs) {
    const problems = checkChunk(doc.text);
    if (problems.length) flagged.push({ doc, problems });
  }

  console.log(`Checked ${qaDocs.length} Q&A chunks (roles and menu names from data/faq_terms.json)`);
  if (flagged.length === 0) {
    console.log('✅ No problems found');
  } else {
    const total = flagged.reduce((n, f) => n + f.problems.length, 0);
    console.log(`❌ ${total} problem(s) in ${flagged.length} FAQ entries:\n`);
    for (const { doc, problems } of flagged) {
      console.log(`[chunk ${doc.chunkIndex}] ${questionLine(doc.text)}`);
      problems.forEach(p => console.log(`   - ${p}`));
    }
    process.exitCode = 1;
  }
} catch (err) {
  console.error('FAQ check FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await closeMongo(); // fail korleo connection bondho
}
