import test from 'node:test';
import assert from 'node:assert/strict';
import { runWithMcpRuntime } from '../../scripts/lib/mcp-runtime.mjs';

test('runWithMcpRuntime emits lifecycle progress updates and warning logs from mixed stdout', async () => {
  const progressPayloads = [];
  const logPayloads = [];
  const mixedStdout = [
    'WARN codex emitted diagnostic output',
    JSON.stringify({ type: 'thread.started', thread_id: 'thread-progress' }),
    JSON.stringify({ type: 'turn.started' }),
    JSON.stringify({
      type: 'item.completed',
      item: {
        type: 'agent_message',
        text: JSON.stringify({ status: 'DONE', summary: 'ok' })
      }
    }),
    JSON.stringify({ type: 'turn.completed' })
  ].join('\n');

  const result = await runWithMcpRuntime({
    requestId: 'req-progress',
    progressToken: 'progress-1',
    sendProgress: async (payload) => {
      progressPayloads.push(payload);
    },
    sendLog: async (payload) => {
      logPayloads.push(payload);
    },
    operation: async ({ markSpawned, onStdoutChunk }) => {
      markSpawned({ terminate() {} });
      onStdoutChunk(mixedStdout);
      return { stdout: mixedStdout, stderr: '' };
    }
  });

  assert.equal(result.status, 'ok');
  assert.deepEqual(
    progressPayloads.map((payload) => payload.message),
    [
      'Codex process started',
      'Codex thread created',
      'Codex turn started',
      'Codex assistant message completed',
      'Codex run completed'
    ]
  );
  assert.equal(logPayloads[0]?.level, 'warning');
  assert.equal(logPayloads[0]?.logger, 'codex.exec');
});
