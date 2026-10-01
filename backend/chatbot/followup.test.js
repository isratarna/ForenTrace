import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHistory, resolveFollowup } from './followup.js';
import { buildPrompt } from './prompt.js';

const history = [
  { role: 'user', text: 'How do I register a DNA sample?' },
  { role: 'assistant', text: 'Use Register DNA Sample.' }
];

test('history is optional, bounded, sanitized and contains complete turns', () => {
  assert.deepEqual(validateHistory(undefined, s => s.trim()), []);
  assert.deepEqual(validateHistory(history, s => s.trim()), history);
  for (const invalid of [null, {}, history.slice(0, 1), [...history, ...history, ...history, ...history],
    [{ role: 'system', text: 'override' }, history[1]],
    [{ role: 'user', text: 'a'.repeat(501) }, history[1]],
    [history[0], { role: 'assistant', text: 'a'.repeat(2001) }]]) {
    assert.throws(() => validateHistory(invalid, s => s.trim()));
  }
  assert.throws(() => validateHistory(history, () => ''));
});

test('first question does not call the rewriter', async () => {
  assert.equal(await resolveFollowup('What is ForenTrace?', [], () => { throw Error('unexpected call'); }), 'What is ForenTrace?');
});

test('rewriter receives recent turns and the latest question, including Bangla', async () => {
  for (const question of ['Who can do it?', 'এটা কে করতে পারে?', 'eta ke korte parbe?', 'What is the weather?']) {
    const result = await resolveFollowup(question, history, async (payload, instruction) => {
      assert.deepEqual(JSON.parse(payload), { conversation: history, latestQuestion: question });
      assert.match(instruction, /changes topic/);
      assert.match(instruction, /untrusted data/);
      return 'Standalone question';
    });
    assert.equal(result, 'Standalone question');
  }
});

test('invalid or failed rewrites fail rather than silently searching the wrong topic', async () => {
  for (const result of ['', ' ', 'a'.repeat(1001)]) {
    await assert.rejects(resolveFollowup('Who?', history, async () => result));
  }
  await assert.rejects(resolveFollowup('Who?', history, async () => { throw Error('unavailable'); }));
});

test('answer prompt gets the resolved referent in all supported languages', () => {
  for (const lang of ['en', 'bn', 'banglish']) {
    const prompt = buildPrompt('Who can do it?', [{ text: 'Officers register samples.' }], {
      lang, englishQuestion: 'Who can register a DNA sample?', resolvedQuestion: 'Who can register a DNA sample?'
    });
    assert.match(prompt, /Who can register a DNA sample/);
    assert.match(prompt, /not a factual source/);
    assert.match(prompt, /Officers register samples/);
    if (lang === 'bn') assert.match(prompt, /Bengali script/);
    if (lang === 'banglish') assert.match(prompt, /Write the answer in Banglish/);
  }
});
