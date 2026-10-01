// Bangla support: question er language dhora + Bangla/Banglish question ke English e translate kora.
// Search model (all-MiniLM-L6-v2) shudhu English bojhe, tai search er age English lagbe.
import { callGemini } from './gemini.js';

// Bangla Unicode block (অ, ক, া, ্ ... সব এই range e)
const BANGLA_SCRIPT = /[\u0980-\u09FF]/;

// Banglish (English okkhore Bangla) er common shobdo. Ekta English sentence e ei list er
// 2 ta alada shobdo prai kokhono thake na, tai 2 ta pele-i Banglish dhora hoy.
const BANGLISH_WORDS = new Set([
  'ki', 'kivabe', 'kibhabe', 'kemne', 'kemon', 'keno', 'kothay', 'kothai', 'kobe', 'kon', 'kara', 'kake',
  'korbo', 'korbe', 'korte', 'kori', 'kora', 'kore', 'korle', 'korben', 'korche', 'korchi',
  'hoy', 'hoi', 'hobe', 'hoye', 'hole', 'holo', 'ache', 'achhe', 'ase', 'nai', 'nei',
  'ami', 'amar', 'amake', 'apni', 'apnar', 'tumi', 'tomar', 'amra', 'amader',
  'jonno', 'theke', 'diye', 'dite', 'debo', 'dibo', 'jodi', 'tahole', 'ekta', 'eta', 'oita', 'ei', 'oi',
  'dekhbo', 'dekhte', 'dekhbe', 'jabe', 'jay', 'pari', 'parbo', 'parbe', 'parben', 'parba',
  'bolo', 'bolen', 'bolte', 'lagbe', 'lage', 'shob', 'sob', 'kichu', 'kaj', 'keu', 'naki'
]);

// Ei shobdo gula English e ashe na, tai ekta pelei Banglish ("case ki?", "login kivabe")
const STRONG_BANGLISH_WORDS = new Set([
  'ki', 'kivabe', 'kibhabe', 'kemne', 'kothay', 'kothai', 'korbo', 'korben', 'korte', 'korle',
  'hobe', 'jonno', 'amar', 'apnar', 'tomar', 'dekhbo', 'parbo', 'parben', 'lagbe', 'naki'
]);

// 'bn' = Bangla okkhor, 'banglish' = English okkhore Bangla, 'en' = English
export function detectLanguage(text) {
  if (BANGLA_SCRIPT.test(text)) return 'bn';

  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  if (words.some(w => STRONG_BANGLISH_WORDS.has(w))) return 'banglish';
  const found = new Set(words.filter(w => BANGLISH_WORDS.has(w)));
  return found.size >= 2 ? 'banglish' : 'en';
}

const TRANSLATE_INSTRUCTION = `You translate user questions for ForenTrace, a DNA-based missing person tracing web system
(users: Admin, Officer, Lab Technician; features: missing persons, cases, DNA samples, DNA matches, DNA labs, accounts).
The text is Bangla, written either in Bangla script or in English letters (Banglish).
Rules:
1. Output ONLY the natural English translation of the text, on one line. No quotes, no notes, no answer.
2. It is a question about using a software system, so use the software meaning of words:
   হিসাব / অ্যাকাউন্ট = account, পাকা / নিশ্চিত / কনফার্ম = confirmed, নমুনা / স্যাম্পল = sample,
   নিখোঁজ ব্যক্তি = missing person, মামলা / কেস = case, মিল / ম্যাচ = match, নিবন্ধন / রেজিস্টার = register,
   ঢোকা / লগইন = log in, ভূমিকা / রোল = role, পরীক্ষাগার / ল্যাব = lab.
3. Keep English words, menu names, button names and codes exactly as written (e.g. DNA Samples, Register DNA Sample, STR).
4. Never answer or explain the question. If it is not about ForenTrace, still only translate it.`;

// Gemini diye English translation. Kichu na asle original text-i ferot (search tokhon block korbe).
export async function translateToEnglish(text) {
  // translation is easy, so the faster backup model goes first (saves time + main model quota)
  const output = await callGemini(`TEXT:\n${text}\n\nENGLISH:`, TRANSLATE_INSTRUCTION, { preferFallback: true });
  const firstLine = (output || '').split('\n').map(l => l.trim()).find(Boolean) || '';
  const cleaned = firstLine.replace(/^english:\s*/i, '').replace(/^["'“”]+|["'“”]+$/g, '').trim();
  return cleaned || text;
}
