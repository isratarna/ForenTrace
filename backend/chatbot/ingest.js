// backend/chatbot/ingest.js   →   run from backend folder: node chatbot/ingest.js
// PDF → text → chunks → embeddings → MongoDB   (left side of sir's diagram)
// FAQ change hole: PDF abar export kore ei script abar chalalei hobe (index notun kore lage na)
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pdfParse from 'pdf-parse/lib/pdf-parse.js'; // direct lib import — noile 05-versions-space.pdf error ashe
import { chunkText } from './chunker.js';
import { embed } from './embedder.js';
import { getCollection, closeMongo } from './mongoClient.js';

// ES modules have no __dirname, so we build the path from this file's URL
const here = path.dirname(fileURLToPath(import.meta.url));
const PDF_PATH = path.join(here, 'data', 'forentrace_faq.pdf');
const EMBEDDING_SIZE = 384; // all-MiniLM-L6-v2 shob shomoy 384 ta number dey — vector_index o 384

try {
  // 1. Read the PDF and extract plain text
  const buffer = fs.readFileSync(PDF_PATH);
  const { text } = await pdfParse(buffer);
  console.log(`PDF read: ${text.length} characters`);

  // 2. Pre-process + chunking
  const chunks = chunkText(text);
  console.log(`Created ${chunks.length} chunks`);

  // Faka PDF hole thamo — noile niche deleteMany purono shob chunk muche felto, notun kichu dhukto na
  if (chunks.length === 0) {
    throw new Error('No chunks created from the PDF. Old chunks were NOT deleted.');
  }

  // 3. Embedding: every chunk becomes a vector of 384 numbers
  const docs = [];
  for (let i = 0; i < chunks.length; i++) {
    const embedding = await embed(chunks[i]);

    // Vul size er vector index e search e ashbe na — tai insert er agei check
    if (embedding.length !== EMBEDDING_SIZE) {
      throw new Error(`Chunk ${i} has ${embedding.length} numbers, expected ${EMBEDDING_SIZE}. Old chunks were NOT deleted.`);
    }

    docs.push({
      text: chunks[i],
      embedding,
      source: 'forentrace_faq.pdf',
      chunkIndex: i,
      createdAt: new Date()
    });
    console.log(`Embedded chunk ${i + 1}/${chunks.length}`);
  }

  // 4. Insertion: replace old chunks with the new ones
  // Shob embedding ready howar PORE delete — majhe error hole purono data thik thake
  // deleteMany({}) → Member 2 er 'sample-seed' chunk o chole jay, ar abar run korle duplicate hoy na
  const col = await getCollection();
  await col.deleteMany({});
  await col.insertMany(docs);
  console.log(`Inserted ${docs.length} chunks into MongoDB`);
} catch (err) {
  console.error('Ingestion FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await closeMongo(); // connection bondho, noile script shesh hoy na
}
