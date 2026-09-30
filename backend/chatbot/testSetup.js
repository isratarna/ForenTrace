import 'dotenv/config';
import { embed } from './embedder.js';
import { getCollection, closeMongo } from './mongoClient.js';

try {
  const vector = await embed('hello forentrace');
  console.log('Embedding length:', vector.length);

  const col = await getCollection();
  console.log('MongoDB connected. Documents in faq_chunks:', await col.countDocuments());
} catch (err) {
  console.error('Setup test FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await closeMongo();
}
