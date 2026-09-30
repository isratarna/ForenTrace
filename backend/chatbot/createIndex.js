// backend/chatbot/createIndex.js   →   run ONCE, AFTER ingest.js: node chatbot/createIndex.js
// Atlas ke bole: "embedding" field e 384 ta number ache — meaning diye search korar jonno cosine diye compare koro
// Index ekbar banale-i hoy — FAQ change hole shudhu ingest.js abar chalalei hobe
import 'dotenv/config';
import { getCollection, closeMongo } from './mongoClient.js';

try {
  const col = await getCollection();

  // Age theke index ache kina dekha — thakle abar create korle error dito
  const existing = await col.listSearchIndexes().toArray();
  const found = existing.find(i => i.name === 'vector_index');

  if (found) {
    console.log('vector_index already exists. Status:', found.status); // want: READY
  } else {
    await col.createSearchIndex({
      name: 'vector_index',       // Member 2 er retriever ei naam diye $vectorSearch kore (team contract)
      type: 'vectorSearch',
      definition: {
        fields: [
          // numDimensions 384 — all-MiniLM-L6-v2 er output size er sathe mil thakte hobe
          { type: 'vector', path: 'embedding', numDimensions: 384, similarity: 'cosine' }
        ]
      }
    });
    console.log('vector_index created. Wait 1–2 minutes, then run again to see READY.');
  }
} catch (err) {
  console.error('Index creation FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await closeMongo();
}
