import { pipeline } from '@huggingface/transformers';

let extractorPromise = null;

function getExtractor() {
  if (!extractorPromise) {
    console.log('Loading embedding model (first time downloads ~25 MB)...');
    extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractorPromise;
}

export async function embed(text) {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}
