import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCodexJsonlStreamParser,
  advanceCodexLifecycle,
  parseCodexJsonl,
  truncateRawOutput,
  validateImplementerResult
} from '../../scripts/lib/codex-jsonl.mjs';

test('createCodexJsonlStreamParser separates diagnostics from JSON events across chunk boundaries', async () => {
  const fixture = await readFile(
    new URL('../fixtures/codex/streaming-mixed-output.txt', import.meta.url),
    'utf8'
  );

  const events = [];
  const diagnostics = [];
  const parser = createCodexJsonlStreamParser({
    onJsonEvent: (event) => events.push(event),
    onDiagnosticLine: (line) => diagnostics.push(line)
  });

  parser.push(fixture.slice(0, 41));
  parser.push(fixture.slice(41, 97));
  parser.push(fixture.slice(97));
  parser.end();

  assert.deepEqual(events.map((event) => event.type), [
    'thread.started',
    'turn.started',
    'item.completed',
    'turn.completed'
  ]);
  assert.equal(diagnostics.length, 2);
  assert.match(diagnostics[0], /\bWARN\b/);
  assert.match(diagnostics[1], /\bINFO\b/);
});

test('advanceCodexLifecycle reflects only observed lifecycle states', async () => {
  const fixture = await readFile(
    new URL('../fixtures/codex/streaming-mixed-output.txt', import.meta.url),
    'utf8'
  );

  const seenStages = [];
  let state = null;
  const parser = createCodexJsonlStreamParser({
    onJsonEvent: (event) => {
      const nextState = advanceCodexLifecycle(state, event);
      if (nextState !== state && nextState?.stage) {
        seenStages.push(nextState.stage);
      }
      state = nextState;
    }
  });

  parser.push(fixture.slice(0, 41));
  parser.push(fixture.slice(41, 97));
  parser.push(fixture.slice(97));
  parser.end();

  assert.deepEqual(seenStages, [
    'thread.started',
    'turn.started',
    'item.completed',
    'turn.completed'
  ]);
  assert.equal(state.threadId, 'thread-stream');
  assert.equal(state.assistantText, '{"status":"DONE","summary":"ok"}');
  assert.deepEqual(state.result, { status: 'DONE', summary: 'ok' });
});

test('parseCodexJsonl extracts thread id, final assistant text, and parsed result from buffered output', async () => {
  const fixture = await readFile(
    new URL('../fixtures/codex/streaming-mixed-output.txt', import.meta.url),
    'utf8'
  );

  const parsed = parseCodexJsonl(fixture);

  assert.equal(parsed.threadId, 'thread-stream');
  assert.equal(parsed.assistantText, '{"status":"DONE","summary":"ok"}');
  assert.deepEqual(parsed.result, { status: 'DONE', summary: 'ok' });
});

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

test('validateImplementerResult throws when files_changed contains non-strings', () => {
  const malformed = {
    status: 'DONE',
    summary: 'ok',
    files_changed: [42, null],
    tests: [],
    concerns: []
  };
  assert.throws(() => validateImplementerResult(malformed), /files_changed must contain strings/);
});

test('validateImplementerResult throws when concerns contains non-strings', () => {
  const malformed = {
    status: 'DONE',
    summary: 'ok',
    files_changed: ['a.mjs'],
    tests: [],
    concerns: [{ text: 'not a string' }]
  };
  assert.throws(() => validateImplementerResult(malformed), /concerns must contain strings/);
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
