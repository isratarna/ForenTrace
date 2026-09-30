// Calls Google Gemini with plain fetch (built into Node 18+).
// If the model is busy (503) or rate-limited (429), it retries once,
// then tries the backup model from GEMINI_FALLBACK_MODEL.
const RETRYABLE = new Set([429, 500, 503]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function requestGemini(model, prompt, systemInstruction) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 } // low = factual, less creative
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(`Gemini error ${response.status} (${model}): ${data.error?.message || 'unknown'}`);
    err.status = response.status;
    throw err;
  }

  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text || '').join('').trim();
}

export async function callGemini(prompt, systemInstruction) {
  const models = [process.env.GEMINI_MODEL, process.env.GEMINI_FALLBACK_MODEL].filter(Boolean);
  let lastError;

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await requestGemini(model, prompt, systemInstruction);
      } catch (err) {
        lastError = err;
        // wrong key / bad request: retrying will not help, stop now
        if (err.status && !RETRYABLE.has(err.status)) throw err;
        console.warn(`${err.message} → retrying...`);
        await sleep(1000 * attempt);
      }
    }
  }
  throw lastError;
}