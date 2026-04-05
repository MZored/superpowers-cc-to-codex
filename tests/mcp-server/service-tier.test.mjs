/**
 * Service-tier retry tests.
 *
 * NOTE: The internal retry logic lives inside the non-exported `runInvocation` function in
 * codex-run.mjs, which calls `executeCommand` -> `runCommand` directly with no injection
 * seam.  A white-box unit test of the retry path (verifying that the retry call receives
 * the same { signal, onSpawn } options) is therefore deferred until `runInvocation` is
 * either exported or refactored to accept an injectable runner parameter (planned for
 * Task 3 when the MCP server wraps runInvocation directly).
 *
 * What we CAN test here:
 *   • runCodexWorkflow with serviceTier:'fast' still succeeds when the injected executor
 *     does not throw (happy path, no retry needed).
 *   • runCodexWorkflow with serviceTier:'fast' re-throws when the injected executor throws
 *     with an error that does NOT mention service_tier (no spurious retry masking).
 *
 * The actual retry path (executor throws with /service_tier|fast/ in the output) is covered
 * indirectly by the existing tests in tests/adapter/codex-run.test.mjs once runInvocation
 * gains an injection seam.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { runCodexWorkflow } from '../../scripts/codex-run.mjs';

const STUB_RUNTIME = async () => ({
  installed: true,
  authenticated: true,
  authProvider: 'chatgpt',
  version: 'codex-cli 0.111.0'
});

const STUB_STATE_STORE = {
  loadRequired: async () => null,
  save: async () => {}
};

test('runCodexWorkflow with serviceTier fast succeeds when executor returns normally', async () => {
  const controller = new AbortController();
  const onSpawn = (child) => child;

  let capturedOptions;

  const result = await runCodexWorkflow({
    mode: 'implement',
    cwd: '/repo',
    taskId: 'task-fast-ok',
    taskText: 'do the thing',
    serviceTier: 'fast',
    signal: controller.signal,
    onSpawn,
    runtimeDetector: STUB_RUNTIME,
    executor: async (invocation, options) => {
      capturedOptions = options;
      return {
        stdout: '{"type":"thread.started","thread_id":"thread-fast-1"}',
        stderr: '',
        code: 0
      };
    },
    stateStore: STUB_STATE_STORE
  });

  assert.equal(result.sessionId, 'thread-fast-1');
  // Verify execution options are forwarded even in the fast-tier path
  assert.equal(capturedOptions.signal, controller.signal);
  assert.equal(capturedOptions.onSpawn, onSpawn);
});

test('runCodexWorkflow with serviceTier fast re-throws unrelated executor errors', async () => {
  await assert.rejects(
    runCodexWorkflow({
      mode: 'implement',
      cwd: '/repo',
      taskId: 'task-fast-err',
      taskText: 'do the thing',
      serviceTier: 'fast',
      runtimeDetector: STUB_RUNTIME,
      executor: async () => {
        const error = new Error('disk full');
        error.stdout = '';
        error.stderr = 'ENOSPC: no space left on device';
        throw error;
      },
      stateStore: STUB_STATE_STORE
    }),
    /disk full/
  );
});

// DEFERRED: white-box test that the retry call receives { signal, onSpawn }.
// Requires runInvocation to be exported with an injectable runCommand parameter.
// Track in Task 3 / MCP server integration work.
