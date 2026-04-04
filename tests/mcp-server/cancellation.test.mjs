import test from 'node:test';
import assert from 'node:assert/strict';
import { runWithMcpRuntime } from '../../scripts/lib/mcp-runtime.mjs';

test('runWithMcpRuntime kills the tracked child when the timeout fires', async () => {
  let killed = false;

  // The runtime's internal timeout timer calls cancel(), which invokes
  // trackedChild.kill(). We verify that the tracked child's kill() is called.
  await runWithMcpRuntime({
    requestId: 'req-cancel',
    timeoutMs: 5,
    operation: async ({ markSpawned, signal }) => {
      markSpawned({
        kill() {
          killed = true;
        }
      });
      // Wait until the abort signal fires (triggered by the timeout timer)
      await new Promise((resolve) => {
        if (signal.aborted) {
          resolve();
          return;
        }
        signal.addEventListener('abort', resolve, { once: true });
      });
      throw new Error('aborted');
    }
  }).catch(() => {});

  assert.equal(killed, true);
});

test('runWithMcpRuntime re-throws when the operation throws without parseable stdout', async () => {
  await assert.rejects(
    runWithMcpRuntime({
      requestId: 'req-noparseable',
      timeoutMs: 5000,
      operation: async ({ markSpawned }) => {
        markSpawned({ kill() {} });
        const error = new Error('fatal codec error');
        error.stdout = 'not jsonl at all, just plain text';
        error.stderr = 'codec exploded';
        throw error;
      }
    }),
    /fatal codec error/
  );
});

test('runWithMcpRuntime re-throws when the operation throws with no stdout at all', async () => {
  await assert.rejects(
    runWithMcpRuntime({
      requestId: 'req-nostdout',
      timeoutMs: 5000,
      operation: async ({ markSpawned }) => {
        markSpawned({ kill() {} });
        throw new Error('process crashed before output');
      }
    }),
    /process crashed before output/
  );
});
