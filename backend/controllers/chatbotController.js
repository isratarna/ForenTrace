// urmee

import { searchChunks } from '../chatbot/retriever.js';
import { callGemini } from '../chatbot/gemini.js';
import { SYSTEM_INSTRUCTION, OUT_OF_CONTEXT_TOKEN, buildPrompt } from '../chatbot/prompt.js';

const OUT_OF_CONTEXT_REPLY =
  'Sorry, I can only answer questions about the ForenTrace system ' +
  '(cases, DNA samples, matching, labs and accounts).';

export async function askChatbot(req, res) {
  const question = String(req.body?.question || '').trim();
  if (!question) return res.status(400).json({ message: 'Please type a question.' });

  // read here (not at file top) so the value from .env is always loaded
  const threshold = Number(process.env.CHATBOT_SCORE_THRESHOLD || 0.65);

  try {
    // LAYER 1 – semantic search: keep only chunks that are similar enough
    const results = await searchChunks(question, 4);
    const relevant = results.filter(r => r.score >= threshold);

    // Nothing similar → off-topic question → do NOT call the LLM at all
    if (relevant.length === 0) {
      return res.json({ answer: OUT_OF_CONTEXT_REPLY, inContext: false, sources: [] });
    }

    // LAYER 2 – generation: Gemini answers using ONLY the retrieved chunks
    const prompt = buildPrompt(question, relevant);
    const answer = await callGemini(prompt, SYSTEM_INSTRUCTION);

    if (!answer || answer.includes(OUT_OF_CONTEXT_TOKEN)) {
      return res.json({ answer: OUT_OF_CONTEXT_REPLY, inContext: false, sources: [] });
    }

    const sources = [...new Set(relevant.map(r => r.source))];
    return res.json({ answer, inContext: true, sources });
  } catch (err) {
    console.error('Chatbot error:', err.message);
    return res.status(500).json({
      message: 'The assistant is not available right now. Please try again later.'
    });
  }
}

// urmee