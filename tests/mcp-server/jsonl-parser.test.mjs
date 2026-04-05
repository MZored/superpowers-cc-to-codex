import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCodexJsonl,
  truncateRawOutput,
  validateImplementerResult
} from '../../scripts/lib/codex-jsonl.mjs';

test('parseCodexJsonl extracts thread id and final assistant text', () => {
  const parsed = parseCodexJsonl(
    [
      '{"type":"thread.started","thread_id":"thread-123"}',
      '{"type":"turn.started"}',
      '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"{\\"status\\":\\"DONE\\"}"}}',
      '{"type":"turn.completed"}'
    ].join('\n')
  );

  assert.equal(parsed.threadId, 'thread-123');
  assert.equal(parsed.assistantText, '{"status":"DONE"}');
  assert.deepEqual(parsed.result, { status: 'DONE' });
});

test('truncateRawOutput returns input unchanged when shorter than maxChars', () => {
  assert.equal(truncateRawOutput('hello', 100), 'hello');
});

test('truncateRawOutput returns input unchanged when exactly equal to maxChars', () => {
  const input = 'x'.repeat(10);
  assert.equal(truncateRawOutput(input, 10), input);
});

test('truncateRawOutput truncates with suffix when input exceeds maxChars', () => {
  const input = 'x'.repeat(20);
  const output = truncateRawOutput(input, 5);
  assert.equal(output, `${'x'.repeat(5)}\n...[truncated 15 chars]`);
});

test('validateImplementerResult throws for non-object input', () => {
  assert.throws(() => validateImplementerResult(null), /must be a JSON object/);
  assert.throws(() => validateImplementerResult('string'), /must be a JSON object/);
  assert.throws(() => validateImplementerResult(42), /must be a JSON object/);
});

test('validateImplementerResult throws for each individual missing required key', () => {
  const base = {
    status: 'DONE',
    summary: 'ok',
    files_changed: [],
    tests: [],
    concerns: []
  };

  for (const key of ['status', 'summary', 'files_changed', 'tests', 'concerns']) {
    const incomplete = { ...base };
    delete incomplete[key];
    assert.throws(
      () => validateImplementerResult(incomplete),
      new RegExp(`missing required field "${key}"`)
    );
  }
});

test('validateImplementerResult throws when array fields are not arrays', () => {
  for (const key of ['files_changed', 'tests', 'concerns']) {
    const malformed = {
      status: 'DONE',
      summary: 'ok',
      files_changed: [],
      tests: [],
      concerns: [],
      [key]: 'not an array'
    };
    assert.throws(() => validateImplementerResult(malformed), /arrays are malformed/);
  }
});

test('validateImplementerResult returns the result unchanged when valid', () => {
  const valid = {
    status: 'DONE',
    summary: 'ok',
    files_changed: ['a.mjs'],
    tests: ['t.mjs'],
    concerns: []
  };
  assert.equal(validateImplementerResult(valid), valid);
});
