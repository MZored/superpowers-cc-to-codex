import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodexEventEmitter, createMcpLoggingSink, eventLevel, redactEvent } from '../../scripts/lib/codex-events.mjs';

test('eventLevel maps lifecycle event types to MCP log levels', () => {
  assert.equal(eventLevel({ type: 'codex.invocation.start' }), 'debug');
  assert.equal(eventLevel({ type: 'codex.invocation.end', status: 'ok' }), 'info');
  assert.equal(eventLevel({ type: 'codex.invocation.end', status: 'partial' }), 'warning');
  assert.equal(eventLevel({ type: 'codex.invocation.error' }), 'error');
  assert.equal(eventLevel({ type: 'mcp.request.cancel' }), 'warning');
});

test('redactEvent removes prompt-bearing fields before sinks receive data', () => {
  const redacted = redactEvent({
    type: 'codex.invocation.start',
    mode: 'implement',
    taskId: 'phase-1',
    taskText: 'secret prompt',
    prompt: 'secret prompt',
    message: 'safe message'
  });

  assert.equal('taskText' in redacted, false);
  assert.equal('prompt' in redacted, false);
  assert.equal(redacted.message, 'safe message');
});

test('redactEvent recursively scrubs prompt-bearing keys nested in objects', () => {
  const redacted = redactEvent({
    type: 'codex.invocation.start',
    mode: 'implement',
    context: {
      prompt: 'secret',
      nested: { taskText: 'also secret', safe: 'ok' }
    },
    history: [
      { promptBody: 'leaked', keep: 1 },
      { rawPrompt: 'leaked2', keep: 2 }
    ]
  });

  assert.equal('prompt' in redacted.context, false);
  assert.equal('taskText' in redacted.context.nested, false);
  assert.equal(redacted.context.nested.safe, 'ok');
  assert.equal('promptBody' in redacted.history[0], false);
  assert.equal(redacted.history[0].keep, 1);
  assert.equal('rawPrompt' in redacted.history[1], false);
  assert.equal(redacted.history[1].keep, 2);
});

test('redactEvent leaves non-plain objects unchanged', () => {
  const date = new Date('2026-04-30T00:00:00.000Z');
  const buf = Buffer.from('hello');
  const redacted = redactEvent({
    type: 'codex.invocation.start',
    mode: 'implement',
    when: date,
    payload: buf
  });

  assert.equal(redacted.when, date);
  assert.equal(redacted.payload, buf);
});

test('createCodexEventEmitter swallows console sink errors', async () => {
  const mcpRecords = [];
  const fileWrites = [];
  const emitter = createCodexEventEmitter({
    now: () => '2026-04-30T00:00:00.000Z',
    mcpSink: async (record) => mcpRecords.push(record),
    logFile: '/tmp/codex-events.jsonl',
    appendFile: async (file, text) => fileWrites.push({ file, text }),
    consoleSink: () => {
      throw new Error('stderr closed');
    }
  });

  await emitter.emit({
    type: 'mcp.request.start',
    name: 'codex_plan',
    requestId: 'req-2'
  });

  assert.equal(mcpRecords.length, 1);
  assert.equal(fileWrites.length, 1);
});

test('createCodexEventEmitter validates events and emits sanitized MCP/file/console records', async () => {
  const mcpRecords = [];
  const fileWrites = [];
  const consoleRecords = [];
  const emitter = createCodexEventEmitter({
    now: () => '2026-04-30T00:00:00.000Z',
    mcpSink: async (record) => mcpRecords.push(record),
    logFile: '/tmp/codex-events.jsonl',
    appendFile: async (file, text) => fileWrites.push({ file, text }),
    consoleSink: (line) => consoleRecords.push(line)
  });

  await emitter.emit({
    type: 'codex.invocation.start',
    mode: 'implement',
    taskId: 'phase-2',
    model: 'auto',
    effort: 'auto',
    serviceTier: 'fast',
    taskText: 'do not log me'
  });

  assert.equal(mcpRecords.length, 1);
  assert.equal(mcpRecords[0].timestamp, '2026-04-30T00:00:00.000Z');
  assert.equal(mcpRecords[0].mode, 'implement');
  assert.equal('taskText' in mcpRecords[0], false);
  assert.equal(fileWrites.length, 1);
  assert.equal(fileWrites[0].file, '/tmp/codex-events.jsonl');
  assert.match(fileWrites[0].text, /"codex\.invocation\.start"/);
  assert.equal(consoleRecords.length, 1);
});

test('createCodexEventEmitter disables a failing file sink and keeps MCP events flowing', async () => {
  const mcpRecords = [];
  let writes = 0;
  const emitter = createCodexEventEmitter({
    now: () => '2026-04-30T00:00:00.000Z',
    mcpSink: async (record) => mcpRecords.push(record),
    logFile: '/tmp/codex-events.jsonl',
    appendFile: async () => {
      writes += 1;
      throw new Error('disk full');
    }
  });

  await emitter.emit({ type: 'mcp.request.start', name: 'codex_plan', requestId: 'req-1' });
  await emitter.emit({ type: 'mcp.request.end', name: 'codex_plan', requestId: 'req-1', durationMs: 10, status: 'ok' });

  assert.equal(writes, 1);
  assert.equal(mcpRecords.length, 2);
});

test('createMcpLoggingSink converts events to notifications/message payloads', async () => {
  const payloads = [];
  const sink = createMcpLoggingSink(async (payload) => payloads.push(payload));

  await sink({
    type: 'codex.invocation.error',
    timestamp: '2026-04-30T00:00:00.000Z',
    mode: 'implement',
    errorClass: 'Error',
    transient: false,
    message: 'failed'
  });

  assert.equal(payloads[0].level, 'error');
  assert.equal(payloads[0].logger, 'superpowers.codex');
  assert.equal(payloads[0].data.message, 'failed');
});

test('invalid events are rejected before any sink receives them', async () => {
  const mcpRecords = [];
  const emitter = createCodexEventEmitter({
    mcpSink: async (record) => mcpRecords.push(record)
  });

  await assert.rejects(
    emitter.emit({ type: 'codex.invocation.end', mode: 'implement', status: 'ok' }),
    /durationMs/
  );
  assert.equal(mcpRecords.length, 0);
});

test('createCodexEventEmitter notifies once when the file sink first fails', async () => {
  const notifyCalls = [];
  const emitter = createCodexEventEmitter({
    now: () => '2026-04-30T00:00:00.000Z',
    logFile: '/tmp/codex-events.jsonl',
    appendFile: async () => {
      throw new Error('disk full');
    },
    notifySinkDisabled: (info) => notifyCalls.push(info)
  });

  await emitter.emit({ type: 'mcp.request.start', name: 'codex_plan', requestId: 'req-1' });
  await emitter.emit({ type: 'mcp.request.end', name: 'codex_plan', requestId: 'req-1', durationMs: 1, status: 'ok' });

  // Operator gets exactly one signal — first failure surfaces, subsequent ones stay quiet.
  assert.equal(notifyCalls.length, 1);
  assert.equal(notifyCalls[0].logFile, '/tmp/codex-events.jsonl');
  assert.match(notifyCalls[0].error.message, /disk full/);
});
