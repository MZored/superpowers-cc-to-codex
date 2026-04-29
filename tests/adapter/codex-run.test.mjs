import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { buildInvocation, extractThreadId, composePromptText, buildPrompt, runCodexWorkflow } from '../../scripts/codex-run.mjs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    promptFile: 'skills/subagent-driven-development-codex/prompts/implement-task.md'
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
    promptFile: 'skills/subagent-driven-development-codex/prompts/fix-task.md'
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

test('auto model delegates model choice to Codex CLI defaults', () => {
  const invocation = buildInvocation({
    mode: 'implement',
    cwd: '/repo',
    taskId: 'task-auto-model',
    model: 'auto',
    effort: 'medium',
    schemaPath: 'schemas/implementer-result.schema.json',
    promptFile: 'skills/subagent-driven-development-codex/prompts/implement-task.md'
  });

  assert.equal(invocation.command.includes('-m'), false);
  assert.equal(invocation.command.includes('auto'), false);
});

test('runCodexWorkflow rejects unsafe taskId before executor runs', async () => {
  let executed = false;

  await assert.rejects(
    runCodexWorkflow({
      mode: 'implement',
      cwd: '/repo',
      taskId: 'feature/one',
      taskText: 'must not run',
      runtimeDetector: async () => ({
        installed: true,
        authenticated: true,
        authProvider: 'chatgpt',
        version: 'codex-cli 0.125.0'
      }),
      executor: async () => {
        executed = true;
        return {
          stdout: '{"type":"thread.started","thread_id":"thread-unsafe"}',
          stderr: '',
          code: 0
        };
      },
      stateStore: {
        loadRequired: async () => null,
        save: async () => {
          throw new Error('unsafe taskId: feature/one');
        }
      }
    }),
    /unsafe taskId/i
  );

  assert.equal(executed, false, 'unsafe taskId must fail before Codex execution');
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

test('composePromptText merges template and task text with the task marker', () => {
  assert.equal(composePromptText(undefined, undefined), undefined);
  assert.equal(composePromptText(undefined, 'Build the auth endpoint.'), 'Build the auth endpoint.');
  assert.equal(composePromptText('# Template', undefined), '# Template');
  assert.equal(
    composePromptText('# Template', 'Build the auth endpoint.'),
    '# Template\n\n## Your Task\n\nBuild the auth endpoint.'
  );
});

test('buildPrompt includes task text for uncommitted advisory review', async () => {
  const prompt = await buildPrompt({
    mode: 'review',
    cwd: process.cwd(),
    uncommitted: true,
    promptFile: new URL('../fixtures/codex/implement-prompt.md', import.meta.url).pathname,
    taskText: 'Focus on cancellation handling.'
  });

  assert.match(prompt, /Focus on cancellation handling\./);
});

test('buildPrompt appends task text before structured review scope', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-forwarding-review-'));
  await execFileAsync('git', ['init', '-q'], { cwd: root });
  await execFileAsync('git', ['config', 'user.email', 'plan@example.com'], { cwd: root });
  await execFileAsync('git', ['config', 'user.name', 'Plan Writer'], { cwd: root });
  await writeFile(join(root, 'note.txt'), 'before\n', 'utf8');
  await execFileAsync('git', ['add', 'note.txt'], { cwd: root });
  await execFileAsync('git', ['commit', '-m', 'init', '-q'], { cwd: root });
  await writeFile(join(root, 'note.txt'), 'after\n', 'utf8');

  const prompt = await buildPrompt({
    mode: 'review',
    cwd: root,
    base: 'HEAD',
    promptFile: new URL('../fixtures/codex/implement-prompt.md', import.meta.url).pathname,
    taskText: 'Review only the forwarding rewrite.'
  });

  assert.match(prompt, /## Your Task\n\nReview only the forwarding rewrite\./);
  assert.match(prompt, /## Diff Scope/);
});

test('runCodexWorkflow returns parsed output and persists thread state', async () => {
  const saves = [];

  const output = await runCodexWorkflow({
    mode: 'implement',
    cwd: '/repo',
    taskId: 'task-17',
    model: 'gpt-5.4',
    effort: 'medium',
    schemaPath: '/repo/schemas/implementer-result.schema.json',
    promptFile: '/repo/tests/fixtures/codex/implement-prompt.md',
    taskText: 'Implement the MCP server.',
    runtimeDetector: async () => ({
      installed: true,
      authenticated: true,
      authProvider: 'chatgpt',
      version: 'codex-cli 0.111.0'
    }),
    executor: async () => ({
      stdout: [
        '{"type":"thread.started","thread_id":"thread-123"}',
        '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"status\\":\\"DONE\\"}"}}'
      ].join('\n'),
      stderr: '',
      code: 0
    }),
    stateStore: {
      loadRequired: async () => null,
      save: async (cwd, taskId, state) => saves.push({ cwd, taskId, state })
    }
  });

  assert.equal(output.sessionId, 'thread-123');
  assert.deepEqual(output.result, { status: 'DONE' });
  assert.equal(saves[0].taskId, 'task-17');
  assert.equal(saves[0].state.sessionId, 'thread-123');
});

test('runCodexWorkflow preserves plain advisory review output as assistant text', async () => {
  const output = await runCodexWorkflow({
    mode: 'review',
    cwd: '/repo',
    taskId: 'task-review',
    uncommitted: true,
    taskText: 'Review cancellation.',
    runtimeDetector: async () => ({
      installed: true,
      authenticated: true,
      authProvider: 'chatgpt',
      version: 'codex-cli 0.125.0'
    }),
    executor: async () => ({
      stdout: 'Finding: fix cancellation handling\n',
      stderr: '',
      code: 0
    }),
    stateStore: {
      loadRequired: async () => null,
      save: async () => {}
    }
  });

  assert.equal(output.assistantText, 'Finding: fix cancellation handling');
  assert.equal(output.result, null);
});

test('runCodexWorkflow forwards signal and onSpawn to the executor as execution options', async () => {
  let capturedOptions;
  const controller = new AbortController();
  const onSpawn = (child) => child;

  await runCodexWorkflow({
    mode: 'implement',
    cwd: '/repo',
    taskId: 'task-sig',
    taskText: 'test signal forwarding',
    signal: controller.signal,
    onSpawn,
    runtimeDetector: async () => ({
      installed: true,
      authenticated: true,
      authProvider: 'chatgpt',
      version: 'codex-cli 0.111.0'
    }),
    executor: async (invocation, options) => {
      capturedOptions = options;
      return { stdout: '', stderr: '', code: 0 };
    },
    stateStore: {
      loadRequired: async () => null,
      save: async () => {}
    }
  });

  assert.equal(capturedOptions.signal, controller.signal);
  assert.equal(capturedOptions.onSpawn, onSpawn);
});

test('dry-run CLI preserves positional task text on the invocation object', async () => {
  const scriptPath = new URL('../../scripts/codex-run.mjs', import.meta.url);
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      scriptPath.pathname,
      'implement',
      'Build the auth endpoint.',
      '--cwd',
      process.cwd(),
      '--taskId',
      'task-17',
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
    { cwd: process.cwd() }
  );

  const parsed = JSON.parse(stdout);
  assert.equal(parsed.taskText, 'Build the auth endpoint.');
});
