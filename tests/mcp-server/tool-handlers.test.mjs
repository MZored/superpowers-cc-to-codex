/**
 * tool-handlers.test.mjs
 *
 * Unit tests for createToolCallHandler — the factory that wires MCP tool/call
 * requests through runWithMcpRuntime to the Codex workflow adapter. All tests
 * inject a stub runWorkflow so no real Codex CLI is invoked.
 *
 * runWorkflow stubs return stdout containing Codex JSONL events; runWithMcpRuntime
 * re-parses that stdout via parseCodexJsonl to produce the final runtime result.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createToolCallHandler } from '../../scripts/mcp-server.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a JSONL stdout string that parseCodexJsonl extracts sessionId /
 * assistantText / result from.
 */
function makeJsonlStdout({ threadId, resultObject }) {
  const lines = [];
  if (threadId) {
    lines.push(JSON.stringify({ type: 'thread.started', thread_id: threadId }));
  }
  if (resultObject) {
    lines.push(
      JSON.stringify({
        type: 'item.completed',
        item: {
          type: 'agent_message',
          text: JSON.stringify(resultObject)
        }
      })
    );
  }
  return lines.join('\n');
}

function makeHandler(overrides = {}) {
  return createToolCallHandler({
    pluginRoot: '/plugin',
    getRoots: async () => [{ uri: 'file:///repo' }],
    runWorkflow: async () => ({
      stdout: makeJsonlStdout({
        threadId: 'thread-123',
        resultObject: { summary: 'Done.' }
      }),
      stderr: ''
    }),
    ...overrides
  });
}

function makeRequest(name, args = {}) {
  return {
    id: 2,
    params: { name, arguments: args }
  };
}

// ---------------------------------------------------------------------------
// Happy-path: codex_plan
// ---------------------------------------------------------------------------

test('createToolCallHandler routes codex_plan through the adapter and returns MCP-native output', async () => {
  const handleToolCall = makeHandler();

  const result = await handleToolCall(
    makeRequest('codex_plan', {
      prompt: 'Turn this spec into a plan.',
      workspaceRoot: '/repo'
    })
  );

  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.status, 'ok');
  assert.equal(result.structuredContent.sessionId, 'thread-123');
  assert.deepEqual(result.structuredContent.result, { summary: 'Done.' });
  assert.match(result.content[0].text, /codex plan completed/i);
});

// ---------------------------------------------------------------------------
// Unknown tool → isError: true
// ---------------------------------------------------------------------------

test('handler returns isError: true with "Unknown tool" message for unrecognized tool name', async () => {
  const handleToolCall = makeHandler();

  const result = await handleToolCall(makeRequest('codex_nonexistent', { prompt: 'x' }));

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /unknown tool/i);
});

// ---------------------------------------------------------------------------
// signal + onSpawn forwarding (via runWithMcpRuntime operation callback)
// ---------------------------------------------------------------------------

test('handler passes signal, spawn, and stream callbacks to runWorkflow and forwards logs', async () => {
  let capturedSignal;
  let capturedOnSpawn;
  let capturedOnStdoutChunk;
  let capturedOnStderrChunk;
  const logPayloads = [];

  const handleToolCall = createToolCallHandler({
    pluginRoot: '/plugin',
    getRoots: async () => [{ uri: 'file:///repo' }],
    server: {
      sendLoggingMessage: async (payload) => {
        logPayloads.push(payload);
      }
    },
    runWorkflow: async ({ signal, onSpawn, onStdoutChunk, onStderrChunk }) => {
      capturedSignal = signal;
      capturedOnSpawn = onSpawn;
      capturedOnStdoutChunk = onStdoutChunk;
      capturedOnStderrChunk = onStderrChunk;
      onStdoutChunk('WARN runtime diagnostic line\n');
      onStderrChunk('stderr warning line\n');
      return {
        stdout: JSON.stringify({ type: 'thread.started', thread_id: 'thread-signal' }),
        stderr: ''
      };
    }
  });

  await handleToolCall(
    makeRequest('codex_research', { prompt: 'research something', workspaceRoot: '/repo' })
  );

  assert.ok(capturedSignal instanceof AbortSignal, 'signal should be an AbortSignal');
  assert.equal(typeof capturedOnSpawn, 'function', 'onSpawn should be a function');
  assert.equal(typeof capturedOnStdoutChunk, 'function', 'onStdoutChunk should be a function');
  assert.equal(typeof capturedOnStderrChunk, 'function', 'onStderrChunk should be a function');
  const codexLogPayloads = logPayloads.filter((payload) =>
    ['codex.exec', 'codex.stderr'].includes(payload?.logger)
  );
  assert.equal(codexLogPayloads[0]?.logger, 'codex.exec');
  assert.equal(codexLogPayloads[1]?.logger, 'codex.stderr');
});

// ---------------------------------------------------------------------------
// runWorkflow throws → isError: true
// ---------------------------------------------------------------------------

test('handler catches errors thrown by runWorkflow and returns isError: true with status error', async () => {
  const handleToolCall = createToolCallHandler({
    pluginRoot: '/plugin',
    getRoots: async () => [{ uri: 'file:///repo' }],
    runWorkflow: async () => {
      const err = new Error('Codex crashed unexpectedly');
      err.stderr = 'fatal: codex exited with code 1';
      throw err;
    }
  });

  const result = await handleToolCall(
    makeRequest('codex_plan', { prompt: 'do something', workspaceRoot: '/repo' })
  );

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Codex crashed unexpectedly/);
  assert.equal(result.structuredContent.status, 'error');
  assert.equal(result.structuredContent.sessionId, null);
  assert.equal(result.structuredContent.timedOut, false);
  assert.equal(result.structuredContent.result, null);
  assert.match(result.structuredContent.stderrTail, /codex exited/);
});

// ---------------------------------------------------------------------------
// Partial result → runtime returns status: 'partial' via error-with-stdout
// salvage path in runWithMcpRuntime
// ---------------------------------------------------------------------------

test('partial result content text contains "partially"', async () => {
  const handleToolCall = createToolCallHandler({
    pluginRoot: '/plugin',
    getRoots: async () => [{ uri: 'file:///repo' }],
    runWorkflow: async () => {
      // Simulate a Codex error whose stdout still contains parseable JSONL —
      // runWithMcpRuntime salvages this into a status: 'partial' result.
      const err = new Error('codex exited with code 2');
      err.stdout = JSON.stringify({ type: 'thread.started', thread_id: 'thread-partial' });
      err.stderr = '';
      throw err;
    }
  });

  const result = await handleToolCall(
    makeRequest('codex_plan', { prompt: 'plan something', workspaceRoot: '/repo' })
  );

  assert.equal(result.isError, false);
  assert.match(result.content[0].text, /partially/i);
  assert.equal(result.structuredContent.status, 'partial');
  assert.equal(result.structuredContent.sessionId, 'thread-partial');
});

// ---------------------------------------------------------------------------
// workspaceRoot extraction → selectWorkspaceRoot via getRoots
// ---------------------------------------------------------------------------

test('handler extracts workspaceRoot from args and hands it to selectWorkspaceRoot via getRoots', async () => {
  let capturedCwd;

  const handleToolCall = createToolCallHandler({
    pluginRoot: '/plugin',
    getRoots: async () => [{ uri: 'file:///repo-a' }, { uri: 'file:///repo-b' }],
    runWorkflow: async (request) => {
      capturedCwd = request.cwd;
      return { stdout: '', stderr: '' };
    }
  });

  await handleToolCall(
    makeRequest('codex_research', {
      prompt: 'research in repo-b',
      workspaceRoot: '/repo-b'
    })
  );

  assert.equal(capturedCwd, '/repo-b');
});

test('handler throws when workspaceRoot is missing and multiple roots are advertised', async () => {
  const handleToolCall = createToolCallHandler({
    pluginRoot: '/plugin',
    getRoots: async () => [{ uri: 'file:///repo-a' }, { uri: 'file:///repo-b' }],
    runWorkflow: async () => ({ stdout: '', stderr: '' })
  });

  const result = await handleToolCall(
    makeRequest('codex_research', { prompt: 'without root' })
  );

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /workspaceRoot/i);
});

test('read-only tools do not scaffold project config into the workspace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-readonly-tool-'));
  const handleToolCall = createToolCallHandler({
    pluginRoot: '/plugin',
    getRoots: async () => [{ uri: `file://${root}` }],
    runWorkflow: async () => ({ stdout: '', stderr: '' })
  });

  await handleToolCall(
    makeRequest('codex_plan', {
      prompt: 'plan without writing config',
      workspaceRoot: root
    })
  );

  await assert.rejects(access(join(root, '.claude', 'codex-defaults.json')), /ENOENT/);
});

test('write tools emit an MCP log message when scaffolding the project config', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-scaffold-log-'));
  const logs = [];
  const handleToolCall = createToolCallHandler({
    pluginRoot: '/plugin',
    getRoots: async () => [{ uri: `file://${root}` }],
    runWorkflow: async () => ({ stdout: '', stderr: '' }),
    server: {
      notification: async () => {},
      sendLoggingMessage: async (payload) => {
        logs.push(payload);
      }
    }
  });

  await handleToolCall(
    makeRequest('codex_implement', {
      taskId: 'scaffold-log',
      prompt: 'first implement run',
      workspaceRoot: root
    })
  );

  const scaffoldLog = logs.find(
    (entry) => entry.logger === 'codex.config' && /codex-defaults\.json/.test(entry.data?.message ?? '')
  );
  assert.ok(scaffoldLog, `expected codex.config scaffold log, saw ${JSON.stringify(logs)}`);
  assert.equal(scaffoldLog.level, 'info');
});

test('scaffold log is not emitted when codex-defaults.json already exists', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-scaffold-skip-'));
  await mkdir(join(root, '.claude'), { recursive: true });
  await writeFile(
    join(root, '.claude', 'codex-defaults.json'),
    JSON.stringify({ effort: 'high' })
  );

  const logs = [];
  const handleToolCall = createToolCallHandler({
    pluginRoot: '/plugin',
    getRoots: async () => [{ uri: `file://${root}` }],
    runWorkflow: async () => ({ stdout: '', stderr: '' }),
    server: {
      notification: async () => {},
      sendLoggingMessage: async (payload) => {
        logs.push(payload);
      }
    }
  });

  await handleToolCall(
    makeRequest('codex_implement', {
      taskId: 'no-scaffold-log',
      prompt: 'implement run with existing config',
      workspaceRoot: root
    })
  );

  const scaffoldLog = logs.find((entry) => entry.logger === 'codex.config');
  assert.equal(scaffoldLog, undefined, 'scaffold log should be silent when file exists');
});

// ---------------------------------------------------------------------------
// structuredContent shape
// ---------------------------------------------------------------------------

test('structuredContent contains all required fields on success', async () => {
  const handleToolCall = makeHandler();

  const result = await handleToolCall(
    makeRequest('codex_implement', {
      taskId: 'task-42',
      prompt: 'implement something',
      workspaceRoot: '/repo'
    })
  );

  const sc = result.structuredContent;
  assert.ok('status' in sc, 'structuredContent.status');
  assert.ok('taskId' in sc, 'structuredContent.taskId');
  assert.ok('sessionId' in sc, 'structuredContent.sessionId');
  assert.ok('timedOut' in sc, 'structuredContent.timedOut');
  assert.ok('result' in sc, 'structuredContent.result');
  assert.ok('assistantText' in sc, 'structuredContent.assistantText');
  assert.ok('stderrTail' in sc, 'structuredContent.stderrTail');
  assert.ok('rawOutput' in sc, 'structuredContent.rawOutput');
});

// ---------------------------------------------------------------------------
// includeRawOutput flows through to runWithMcpRuntime and populates rawOutput
// ---------------------------------------------------------------------------

test('includeRawOutput: true populates structuredContent.rawOutput with the raw JSONL', async () => {
  const jsonl = makeJsonlStdout({
    threadId: 'thread-raw',
    resultObject: { summary: 'Raw test.' }
  });

  const handleToolCall = createToolCallHandler({
    pluginRoot: '/plugin',
    getRoots: async () => [{ uri: 'file:///repo' }],
    runWorkflow: async () => ({ stdout: jsonl, stderr: '' })
  });

  const result = await handleToolCall(
    makeRequest('codex_plan', {
      prompt: 'plan something',
      workspaceRoot: '/repo',
      includeRawOutput: true
    })
  );

  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.rawOutput, jsonl);
});

test('includeRawOutput defaults to false and leaves rawOutput null', async () => {
  const handleToolCall = makeHandler();

  const result = await handleToolCall(
    makeRequest('codex_plan', {
      prompt: 'plan something',
      workspaceRoot: '/repo'
    })
  );

  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.rawOutput, null);
});

// ---------------------------------------------------------------------------
// taskId round-trips from args into structuredContent
// ---------------------------------------------------------------------------

test('structuredContent.taskId echoes arguments.taskId on success', async () => {
  const handleToolCall = makeHandler();

  const result = await handleToolCall(
    makeRequest('codex_implement', {
      taskId: 'task-42',
      prompt: 'implement task 42',
      workspaceRoot: '/repo'
    })
  );

  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.taskId, 'task-42');
});

test('structuredContent.taskId echoes arguments.taskId on error path', async () => {
  const handleToolCall = createToolCallHandler({
    pluginRoot: '/plugin',
    getRoots: async () => [{ uri: 'file:///repo' }],
    runWorkflow: async () => {
      throw new Error('codex failed');
    }
  });

  const result = await handleToolCall(
    makeRequest('codex_implement', {
      taskId: 'task-99',
      prompt: 'implement task 99',
      workspaceRoot: '/repo'
    })
  );

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.taskId, 'task-99');
});

// ---------------------------------------------------------------------------
// progressToken threads into runWithMcpRuntime via request.params._meta
// ---------------------------------------------------------------------------

test('handler threads progressToken from request.params._meta into runWithMcpRuntime', async () => {
  // No direct way to observe progressToken threading from outside runWithMcpRuntime
  // without triggering the 20s timer. Instead we verify the handler accepts the
  // _meta.progressToken field without error and produces a normal result.
  const handleToolCall = makeHandler();

  const result = await handleToolCall({
    id: 5,
    params: {
      name: 'codex_plan',
      arguments: { prompt: 'plan something', workspaceRoot: '/repo' },
      _meta: { progressToken: 'client-progress-token-42' }
    }
  });

  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.status, 'ok');
});
