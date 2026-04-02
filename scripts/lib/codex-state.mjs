import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

function stateDir(workspaceRoot) {
  return join(workspaceRoot, '.claude', 'state', 'codex');
}

function stateFile(workspaceRoot, taskId) {
  return join(stateDir(workspaceRoot), `${taskId}.json`);
}

export async function saveTaskState(workspaceRoot, taskId, state) {
  await mkdir(stateDir(workspaceRoot), { recursive: true });
  await writeFile(stateFile(workspaceRoot, taskId), JSON.stringify(state, null, 2) + '\n', 'utf8');
}

export async function loadTaskState(workspaceRoot, taskId) {
  const raw = await readFile(stateFile(workspaceRoot, taskId), 'utf8');
  return JSON.parse(raw);
}
