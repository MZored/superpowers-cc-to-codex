import test from 'node:test';
import assert from 'node:assert/strict';
import { runCodexWorkflow } from '../../scripts/codex-run.mjs';

// When the codex binary is missing from PATH, the spawn-level error surfaces
// as `Error: spawn codex ENOENT`, which is opaque for users who don't know
// what the plugin needs. Rewrap it with an actionable hint while preserving
// the original error via `cause`.

test('runCodexWorkflow rewraps ENOENT spawn errors with a usable hint', async () => {
  const enoent = new Error('spawn codex ENOENT');
  enoent.code = 'ENOENT';
  enoent.path = 'codex';
  enoent.syscall = 'spawn codex';

  const executor = async () => {
    throw enoent;
  };

  const runtime = { authProvider: 'chatgpt', installed: true, version: 'codex-cli stub' };

  await assert.rejects(
    runCodexWorkflow({
      mode: 'research',
      cwd: process.cwd(),
      taskText: 'noop',
      runtime,
      executor
    }),
    (error) => {
      assert.match(error.message, /Codex CLI not found in PATH/);
      assert.match(error.message, /codex/);
      // Original error preserved on cause for advanced debugging.
      assert.equal(error.cause, enoent);
      // Code is preserved for callers that branch on it.
      assert.equal(error.code, 'ENOENT');
      return true;
    }
  );
});

test('runCodexWorkflow does not rewrap unrelated errors', async () => {
  const other = new Error('exited with code 1');
  other.code = 1;
  other.stdout = '';
  other.stderr = 'codex: bad request';

  const executor = async () => {
    throw other;
  };

  const runtime = { authProvider: 'chatgpt', installed: true, version: 'codex-cli stub' };

  await assert.rejects(
    runCodexWorkflow({
      mode: 'research',
      cwd: process.cwd(),
      taskText: 'noop',
      runtime,
      executor,
      // Disable retry so the test runs once.
      maxRetries: 0
    }),
    (error) => {
      assert.equal(error, other);
      return true;
    }
  );
});
