import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildInvocation } from '../../scripts/codex-run.mjs';
import { buildStructuredReviewPrompt } from '../../scripts/lib/review-scope.mjs';

const execFileAsync = promisify(execFile);

test('buildInvocation rejects multiple review selectors at once', () => {
  assert.throws(
    () =>
      buildInvocation({
        mode: 'review',
        cwd: '/repo',
        taskId: 'review-conflict',
        base: 'origin/main',
        uncommitted: true
      }),
    /Choose exactly one review selector/
  );
});

test('buildInvocation supports advisory review of uncommitted changes', () => {
  const invocation = buildInvocation({
    mode: 'review',
    cwd: '/repo',
    taskId: 'review-uncommitted',
    uncommitted: true
  });

  assert.deepEqual(invocation.command, ['codex', 'review', '--uncommitted']);
});

test('buildStructuredReviewPrompt includes the actual patch for commit review', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-codex-review-'));
  await execFileAsync('git', ['init', '-q'], { cwd: root });
  await execFileAsync('git', ['config', 'user.email', 'plan@example.com'], { cwd: root });
  await execFileAsync('git', ['config', 'user.name', 'Plan Writer'], { cwd: root });
  await writeFile(join(root, 'note.txt'), 'before\n', 'utf8');
  await execFileAsync('git', ['add', 'note.txt'], { cwd: root });
  await execFileAsync('git', ['commit', '-m', 'init', '-q'], { cwd: root });
  await writeFile(join(root, 'note.txt'), 'after\n', 'utf8');
  await execFileAsync('git', ['commit', '-am', 'update', '-q'], { cwd: root });
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root });

  const prompt = await buildStructuredReviewPrompt({
    cwd: root,
    promptBody: '# Review Brief',
    commit: stdout.trim()
  });

  assert.match(prompt, /diff --git a\/note\.txt b\/note\.txt/);
  assert.match(prompt, /-before/);
  assert.match(prompt, /\+after/);
});
