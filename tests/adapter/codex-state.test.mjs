import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTaskState, saveTaskState, listTaskStates } from '../../scripts/lib/codex-state.mjs';

test('saveTaskState round-trips task metadata under .claude/state/codex', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-codex-'));
  await saveTaskState(root, 'task-3', {
    taskId: 'task-3',
    role: 'implementer',
    phase: 'implement',
    cwd: '/repo',
    sessionId: '019d4f82-58b8-72d3-9212-2e3d3fc69bcb'
  });

  const loaded = await loadTaskState(root, 'task-3');
  assert.equal(loaded.phase, 'implement');
  assert.equal(loaded.sessionId, '019d4f82-58b8-72d3-9212-2e3d3fc69bcb');
});

test('saveTaskState writes atomically via temp file + rename', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-codex-atomic-'));
  const renameCalls = [];
  const writeCalls = [];

  const fs = {
    mkdir: (await import('node:fs/promises')).mkdir,
    writeFile: async (target, data, encoding) => {
      writeCalls.push(target);
      return writeFile(target, data, encoding);
    },
    rename: async (from, to) => {
      renameCalls.push({ from, to });
      return (await import('node:fs/promises')).rename(from, to);
    }
  };

  await saveTaskState(
    root,
    'task-atomic',
    { taskId: 'task-atomic', phase: 'implement' },
    { fs }
  );

  assert.equal(renameCalls.length, 1, 'expected exactly one rename call');
  assert.ok(
    writeCalls[0] !== renameCalls[0].to,
    'writeFile should target a temp path, not the final file'
  );
  assert.ok(
    renameCalls[0].to.endsWith('task-atomic.json'),
    'rename must land on the canonical task file'
  );

  // No temp files should remain after a successful save.
  const entries = await readdir(join(root, '.claude', 'state', 'codex'));
  assert.ok(
    entries.every((name) => !name.endsWith('.tmp')),
    `expected no .tmp files, found: ${entries.join(', ')}`
  );

  // Content round-trips correctly.
  const loaded = await loadTaskState(root, 'task-atomic');
  assert.equal(loaded.phase, 'implement');
});

test('saveTaskState preserves prior content if the write fails mid-save', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-codex-crash-'));

  await saveTaskState(root, 'task-crash', { taskId: 'task-crash', phase: 'original' });

  const failingFs = {
    mkdir: (await import('node:fs/promises')).mkdir,
    writeFile: async () => {
      throw new Error('simulated disk failure');
    },
    rename: (await import('node:fs/promises')).rename
  };

  await assert.rejects(
    saveTaskState(
      root,
      'task-crash',
      { taskId: 'task-crash', phase: 'updated' },
      { fs: failingFs }
    ),
    /simulated disk failure/
  );

  const loaded = await loadTaskState(root, 'task-crash');
  assert.equal(loaded.phase, 'original', 'original state must survive a failed write');
});

test('listTaskStates skips malformed state files instead of crashing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-codex-malformed-'));
  const stateDir = join(root, '.claude', 'state', 'codex');

  await saveTaskState(root, 'good-task', { taskId: 'good-task', phase: 'implement' });
  await writeFile(join(stateDir, 'corrupt-task.json'), '{ invalid json !!!', 'utf8');

  const states = await listTaskStates(root);
  assert.equal(states.length, 1, 'should return only the valid state');
  assert.equal(states[0].taskId, 'good-task');
});

test('implementer schema requires the full controller contract', async () => {
  const schema = JSON.parse(
    await readFile(new URL('../../schemas/implementer-result.schema.json', import.meta.url), 'utf8')
  );

  assert.deepEqual(schema.required, ['status', 'summary', 'files_changed', 'tests', 'concerns']);
  assert.deepEqual(schema.properties.status.enum, [
    'DONE',
    'DONE_WITH_CONCERNS',
    'BLOCKED',
    'NEEDS_CONTEXT'
  ]);
});
