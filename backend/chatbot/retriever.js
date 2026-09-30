// urmee
// Question → vector → semantic search in MongoDB → most similar FAQ chunks
import { embed } from './embedder.js';
import { getCollection } from './mongoClient.js';

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