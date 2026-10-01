// urmee
// Question → vector → semantic search in MongoDB → most similar FAQ chunks
import { embed } from './embedder.js';
import { getCollection } from './mongoClient.js';

// Load the embedding model + open the MongoDB connection at server start,
// so the first user question does not pay ~1.5 s of setup time.
export async function warmUpChatbot() {
  await Promise.all([embed('warm up'), getCollection()]);
}

export async function searchChunks(question, limit = 4) {
  const queryVector = await embed(question);
  const col = await getCollection();

  return col.aggregate([
    {
      $vectorSearch: {
        index: 'vector_index',   // Member 1's index
        path: 'embedding',
        queryVector,
        numCandidates: 100,      // how many chunks Atlas looks at
        limit                    // how many best ones it returns
      }
    },
    {
      $project: { _id: 0, text: 1, source: 1, score: { $meta: 'vectorSearchScore' } }
    }
  ]).toArray();
}