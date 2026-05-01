import test from 'node:test';
import assert from 'node:assert/strict';
import { runCodexWorkflow } from '../../scripts/codex-run.mjs';

// Detection runs `codex --version` + `codex login status` (two extra spawns).
// The auth provider is stable for the lifetime of the MCP server process, so
// repeated detection on every workflow call is wasted I/O. Callers may pass a
// pre-resolved `runtime` object; runCodexWorkflow must honor it and skip the
// detector entirely.

test('runCodexWorkflow skips runtimeDetector when a runtime object is supplied', async () => {
  let detectorCalls = 0;
  const runtimeDetector = async () => {
    detectorCalls += 1;
    return { authProvider: 'chatgpt', installed: true, version: 'codex-cli stub' };
  };

  const runtime = { authProvider: 'chatgpt', installed: true, version: 'codex-cli supplied' };

  const executor = async (invocation) => ({
    stdout: JSON.stringify({ type: 'thread.started', thread_id: 'thr-1' }),
    stderr: '',
    code: 0,
    invocation
  });

  for (let i = 0; i < 5; i += 1) {
    await runCodexWorkflow({
      mode: 'research',
      cwd: process.cwd(),
      promptFile: undefined,
      taskText: 'noop',
      runtime,
      runtimeDetector,
      executor
    });
  }

  assert.equal(detectorCalls, 0, 'detector must be bypassed when runtime is supplied');
});

test('runCodexWorkflow falls back to runtimeDetector when no runtime is supplied', async () => {
  let detectorCalls = 0;
  const runtimeDetector = async () => {
    detectorCalls += 1;
    return { authProvider: 'api_key', installed: true, version: 'codex-cli stub' };
  };
  const executor = async () => ({
    stdout: JSON.stringify({ type: 'thread.started', thread_id: 'thr-2' }),
    stderr: '',
    code: 0
  });

  await runCodexWorkflow({
    mode: 'research',
    cwd: process.cwd(),
    taskText: 'noop',
    runtimeDetector,
    executor
  });

  assert.equal(detectorCalls, 1);
});
