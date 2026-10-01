// Calls Google Gemini with plain fetch (built into Node 18+).
// If a model is busy (503) or out of quota (429), it is skipped for a while ("cooldown")
// and the next model in the list answers right away, so users do not wait on a failing model.
const RETRYABLE = new Set([429, 500, 503]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// model name → time (ms) until which we do not call it
const cooldownUntil = new Map();

function isCoolingDown(model) {
  return (cooldownUntil.get(model) || 0) > Date.now();
}

// Gemini says how long to wait on a 429 ("retryDelay": "58s"); otherwise use a default
function cooldownMs(status, data) {
  const retryInfo = data.error?.details?.find(d => d['@type']?.endsWith('RetryInfo'));
  const seconds = parseFloat(retryInfo?.retryDelay);
  if (seconds > 0) return seconds * 1000;
  return status === 429 ? 60_000 : 30_000;
}

async function requestGemini(model, prompt, systemInstruction) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const generationConfig = { temperature: 0.2 }; // low = factual, less creative
  // 'minimal' / 'low' = less "thinking" before answering = faster reply
  if (process.env.GEMINI_THINKING_LEVEL) {
    generationConfig.thinkingConfig = { thinkingLevel: process.env.GEMINI_THINKING_LEVEL };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig
    }),
    // a hung request should fail over to the next model, not block the user forever
    signal: AbortSignal.timeout(Number(process.env.GEMINI_TIMEOUT_MS) || 15_000)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(`Gemini error ${response.status} (${model}): ${data.error?.message || 'unknown'}`);
    err.status = response.status;
    err.cooldownMs = cooldownMs(response.status, data);
    throw err;
  }

  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text || '').join('').trim();
}

// options.preferFallback: try the backup (lighter, faster) model first — used for simple jobs like translation
export async function callGemini(prompt, systemInstruction, { preferFallback = false } = {}) {
  let models = [process.env.GEMINI_MODEL, process.env.GEMINI_FALLBACK_MODEL].filter(Boolean);
  if (preferFallback) models.reverse();

  // skip models that recently failed; if all of them did, try them anyway
  const available = models.filter(m => !isCoolingDown(m));
  if (available.length) models = available;

  let lastError;
  for (const [i, model] of models.entries()) {
    const isLast = i === models.length - 1;
    // only the last model gets a second try; the others hand over to the next model immediately
    for (let attempt = 1; attempt <= (isLast ? 2 : 1); attempt++) {
      try {
        return await requestGemini(model, prompt, systemInstruction);
      } catch (err) {
        lastError = err;
        // wrong key / bad request: retrying will not help, stop now
        if (err.status && !RETRYABLE.has(err.status)) throw err;
        if (err.cooldownMs) cooldownUntil.set(model, Date.now() + err.cooldownMs);
        console.warn(`${err.message} → ${isLast ? 'retrying' : 'switching model'}...`);
        // quota errors will not clear in a second, so only wait before retrying a busy/timeout error
        if (isLast && attempt === 1 && err.status !== 429) await sleep(1000);
        else if (isLast) break;
      }
    }
  }
  throw lastError;
}
