import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { saveTaskState, listTaskStates } from '../../scripts/lib/codex-state.mjs';

const execFileAsync = promisify(execFile);

test('listTaskStates returns saved sessions sorted by task id', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-codex-state-'));
  await saveTaskState(root, 'task-b', { taskId: 'task-b', phase: 'implement', role: 'implement', cwd: '/repo', sessionId: 'session-b' });
  await saveTaskState(root, 'task-a', { taskId: 'task-a', phase: 'review', role: 'review', cwd: '/repo', sessionId: 'session-a' });

  const states = await listTaskStates(root);
  assert.deepEqual(states.map((state) => state.taskId), ['task-a', 'task-b']);
});

test('list-codex-state cli prints the saved task metadata as json', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-codex-state-cli-'));
  await saveTaskState(root, 'task-1', { taskId: 'task-1', phase: 'implement', role: 'implement', cwd: '/repo', sessionId: 'session-1' });

  const scriptPath = new URL('../../scripts/list-codex-state.mjs', import.meta.url);
  const { stdout } = await execFileAsync(process.execPath, [scriptPath.pathname, '--cwd', root]);
  const parsed = JSON.parse(stdout);

  assert.equal(parsed.tasks[0].taskId, 'task-1');
});
