import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildInvocation, runCodexWorkflow } from '../../scripts/codex-run.mjs';
import { loadRequiredTaskState } from '../../scripts/lib/codex-state.mjs';

test('buildInvocation rejects unsupported modes', () => {
  assert.throws(
    () => buildInvocation({ mode: 'invalid', cwd: '/repo', taskId: 'task-invalid' }),
    /Unsupported mode: invalid/
  );
});

test('runCodexWorkflow validates resume output and persists salvaged partial state', async () => {
  const saves = [];

  await assert.rejects(
    () =>
      runCodexWorkflow({
        mode: 'resume',
        cwd: '/repo',
        taskId: 'task-17',
        sessionId: 'thread-123',
        schemaPath: '/repo/schemas/implementer-result.schema.json',
        promptFile: '/repo/skills/subagent-driven-development-codex/prompts/fix-task.md',
        runtimeDetector: async () => ({
          installed: true,
          authenticated: true,
          authProvider: 'chatgpt',
          version: 'codex-cli 0.111.0'
        }),
        executor: async () => {
          const error = new Error('timed out');
          error.stdout = [
            '{"type":"thread.started","thread_id":"thread-123"}',
            '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"status\\":\\"DONE\\"}"}}'
          ].join('\n');
          error.stderr = 'deadline exceeded';
          throw error;
        },
        stateStore: {
          loadRequired: async () => null,
          save: async (cwd, taskId, state) => saves.push({ cwd, taskId, state })
        }
      }),
    /implementer-result|summary|files_changed|tests|concerns/i
  );

  assert.equal(saves[0].state.sessionId, 'thread-123');
});

test('runCodexWorkflow validates implement output (success path) — symmetric with resume', async () => {
  await assert.rejects(
    () =>
      runCodexWorkflow({
        mode: 'implement',
        cwd: '/repo',
        taskId: 'task-impl-bad',
        schemaPath: '/repo/schemas/implementer-result.schema.json',
        promptFile: '/repo/skills/subagent-driven-development-codex/prompts/implement-task.md',
        runtimeDetector: async () => ({
          installed: true,
          authenticated: true,
          authProvider: 'chatgpt',
          version: 'codex-cli 0.125.0'
        }),
        executor: async () => ({
          stdout: [
            '{"type":"thread.started","thread_id":"thread-impl"}',
            // Status is malformed; missing required fields.
            '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"status\\":\\"WHATEVER\\"}"}}'
          ].join('\n'),
          stderr: '',
          code: 0
        }),
        stateStore: {
          loadRequired: async () => null,
          save: async () => {}
        }
      }),
    /implementer-result|summary|files_changed|tests|concerns/i
  );
});

test('runCodexWorkflow validates implement output on salvage path too', async () => {
  await assert.rejects(
    () =>
      runCodexWorkflow({
        mode: 'implement',
        cwd: '/repo',
        taskId: 'task-impl-salvage',
        schemaPath: '/repo/schemas/implementer-result.schema.json',
        promptFile: '/repo/skills/subagent-driven-development-codex/prompts/implement-task.md',
        runtimeDetector: async () => ({
          installed: true,
          authenticated: true,
          authProvider: 'chatgpt',
          version: 'codex-cli 0.125.0'
        }),
        executor: async () => {
          const error = new Error('crashed');
          error.stdout = [
            '{"type":"thread.started","thread_id":"thread-impl-salv"}',
            '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"status\\":\\"DONE\\"}"}}'
          ].join('\n');
          error.stderr = 'panic';
          throw error;
        },
        stateStore: {
          loadRequired: async () => null,
          save: async () => {}
        }
      }),
    /implementer-result|summary|files_changed|tests|concerns/i
  );
});

test('runCodexWorkflow retries once on transient executor error and returns the second attempt', async () => {
  let attempts = 0;
  const output = await runCodexWorkflow({
    mode: 'implement',
    cwd: '/repo',
    taskId: 'task-retry-ok',
    schemaPath: '/repo/schemas/implementer-result.schema.json',
    promptFile: '/repo/skills/subagent-driven-development-codex/prompts/implement-task.md',
    runtimeDetector: async () => ({
      installed: true,
      authenticated: true,
      authProvider: 'chatgpt',
      version: 'codex-cli 0.125.0'
    }),
    executor: async () => {
      attempts += 1;
      if (attempts === 1) {
        const err = new Error('connection reset by peer');
        err.code = 'ECONNRESET';
        err.stdout = '';
        err.stderr = 'connection reset by peer';
        throw err;
      }
      return {
        stdout: [
          '{"type":"thread.started","thread_id":"thread-retry"}',
          '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"status\\":\\"DONE\\",\\"summary\\":\\"ok\\",\\"files_changed\\":[],\\"tests\\":[],\\"concerns\\":[]}"}}'
        ].join('\n'),
        stderr: '',
        code: 0
      };
    },
    stateStore: { loadRequired: async () => null, save: async () => {} }
  });

  assert.equal(attempts, 2, 'should make exactly 2 attempts (1 retry)');
  assert.equal(output.sessionId, 'thread-retry');
});

test('runCodexWorkflow does not retry on non-transient error (auth, bad model, validation)', async () => {
  let attempts = 0;
  await assert.rejects(
    () =>
      runCodexWorkflow({
        mode: 'implement',
        cwd: '/repo',
        taskId: 'task-no-retry',
        schemaPath: '/repo/schemas/implementer-result.schema.json',
        promptFile: '/repo/skills/subagent-driven-development-codex/prompts/implement-task.md',
        runtimeDetector: async () => ({
          installed: true,
          authenticated: true,
          authProvider: 'chatgpt',
          version: 'codex-cli 0.125.0'
        }),
        executor: async () => {
          attempts += 1;
          const err = new Error('not authenticated');
          err.code = 1;
          err.stdout = '';
          err.stderr = 'not authenticated';
          throw err;
        },
        stateStore: { loadRequired: async () => null, save: async () => {} }
      }),
    /not authenticated/
  );

  assert.equal(attempts, 1, 'non-transient errors must not retry');
});

test('runCodexWorkflow retry policy is injectable for testing', async () => {
  let attempts = 0;
  await assert.rejects(
    () =>
      runCodexWorkflow({
        mode: 'implement',
        cwd: '/repo',
        taskId: 'task-custom-retry',
        schemaPath: '/repo/schemas/implementer-result.schema.json',
        promptFile: '/repo/skills/subagent-driven-development-codex/prompts/implement-task.md',
        // Force "no error is transient"
        isTransient: () => false,
        runtimeDetector: async () => ({
          installed: true,
          authenticated: true,
          authProvider: 'chatgpt',
          version: 'codex-cli 0.125.0'
        }),
        executor: async () => {
          attempts += 1;
          const err = new Error('something');
          err.code = 'ECONNRESET';
          throw err;
        },
        stateStore: { loadRequired: async () => null, save: async () => {} }
      })
  );

  assert.equal(attempts, 1, 'isTransient override must disable retries');
});

test('isTransientCodexError matches Node socket codes and known upstream patterns', async () => {
  const { isTransientCodexError } = await import('../../scripts/codex-run.mjs');

  // Node-side socket codes
  for (const code of ['ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'EAI_AGAIN']) {
    const err = new Error('socket');
    err.code = code;
    assert.equal(isTransientCodexError(err), true, `${code} must be transient`);
  }

  // Upstream output patterns
  for (const stderr of [
    '503 service unavailable',
    'service unavailable: try again later',
    'connection reset by peer',
    'connection aborted',
    'upstream timeout while reading response',
    'received 502 status from upstream'
  ]) {
    const err = new Error('upstream');
    err.stderr = stderr;
    assert.equal(isTransientCodexError(err), true, `pattern "${stderr}" must be transient`);
  }

  // Non-transient — must NOT retry
  for (const stderr of [
    'invalid_request_error: model not supported',
    'unauthorized: please run codex login',
    '400 bad request: malformed prompt',
    'implementer-result missing required field "summary"'
  ]) {
    const err = new Error('user-facing');
    err.code = 1;
    err.stderr = stderr;
    assert.equal(isTransientCodexError(err), false, `pattern "${stderr}" must NOT be transient`);
  }

  assert.equal(isTransientCodexError(null), false);
  assert.equal(isTransientCodexError(undefined), false);
});

test('loadRequiredTaskState explains how to recover from missing state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-codex-errors-'));

  await assert.rejects(
    () => loadRequiredTaskState(root, 'missing-task'),
    /No saved Codex session for taskId "missing-task"[\s\S]*--sessionId explicitly/
  );
});

test('runCodexWorkflow emits sanitized start and end invocation events', async () => {
  const events = [];

  await runCodexWorkflow({
    mode: 'implement',
    cwd: '/repo',
    taskId: 'task-events',
    model: 'auto',
    effort: 'auto',
    serviceTier: 'fast',
    schemaPath: '/repo/schemas/implementer-result.schema.json',
    promptFile: '/repo/skills/subagent-driven-development-codex/prompts/implement-task.md',
    taskText: 'secret task body',
    eventEmitter: { emit: async (event) => events.push(event) },
    runtimeDetector: async () => ({
      installed: true,
      authenticated: true,
      authProvider: 'chatgpt',
      version: 'codex-cli 0.125.0'
    }),
    executor: async () => ({
      stdout: [
        '{"type":"thread.started","thread_id":"thread-events"}',
        '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"status\\":\\"DONE\\",\\"summary\\":\\"ok\\",\\"files_changed\\":[],\\"tests\\":[],\\"concerns\\":[]}"}}'
      ].join('\n'),
      stderr: '',
      code: 0
    }),
    stateStore: { loadRequired: async () => null, save: async () => {} }
  });

  assert.deepEqual(events.map((event) => event.type), [
    'codex.invocation.start',
    'codex.invocation.end'
  ]);
  assert.equal(events[0].mode, 'implement');
  assert.equal(events[0].taskId, 'task-events');
  assert.equal('taskText' in events[0], false);
  assert.equal(events[1].sessionId, 'thread-events');
  assert.equal(events[1].status, 'ok');
  assert.equal(events[1].retried, false);
});

test('runCodexWorkflow end event records when a transient retry happened', async () => {
  const events = [];
  let attempts = 0;

  await runCodexWorkflow({
    mode: 'implement',
    cwd: '/repo',
    taskId: 'task-retried-event',
    schemaPath: '/repo/schemas/implementer-result.schema.json',
    eventEmitter: { emit: async (event) => events.push(event) },
    runtimeDetector: async () => ({
      installed: true,
      authenticated: true,
      authProvider: 'chatgpt',
      version: 'codex-cli 0.125.0'
    }),
    executor: async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error('connection reset by peer');
        error.code = 'ECONNRESET';
        error.stdout = '';
        error.stderr = 'connection reset by peer';
        throw error;
      }
      return {
        stdout: [
          '{"type":"thread.started","thread_id":"thread-retried"}',
          '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"status\\":\\"DONE\\",\\"summary\\":\\"ok\\",\\"files_changed\\":[],\\"tests\\":[],\\"concerns\\":[]}"}}'
        ].join('\n'),
        stderr: '',
        code: 0
      };
    },
    stateStore: { loadRequired: async () => null, save: async () => {} }
  });

  const end = events.find((event) => event.type === 'codex.invocation.end');
  assert.equal(end.retried, true);
});

test('runCodexWorkflow attaches salvaged session metadata before rethrowing', async () => {
  let caught;

  try {
    await runCodexWorkflow({
      mode: 'implement',
      cwd: '/repo',
      taskId: 'task-salvaged',
      schemaPath: '/repo/schemas/implementer-result.schema.json',
      runtimeDetector: async () => ({
        installed: true,
        authenticated: true,
        authProvider: 'chatgpt',
        version: 'codex-cli 0.125.0'
      }),
      executor: async () => {
        const error = new Error('timed out');
        error.code = 'ETIMEDOUT';
        error.stdout = [
          '{"type":"thread.started","thread_id":"thread-salvaged"}',
          '{"type":"turn.started"}'
        ].join('\n');
        error.stderr = 'deadline exceeded';
        throw error;
      },
      stateStore: { loadRequired: async () => null, save: async () => {} }
    });
  } catch (error) {
    caught = error;
  }

  assert.equal(caught.taskId, 'task-salvaged');
  assert.equal(caught.sessionId, 'thread-salvaged');
  assert.equal(caught.salvageReason, 'partial-jsonl-thread');
});

test('runCodexWorkflow emits an error event with salvaged session id on failure', async () => {
  const events = [];

  await assert.rejects(
    runCodexWorkflow({
      mode: 'implement',
      cwd: '/repo',
      taskId: 'task-error-event',
      schemaPath: '/repo/schemas/implementer-result.schema.json',
      eventEmitter: { emit: async (event) => events.push(event) },
      runtimeDetector: async () => ({
        installed: true,
        authenticated: true,
        authProvider: 'chatgpt',
        version: 'codex-cli 0.125.0'
      }),
      executor: async () => {
        const error = new Error('timed out');
        error.code = 'ETIMEDOUT';
        error.stdout = '{"type":"thread.started","thread_id":"thread-error-event"}';
        error.stderr = 'deadline exceeded';
        throw error;
      },
      stateStore: { loadRequired: async () => null, save: async () => {} }
    }),
    /timed out/
  );

  const errorEvent = events.find((event) => event.type === 'codex.invocation.error');
  assert.equal(errorEvent.mode, 'implement');
  assert.equal(errorEvent.taskId, 'task-error-event');
  assert.equal(errorEvent.transient, true);
  assert.equal(errorEvent.salvagedSessionId, 'thread-error-event');
});
