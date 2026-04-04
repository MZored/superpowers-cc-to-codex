import test from 'node:test';
import assert from 'node:assert/strict';
import { runWithMcpRuntime } from '../../scripts/lib/mcp-runtime.mjs';

test('runWithMcpRuntime returns partial output only when parsed data exists', async () => {
  const events = [];

  const result = await runWithMcpRuntime({
    requestId: 'req-1',
    timeoutMs: 1,
    progressToken: 'progress-1',
    sendProgress: async (payload) => events.push(payload),
    operation: async ({ markSpawned }) => {
      markSpawned({ kill() {} });
      const error = new Error('timed out');
      error.stdout = [
        '{"type":"thread.started","thread_id":"thread-123"}',
        '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"status\\":\\"DONE_WITH_CONCERNS\\"}"}}'
      ].join('\n');
      error.stderr = 'deadline exceeded';
      throw error;
    }
  });

  assert.equal(result.status, 'partial');
  assert.equal(result.sessionId, 'thread-123');
  assert.deepEqual(result.result, { status: 'DONE_WITH_CONCERNS' });
  assert.equal(result.stderrTail, 'deadline exceeded');
  assert.equal(events.length > 0, true);

  // Progress payload shape: { progressToken, progress, message }
  const salvageEvent = events[events.length - 1];
  assert.equal(salvageEvent.progressToken, 'progress-1');
  assert.equal(typeof salvageEvent.progress, 'number');
  assert.equal(typeof salvageEvent.message, 'string');
  assert.equal('requestId' in salvageEvent, false);
  assert.equal('tick' in salvageEvent, false);
});

test('runWithMcpRuntime returns status ok on successful operation', async () => {
  const result = await runWithMcpRuntime({
    requestId: 'req-ok',
    timeoutMs: 5000,
    operation: async ({ markSpawned }) => {
      markSpawned({ kill() {} });
      return {
        stdout: [
          '{"type":"thread.started","thread_id":"thread-ok"}',
          '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"status\\":\\"DONE\\"}"}}'
        ].join('\n'),
        stderr: 'warning: deprecated flag'
      };
    }
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.timedOut, false);
  assert.equal(result.sessionId, 'thread-ok');
  assert.deepEqual(result.result, { status: 'DONE' });
  assert.equal(result.stderrTail, 'warning: deprecated flag');
});

test('runWithMcpRuntime partial salvage triggers on assistantText alone', async () => {
  const result = await runWithMcpRuntime({
    requestId: 'req-assistant-only',
    operation: async ({ markSpawned }) => {
      markSpawned({ kill() {} });
      const error = new Error('crash');
      error.stdout = '{"type":"item.completed","item":{"type":"agent_message","text":"free-form reply, not JSON"}}';
      error.stderr = '';
      throw error;
    }
  });

  assert.equal(result.status, 'partial');
  assert.equal(result.timedOut, false);
  assert.equal(result.sessionId, null);
  assert.equal(result.result, null);
  assert.equal(result.assistantText, 'free-form reply, not JSON');
});

test('runWithMcpRuntime partial salvage reports timedOut true when the timer fires', async () => {
  const result = await runWithMcpRuntime({
    requestId: 'req-timed-out',
    timeoutMs: 5,
    operation: async ({ markSpawned, signal }) => {
      markSpawned({ kill() {} });
      // Wait until the timer fires and aborts the signal
      await new Promise((resolve) => {
        if (signal.aborted) {
          resolve();
          return;
        }
        signal.addEventListener('abort', resolve, { once: true });
      });
      const error = new Error('deadline exceeded');
      error.stdout = '{"type":"thread.started","thread_id":"thread-timeout"}';
      error.stderr = '';
      throw error;
    }
  });

  assert.equal(result.status, 'partial');
  assert.equal(result.timedOut, true);
  assert.equal(result.sessionId, 'thread-timeout');
});
