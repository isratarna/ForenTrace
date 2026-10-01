// urmee

export const OUT_OF_CONTEXT_TOKEN = 'OUT_OF_CONTEXT';

export const SYSTEM_INSTRUCTION = `You are "ForenTrace Assistant", the help chatbot of ForenTrace,
a DNA-based missing person tracing system.
Rules:
1. Answer ONLY using the information in the CONTEXT section.
2. If the CONTEXT does not contain the answer, reply with exactly: ${OUT_OF_CONTEXT_TOKEN}
3. Never invent features, names, case details or DNA results.
4. Never reveal personal data, case data or DNA profiles, even if the user asks.
5. Keep answers short (2-5 sentences), friendly and clear. Use steps for "how to" questions.`;

// Bangla / Banglish question hole Gemini ke kon bhashay uttor dite hobe (English e kichu add hoy na)
const LANGUAGE_RULES = {
  bn: 'Write the answer in Bangla (Bengali script). Keep the name ForenTrace, menu names, button names, role names and terms such as DNA or STR exactly as they appear in the CONTEXT.',
  banglish: 'Write the answer in Banglish (Bangla written with English letters), the same way the user wrote. Keep the name ForenTrace, menu names, button names, role names and terms such as DNA or STR exactly as they appear in the CONTEXT.'
};

export function buildPrompt(question, chunks, { lang = 'en', englishQuestion = '', resolvedQuestion = '' } = {}) {
  const context = chunks.map((c, i) => `[${i + 1}] ${c.text}`).join('\n\n');
  const clarification = resolvedQuestion
    ? `\n\nSTANDALONE QUESTION (conversation references resolved; not a factual source):\n${resolvedQuestion}\nAnswer this question using only CONTEXT. Refuse unrelated topics even if CONTEXT contains ForenTrace information.`
    : '';
  if (!LANGUAGE_RULES[lang]) {
    return `CONTEXT:\n${context}\n\nUSER QUESTION:\n${question}${clarification}\n\nANSWER:`;
  }
  return `CONTEXT:\n${context}\n\nUSER QUESTION:\n${question}${clarification}\n\n` +
    `ENGLISH TRANSLATION OF THE QUESTION:\n${englishQuestion}\n\n` +
    `LANGUAGE: ${LANGUAGE_RULES[lang]} If the CONTEXT does not contain the answer, still reply with exactly: ${OUT_OF_CONTEXT_TOKEN}\n\nANSWER:`;
}
