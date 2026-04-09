import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CallToolResultSchema,
  CancelTaskResultSchema,
  CreateTaskResultSchema,
  GetTaskResultSchema,
  ListTasksResultSchema
} from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from '../../scripts/mcp-server.mjs';

function createInMemoryTaskRegistry() {
  const records = new Map();

  return {
    async save(record) {
      const copy = JSON.parse(JSON.stringify(record));
      records.set(copy.taskId, copy);
      return copy;
    },
    async get(taskId) {
      return records.has(taskId) ? JSON.parse(JSON.stringify(records.get(taskId))) : null;
    },
    async list() {
      return [...records.values()]
        .sort((left, right) => left.taskId.localeCompare(right.taskId))
        .map((record) => JSON.parse(JSON.stringify(record)));
    }
  };
}

function getHandlers(server) {
  return server._requestHandlers ?? server.requestHandlers;
}

function makeJsonl({ threadId, resultObject }) {
  return [
    JSON.stringify({ type: 'thread.started', thread_id: threadId }),
    JSON.stringify({
      type: 'item.completed',
      item: {
        type: 'agent_message',
        text: JSON.stringify(resultObject)
      }
    }),
    JSON.stringify({ type: 'turn.completed' })
  ].join('\n');
}

async function waitFor(fn, { attempts = 25, delayMs = 0 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await fn();
    if (value) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error('Timed out waiting for condition');
}

test('task mode advertises tasks capability and optional execution metadata for implement/resume tools', async () => {
  const server = await createMcpServer({
    featureFlags: { taskMode: 'implement-resume' },
    taskRegistry: createInMemoryTaskRegistry(),
    runWorkflow: async () => ({
      stdout: '{"type":"thread.started","thread_id":"thread-1"}',
      stderr: ''
    })
  });

  assert.ok(server._capabilities?.tasks, 'tasks capability should be advertised');
  assert.ok(server._capabilities.tasks.list, 'tasks list capability should be present');
  assert.ok(server._capabilities.tasks.cancel, 'tasks cancel capability should be present');
  assert.ok(server._capabilities.tasks.requests?.tools?.call, 'tasks tools/call capability should be present');

  const handlers = getHandlers(server);
  const toolsList = await handlers.get('tools/list')({ method: 'tools/list', params: {} }, {});
  const implementTool = toolsList.tools.find((tool) => tool.name === 'codex_implement');
  const resumeTool = toolsList.tools.find((tool) => tool.name === 'codex_resume');
  const planTool = toolsList.tools.find((tool) => tool.name === 'codex_plan');

  assert.equal(implementTool.execution?.taskSupport, 'optional');
  assert.equal(resumeTool.execution?.taskSupport, 'optional');
  assert.equal(planTool.execution, undefined);
});

test('task-augmented codex_implement returns CreateTaskResult and later exposes the saved CallToolResult', async () => {
  const taskRegistry = createInMemoryTaskRegistry();
  const server = await createMcpServer({
    featureFlags: { taskMode: 'implement-resume' },
    taskRegistry,
    runWorkflow: async () => ({
      stdout: makeJsonl({
        threadId: 'thread-task',
        resultObject: { status: 'DONE', summary: 'implemented' }
      }),
      stderr: ''
    })
  });

  const handlers = getHandlers(server);

  const createTaskResult = CreateTaskResultSchema.parse(
    await handlers.get('tools/call')(
      {
        method: 'tools/call',
        params: {
          name: 'codex_implement',
          arguments: {
            taskId: 'task-5',
            prompt: 'Implement task mode.',
            workspaceRoot: '/repo'
          },
          task: {
            ttl: 90_000
          }
        }
      },
      { requestId: 'request-1' }
    )
  );

  assert.equal(createTaskResult.task.status, 'working');
  assert.equal(createTaskResult.task.pollInterval, 1000);
  assert.equal(createTaskResult.task.ttl, 90_000);

  const { taskId } = createTaskResult.task;

  await waitFor(async () => {
    const record = await taskRegistry.get(taskId);
    return record?.status === 'completed' ? record : null;
  });

  const listTasksResult = ListTasksResultSchema.parse(
    await handlers.get('tasks/list')({ method: 'tasks/list', params: {} }, {})
  );
  assert.deepEqual(listTasksResult.tasks.map((task) => task.taskId), [taskId]);
  assert.equal(listTasksResult.tasks[0].status, 'completed');

  const taskPayloadResult = CallToolResultSchema.parse(
    await handlers.get('tasks/result')(
      { method: 'tasks/result', params: { taskId } },
      {}
    )
  );

  assert.equal(taskPayloadResult.isError, false);
  assert.equal(taskPayloadResult.structuredContent.sessionId, 'thread-task');
  assert.deepEqual(taskPayloadResult.structuredContent.result, {
    status: 'DONE',
    summary: 'implemented'
  });
});

test('task mode exposes tasks/get and tasks/cancel for running implement tasks', async () => {
  const taskRegistry = createInMemoryTaskRegistry();
  const server = await createMcpServer({
    featureFlags: { taskMode: 'implement-resume' },
    taskRegistry,
    runWorkflow: async ({ onSpawn, signal }) => {
      onSpawn({
        terminate() {}
      });

      await new Promise((resolve) => {
        if (signal.aborted) {
          resolve();
          return;
        }

        signal.addEventListener('abort', resolve, { once: true });
      });

      throw new Error('cancelled');
    }
  });

  const handlers = getHandlers(server);
  const created = CreateTaskResultSchema.parse(
    await handlers.get('tools/call')(
      {
        method: 'tools/call',
        params: {
          name: 'codex_implement',
          arguments: {
            taskId: 'task-cancel',
            prompt: 'Cancel task mode.',
            workspaceRoot: '/repo'
          },
          task: {
            ttl: 60_000
          }
        }
      },
      { requestId: 'request-cancel' }
    )
  );

  const { taskId } = created.task;

  const taskState = GetTaskResultSchema.parse(
    await handlers.get('tasks/get')({ method: 'tasks/get', params: { taskId } }, {})
  );
  assert.equal(taskState.status, 'working');

  const cancelled = CancelTaskResultSchema.parse(
    await handlers.get('tasks/cancel')({ method: 'tasks/cancel', params: { taskId } }, {})
  );
  assert.equal(cancelled.status, 'cancelled');

  await waitFor(async () => {
    const record = await taskRegistry.get(taskId);
    return record?.status === 'cancelled' ? record : null;
  });

  const listTasksResult = ListTasksResultSchema.parse(
    await handlers.get('tasks/list')({ method: 'tasks/list', params: {} }, {})
  );
  assert.equal(listTasksResult.tasks[0].taskId, taskId);
  assert.equal(listTasksResult.tasks[0].status, 'cancelled');
});
