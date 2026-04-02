import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTaskState, saveTaskState } from '../../scripts/lib/codex-state.mjs';

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
