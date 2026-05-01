import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskModeController } from '../../scripts/lib/mcp-task-mode.mjs';

function makeRegistry({ saveImpl } = {}) {
  const store = new Map();
  return {
    store,
    async save(record) {
      if (saveImpl) {
        await saveImpl(record, store);
        return;
      }
      store.set(record.taskId, { ...record });
    },
    async get(id) {
      return store.get(id) ?? null;
    },
    async list() {
      return [...store.values()];
    }
  };
}

async function flushMicrotasks(times = 20) {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

const taskRequest = {
  params: { name: 'codex_implement', task: {}, arguments: { taskId: 'demo' } }
};

// Operator visibility: when the fire-and-forget IIFE swallows a registry
// failure, the operator currently has no way to learn the task ever ran into
// trouble. Surface the failure via the injected sendLog callback so it
// reaches the MCP client's logging stream and the optional event log file.

test('createTaskModeController surfaces IIFE error via sendLog when both executeTool and the failure-save throw', async () => {
  const logs = [];
  const sendLog = async (payload) => {
    logs.push(payload);
  };

  let saveCallCount = 0;
  const registry = makeRegistry({
    saveImpl: async (record, store) => {
      saveCallCount += 1;
      if (saveCallCount === 1) {
        // initial 'working' save — succeeds
        store.set(record.taskId, record);
        return;
      }
      // subsequent saves throw, simulating disk pressure during failure persist
      throw new Error('disk full');
    }
  });

  const ctrl = createTaskModeController({
    featureFlags: { taskMode: 'implement-resume' },
    taskRegistry: registry,
    server: null,
    executeTool: () => {
      throw new Error('codex crashed');
    },
    sendLog
  });

  await ctrl.createTask(taskRequest);
  await flushMicrotasks();

  // We expect at least one warning containing the original error and the
  // taskId so operators can correlate it with the working/cancelled record.
  const warnings = logs.filter((entry) => entry.level === 'warning' || entry.level === 'error');
  assert.ok(warnings.length >= 1, `expected at least one warning, got: ${JSON.stringify(logs)}`);
  const serialized = JSON.stringify(warnings);
  assert.match(serialized, /codex crashed/);
  // The IIFE generates a UUID taskId; assert it's threaded into the warning
  // so operators can correlate the log entry with the registry record.
  assert.ok(
    warnings.every((entry) => typeof entry.data?.taskId === 'string' && entry.data.taskId.length > 0),
    'every warning must include the generated taskId'
  );
});

test('createTaskModeController does not log a warning on clean completion', async () => {
  const logs = [];
  const sendLog = async (payload) => {
    logs.push(payload);
  };

  const ctrl = createTaskModeController({
    featureFlags: { taskMode: 'implement-resume' },
    taskRegistry: makeRegistry(),
    server: null,
    executeTool: async (_req, extra) => {
      extra.exposeCancel(() => {});
      return { isError: false, content: [{ type: 'text', text: 'ok' }] };
    },
    sendLog
  });

  await ctrl.createTask(taskRequest);
  await flushMicrotasks();

  const warnings = logs.filter((entry) => entry.level === 'warning' || entry.level === 'error');
  assert.equal(warnings.length, 0, `unexpected warnings: ${JSON.stringify(warnings)}`);
});
