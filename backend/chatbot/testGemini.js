// urmee

// node chatbot/testGemini.js
import 'dotenv/config';
import { callGemini } from './gemini.js';

try {
  const text = await callGemini(
    'Say hello to the ForenTrace team in one short sentence.',
    'You are a friendly assistant.'
  );
  console.log('Gemini says:', text);
} catch (err) {
  console.error('Gemini test FAILED:', err.message);
}