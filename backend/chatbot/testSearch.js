// urmee
// Usage:  node chatbot/testSearch.js "How do I register a DNA sample?"
import 'dotenv/config';
import { searchChunks } from './retriever.js';
import { closeMongo } from './mongoClient.js';

const question = process.argv.slice(2).join(' ') || 'How do I register a DNA sample?';

try {
  const results = await searchChunks(question, 3);
  console.log(`\nQuestion: ${question}`);
  results.forEach(r => console.log(`  score=${r.score.toFixed(3)} | ${r.text.slice(0, 80)}...`));
} catch (err) {
  console.error('Search FAILED:', err.message);
} finally {
  await closeMongo();
}