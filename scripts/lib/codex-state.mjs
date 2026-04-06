import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const defaultFs = { mkdir, writeFile, rename };

function stateDir(workspaceRoot) {
  return join(workspaceRoot, '.claude', 'state', 'codex');
}

function stateFile(workspaceRoot, taskId) {
  return join(stateDir(workspaceRoot), `${taskId}.json`);
}

/**
 * Persist task state atomically.
 *
 * Writes to `<taskId>.json.tmp` then renames onto the final path. `rename` is
 * atomic on POSIX, so readers see either the prior version or the new one —
 * never a truncated/partial write. An `fs` override is accepted for testability.
 */
export async function saveTaskState(workspaceRoot, taskId, state, { fs = defaultFs } = {}) {
  await fs.mkdir(stateDir(workspaceRoot), { recursive: true });
  const target = stateFile(workspaceRoot, taskId);
  const tempPath = `${target}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(state, null, 2) + '\n', 'utf8');
  await fs.rename(tempPath, target);
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
  const results = await Promise.allSettled(
    jsonFiles.map((name) => {
      const taskId = name.slice(0, -5);
      return loadRequiredTaskState(workspaceRoot, taskId);
    })
  );
  return results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value)
    .sort((a, b) => a.taskId.localeCompare(b.taskId));
}

// Backward-compatible alias for loadRequiredTaskState.
export const loadTaskState = loadRequiredTaskState;
