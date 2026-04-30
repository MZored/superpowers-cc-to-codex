import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTaskRegistry } from '../../scripts/lib/mcp-task-registry.mjs';

test('task registry saves and retrieves task records from plugin data', async () => {
  const pluginData = await mkdtemp(join(tmpdir(), 'sp-codex-plugin-data-'));
  const registry = createTaskRegistry({ env: { CLAUDE_PLUGIN_DATA: pluginData } });

  await registry.save({
    taskId: 'task-1',
    status: 'working',
    createdAt: '2026-04-09T00:00:00.000Z',
    lastUpdatedAt: '2026-04-09T00:01:00.000Z',
    ttl: 3600,
    toolName: 'codex_implement',
    workspaceRoot: '/repo',
    result: { status: 'DONE', summary: 'ok' }
  });

  const record = await registry.get('task-1');

  assert.equal(record.taskId, 'task-1');
  assert.equal(record.toolName, 'codex_implement');
  assert.equal(record.status, 'working');
  assert.equal(record.ttl, 3600);
});

test('task registry save throws when plugin data is unavailable', async () => {
  const registry = createTaskRegistry({ env: {} });

  await assert.rejects(
    registry.save({
      taskId: 'task-1',
      status: 'working',
      createdAt: '2026-04-09T00:00:00.000Z',
      lastUpdatedAt: '2026-04-09T00:01:00.000Z',
      ttl: 3600,
      toolName: 'codex_implement',
      workspaceRoot: '/repo',
      result: null
    }),
    /CLAUDE_PLUGIN_DATA is required when task mode is enabled\./
  );
});

test('task registry rejects unsafe task ids that could escape the registry directory', async () => {
  const pluginData = await mkdtemp(join(tmpdir(), 'sp-codex-plugin-data-'));
  const registry = createTaskRegistry({ env: { CLAUDE_PLUGIN_DATA: pluginData } });

  for (const taskId of ['../outside', '/abs/path', 'task/1', 'task\\1', 'foo/bar', '../etc', '/abs']) {
    await assert.rejects(
      registry.save({
        taskId,
        status: 'working',
        createdAt: '2026-04-09T00:00:00.000Z',
        lastUpdatedAt: '2026-04-09T00:01:00.000Z',
        ttl: 3600,
        toolName: 'codex_implement',
        workspaceRoot: '/repo',
        result: null
      }),
      (error) => {
        assert.match(error.message, /^unsafe taskId: /);
        assert.ok(
          !/"/.test(error.message),
          `error message should match the unified codex-state format without quotes, got: ${error.message}`
        );
        return true;
      }
    );

    await assert.rejects(registry.get(taskId), /unsafe taskId: /);
  }
});

test('task registry accepts safe task ids that include allowed punctuation', async () => {
  const pluginData = await mkdtemp(join(tmpdir(), 'sp-codex-plugin-data-'));
  const registry = createTaskRegistry({ env: { CLAUDE_PLUGIN_DATA: pluginData } });

  await registry.save({
    taskId: 'good-name.1',
    status: 'working',
    createdAt: '2026-04-09T00:00:00.000Z',
    lastUpdatedAt: '2026-04-09T00:01:00.000Z',
    ttl: 3600,
    toolName: 'codex_implement',
    workspaceRoot: '/repo',
    result: null
  });

  const record = await registry.get('good-name.1');
  assert.equal(record.taskId, 'good-name.1');
});

test('task registry list returns records sorted by task id', async () => {
  const pluginData = await mkdtemp(join(tmpdir(), 'sp-codex-plugin-data-'));
  const registry = createTaskRegistry({ env: { CLAUDE_PLUGIN_DATA: pluginData } });

  await registry.save({
    taskId: 'task-2',
    status: 'working',
    createdAt: '2026-04-09T00:00:00.000Z',
    lastUpdatedAt: '2026-04-09T00:01:00.000Z',
    ttl: 3600,
    toolName: 'codex_implement',
    workspaceRoot: '/repo',
    result: null
  });
  await registry.save({
    taskId: 'task-1',
    status: 'done',
    createdAt: '2026-04-09T00:00:00.000Z',
    lastUpdatedAt: '2026-04-09T00:01:00.000Z',
    ttl: 3600,
    toolName: 'codex_review',
    workspaceRoot: '/repo',
    result: { status: 'DONE' }
  });

  const records = await registry.list();

  assert.deepEqual(
    records.map((record) => record.taskId),
    ['task-1', 'task-2']
  );
});

test('task registry list skips malformed records instead of crashing', async () => {
  const pluginData = await mkdtemp(join(tmpdir(), 'sp-codex-plugin-data-'));
  const registry = createTaskRegistry({ env: { CLAUDE_PLUGIN_DATA: pluginData } });

  await registry.save({
    taskId: 'task-good',
    status: 'working',
    createdAt: '2026-04-09T00:00:00.000Z',
    lastUpdatedAt: '2026-04-09T00:01:00.000Z',
    ttl: 3600,
    toolName: 'codex_implement',
    workspaceRoot: '/repo',
    result: null
  });

  await writeFile(
    join(pluginData, 'mcp-tasks', 'task-bad.json'),
    '{ invalid json !!!',
    'utf8'
  );

  const records = await registry.list();

  assert.deepEqual(records.map((record) => record.taskId), ['task-good']);
});
