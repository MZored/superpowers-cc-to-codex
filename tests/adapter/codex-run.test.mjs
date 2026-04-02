import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { buildInvocation, extractThreadId } from '../../scripts/codex-run.mjs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('implement runs use codex exec with workspace-write and an output schema', () => {
  const invocation = buildInvocation({
    mode: 'implement',
    cwd: '/repo',
    taskId: 'task-4',
    model: 'gpt-5.4',
    effort: 'medium',
    schemaPath: 'schemas/implementer-result.schema.json',
    promptFile: 'skills/subagent-driven-development/prompts/implement-task.md'
  });

  assert.deepEqual(invocation.command.slice(0, 4), ['codex', 'exec', '--json', '--sandbox']);
  assert.ok(invocation.command.includes('workspace-write'));
  assert.ok(invocation.command.includes('--output-schema'));
});

test('extractThreadId reads the thread.started event from jsonl output', () => {
  const threadId = extractThreadId(
    [
      '{"type":"thread.started","thread_id":"019d4f82-58b8-72d3-9212-2e3d3fc69bcb"}',
      '{"type":"turn.started"}'
    ].join('\n')
  );

  assert.equal(threadId, '019d4f82-58b8-72d3-9212-2e3d3fc69bcb');
});

test('structured review runs stay on codex exec so the controller can enforce a schema', () => {
  const invocation = buildInvocation({
    mode: 'review',
    cwd: '/repo',
    taskId: 'task-4-review',
    model: 'gpt-5.4',
    effort: 'medium',
    base: 'origin/main',
    schemaPath: 'schemas/code-review.schema.json',
    promptFile: 'tests/fixtures/codex/implement-prompt.md'
  });

  assert.deepEqual(invocation.command.slice(0, 2), ['codex', 'exec']);
  assert.ok(invocation.command.includes('--output-schema'));
  assert.equal(invocation.base, 'origin/main');
});

test('advisory review can target a specific commit on the top-level review command', () => {
  const invocation = buildInvocation({
    mode: 'review',
    cwd: '/repo',
    taskId: 'task-4-review-commit',
    commit: 'abc1234',
    model: 'gpt-5.4'
  });

  assert.deepEqual(invocation.command, ['codex', 'review', '--commit', 'abc1234']);
});

test('resume runs omit init-only flags that the live resume command does not support', () => {
  const invocation = buildInvocation({
    mode: 'resume',
    cwd: '/repo',
    taskId: 'task-4-resume',
    sessionId: '019d4f82-58b8-72d3-9212-2e3d3fc69bcb',
    model: 'gpt-5.4',
    effort: 'medium',
    promptFile: 'skills/subagent-driven-development/prompts/fix-task.md'
  });

  assert.deepEqual(invocation.command.slice(0, 4), [
    'codex',
    'exec',
    'resume',
    '019d4f82-58b8-72d3-9212-2e3d3fc69bcb'
  ]);
  assert.ok(invocation.command.includes('--json'));
  assert.ok(!invocation.command.includes('--sandbox'));
  assert.ok(!invocation.command.includes('-C'));
});

test('dry-run CLI emits one JSON document', async () => {
  const scriptPath = new URL('../../scripts/codex-run.mjs', import.meta.url);
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      scriptPath.pathname,
      'implement',
      '--cwd',
      process.cwd(),
      '--taskId',
      'task-4-dry-run',
      '--model',
      'gpt-5.4',
      '--effort',
      'medium',
      '--schema',
      'schemas/implementer-result.schema.json',
      '--promptFile',
      'tests/fixtures/codex/implement-prompt.md',
      '--dryRun'
    ],
    {
      cwd: process.cwd()
    }
  );

  const parsed = JSON.parse(stdout);
  assert.equal(parsed.mode, 'implement');
  assert.equal(parsed.command[0], 'codex');
});
