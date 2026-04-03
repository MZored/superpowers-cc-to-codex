import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
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

export async function loadOptionalTaskState(workspaceRoot, taskId) {
  try {
    const raw = await readFile(stateFile(workspaceRoot, taskId), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

export async function loadRequiredTaskState(workspaceRoot, taskId) {
  const state = await loadOptionalTaskState(workspaceRoot, taskId);

  if (state === null) {
    throw new Error(
      `No saved Codex session for taskId "${taskId}". ` +
        `To resume without prior state, pass --sessionId explicitly.`
    );
  }

  return state;
}

export async function listTaskStates(workspaceRoot) {
  const dir = stateDir(workspaceRoot);
  await mkdir(dir, { recursive: true });
  const entries = await readdir(dir);
  const jsonFiles = entries.filter((name) => name.endsWith('.json')).sort();
  const states = await Promise.all(
    jsonFiles.map((name) => {
      const taskId = name.slice(0, -5);
      return loadRequiredTaskState(workspaceRoot, taskId);
    })
  );
  return states.sort((a, b) => a.taskId.localeCompare(b.taskId));
}

// Backward-compatible alias for loadRequiredTaskState.
export const loadTaskState = loadRequiredTaskState;
