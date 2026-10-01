// urmee

import { searchChunks } from '../chatbot/retriever.js';
import { callGemini } from '../chatbot/gemini.js';
import { SYSTEM_INSTRUCTION, OUT_OF_CONTEXT_TOKEN, buildPrompt } from '../chatbot/prompt.js';
import { getSmallTalkReply } from '../chatbot/smallTalk.js';
import { detectLanguage, translateToEnglish } from '../chatbot/translate.js';

// Question je bhashay, off-topic reply ar error message-o sei bhashay
const OUT_OF_CONTEXT_REPLIES = {
  en: 'Sorry, I can only answer questions about the ForenTrace system ' +
    '(cases, DNA samples, matching, labs and accounts). ' +
    'Try asking something like "How do I register a DNA sample?"',
  bn: 'দুঃখিত, আমি শুধু ForenTrace সিস্টেম নিয়ে প্রশ্নের উত্তর দিতে পারি ' +
    '(কেস, DNA নমুনা, ম্যাচিং, ল্যাব এবং অ্যাকাউন্ট)। ' +
    'যেমন জিজ্ঞেস করুন: "DNA নমুনা কীভাবে রেজিস্টার করব?"',
  banglish: 'Sorry, ami shudhu ForenTrace system niye proshner uttor dite pari ' +
    '(case, DNA sample, matching, lab ar account). ' +
    'Jemon jiggesh korun: "DNA sample kivabe register korbo?"'
};

const UNAVAILABLE_MESSAGES = {
  en: 'The assistant is not available right now. Please try again later.',
  bn: 'অ্যাসিস্ট্যান্ট এই মুহূর্তে কাজ করছে না। একটু পরে আবার চেষ্টা করুন।',
  banglish: 'Assistant ekhon kaj korche na. Ektu pore abar try korun.'
};

/**
 * Sanitizes input string to prevent HTML/script injection and strip harmful control characters
 * while preserving natural language, standard punctuation, and forensic terminology (e.g. STR, DNA, CODIS).
 *
 * @param {string} text
 * @returns {string}
 */
export function sanitizeQuestion(text) {
  if (typeof text !== 'string') return '';

  return text
    // Remove script tags and their inner content safely (linear non-backtracking scan)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    // Remove any remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // Strip non-printable / control characters (keep standard printable text and spaces)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\u200B-\u200D\uFEFF]/g, '')
    // Normalize excessive whitespace to single space
    .replace(/\s+/g, ' ')
    .trim();
}

export async function askChatbot(req, res) {
  const rawQuestion = req.body?.question;

  // CB-10: Input validation - question must exist and must be a string
  if (typeof rawQuestion !== 'string') {
    return res.status(400).json({ message: 'Please type a question.' });
  }

  const trimmed = rawQuestion.trim();
  if (!trimmed) {
    return res.status(400).json({ message: 'Please type a question.' });
  }

  // CB-10: Maximum length limit of 500 characters
  if (trimmed.length > 500) {
    return res.status(400).json({ message: 'Question must be 500 characters or fewer.' });
  }

  // CB-10: Sanitization - strip HTML/script markup and control characters
  const question = sanitizeQuestion(trimmed);
  if (!question) {
    return res.status(400).json({ message: 'Please type a question.' });
  }

  // LAYER 0 – small talk (hi, thanks, bye...): friendly reply, no AI call
  const smallTalk = getSmallTalkReply(question);
  if (smallTalk) {
    return res.json({ answer: smallTalk, inContext: true, sources: [] });
  }

  // read here (not at file top) so the value from .env is always loaded
  const threshold = Number(process.env.CHATBOT_SCORE_THRESHOLD || 0.65);

  // 'en' | 'bn' (Bangla okkhor) | 'banglish' (English okkhore Bangla)
  const lang = detectLanguage(question);
  const outOfContextReply = OUT_OF_CONTEXT_REPLIES[lang];

  try {
    // LAYER 0.5 – Bangla/Banglish hole age English e translate (search model shudhu English bojhe)
    const searchText = lang === 'en' ? question : await translateToEnglish(question);

    // LAYER 1 – semantic search: keep only chunks that are similar enough
    const results = await searchChunks(searchText, 4);
    const relevant = results.filter(r => r.score >= threshold);

    // Nothing similar → off-topic question → do NOT call the LLM at all
    if (relevant.length === 0) {
      return res.json({ answer: outOfContextReply, inContext: false, sources: [] });
    }

    // LAYER 2 – generation: Gemini answers using ONLY the retrieved chunks (question er bhashay)
    const prompt = buildPrompt(question, relevant, { lang, englishQuestion: searchText });
    const answer = await callGemini(prompt, SYSTEM_INSTRUCTION);

    if (!answer || answer.includes(OUT_OF_CONTEXT_TOKEN)) {
      return res.json({ answer: outOfContextReply, inContext: false, sources: [] });
    }

    const sources = [...new Set(relevant.map(r => r.source))];
    return res.json({ answer, inContext: true, sources });
  } catch (err) {
    console.error('Chatbot error:', err.message);
    return res.status(500).json({ message: UNAVAILABLE_MESSAGES[lang] });
  }
}

// urmee
