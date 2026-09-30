// urmee
// Calls Google Gemini with plain fetch (built into Node 18+). No extra package needed.
export async function callGemini(prompt, systemInstruction) {
  const model = process.env.GEMINI_MODEL;
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

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Gemini error ${response.status}: ${data.error?.message || 'unknown'}`);
  }

  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text || '').join('').trim();
}