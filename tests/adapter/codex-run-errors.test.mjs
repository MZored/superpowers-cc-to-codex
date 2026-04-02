import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildInvocation } from '../../scripts/codex-run.mjs';
import { loadRequiredTaskState } from '../../scripts/lib/codex-state.mjs';

test('buildInvocation rejects unsupported modes', () => {
  assert.throws(
    () => buildInvocation({ mode: 'invalid', cwd: '/repo', taskId: 'task-invalid' }),
    /Unsupported mode: invalid/
  );
});

test('loadRequiredTaskState explains how to recover from missing state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-codex-errors-'));

  await assert.rejects(
    () => loadRequiredTaskState(root, 'missing-task'),
    /No saved Codex session for taskId "missing-task"[\s\S]*--sessionId explicitly/
  );
});
