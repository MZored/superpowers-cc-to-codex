import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskModeController } from '../../scripts/lib/mcp-task-mode.mjs';

function makeRegistry() {
  const store = new Map();
  return {
    store,
    saves: [],
    save(record) {
      this.saves.push(record.status);
      store.set(record.taskId, { ...record });
      return Promise.resolve();
    },
    get(id) {
      return Promise.resolve(store.get(id) ?? null);
    },
    list() {
      return Promise.resolve([...store.values()]);
    }
  };
}

async function flushMicrotasks(times = 5) {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

const taskRequest = {
  params: { name: 'codex_implement', task: {}, arguments: { taskId: 'demo' } }
};

test('cancellation arriving between completion check and save does not produce a "completed" record', async () => {
  // The IIFE inside createTask flows: read latest → check running.cancelled →
  // build updated record → save. If cancellation arrives between the check
  // and the save, the IIFE must NOT persist a "completed" status that
  // overwrites the user's cancellation. The fix is to recheck immediately
  // before the save call.
  const registry = makeRegistry();

  let resolveExecute;
  const executeTool = (_request, extra) => {
    extra.exposeCancel(() => {});
    return new Promise((resolve) => {
      resolveExecute = resolve;
    });
  };

  // Wrap save so we can intercept the moment the IIFE attempts to persist
  // the "completed" status. While the save is in flight, we mark the task
  // cancelled — simulating the user cancellation racing with completion.
  const ctrl = createTaskModeController({
    featureFlags: { taskMode: 'implement-resume' },
    taskRegistry: {
      ...registry,
      async save(record) {
        registry.saves.push(record.status);
        if (record.status === 'completed') {
          // simulate cancellation landing while completion save is pending
          await flushMicrotasks(1);
          await ctrl.cancelTask(record.taskId);
        }
        registry.store.set(record.taskId, { ...record });
      },
      get: registry.get.bind(registry),
      list: registry.list.bind(registry)
    },
    server: null,
    executeTool
  });

  const { task } = await ctrl.createTask(taskRequest);
  resolveExecute({ isError: false, content: [{ type: 'text', text: 'done' }] });

  // give the IIFE time to attempt completion save and the racing cancel to land
  await flushMicrotasks(20);

  const final = registry.store.get(task.taskId);
  assert.equal(
    final.status,
    'cancelled',
    `cancel must take precedence over completion; saves attempted: ${registry.saves.join(',')}`
  );
});

test('nested taskRegistry.save failure inside the IIFE catch does not leak as unhandled rejection', async () => {
  // If executeTool throws AND the subsequent failure-save also throws,
  // the IIFE must swallow the inner failure rather than letting an
  // unhandled rejection escape (and crash the server in strict mode).
  const registry = makeRegistry();
  let unhandled;
  const onUnhandled = (reason) => {
    unhandled = reason;
  };
  process.once('unhandledRejection', onUnhandled);

  let saveCallCount = 0;
  const ctrl = createTaskModeController({
    featureFlags: { taskMode: 'implement-resume' },
    taskRegistry: {
      async save(record) {
        saveCallCount += 1;
        // First save (initial 'working' from createTask) succeeds.
        if (saveCallCount === 1) {
          registry.store.set(record.taskId, record);
          return;
        }
        // Subsequent save (the catch-block 'failed' save) throws.
        throw new Error('disk full');
      },
      get: registry.get.bind(registry),
      list: registry.list.bind(registry)
    },
    server: null,
    executeTool: () => {
      throw new Error('codex crashed');
    }
  });

  await ctrl.createTask(taskRequest);
  await flushMicrotasks(20);
  process.removeListener('unhandledRejection', onUnhandled);

  assert.equal(unhandled, undefined, `expected no unhandled rejection, got: ${unhandled?.message ?? unhandled}`);
});
