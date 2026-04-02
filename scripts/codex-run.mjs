import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { promisify } from 'node:util';
import { detectCodexRuntime } from './detect-codex.mjs';
import { loadRequiredTaskState, saveTaskState } from './lib/codex-state.mjs';

const execFileAsync = promisify(execFile);

const SUPPORTED_MODES = new Set(['research', 'plan', 'implement', 'review', 'resume']);

const SANDBOX_BY_MODE = {
  research: 'read-only',
  plan: 'read-only',
  implement: 'workspace-write',
  review: 'read-only',
  resume: 'workspace-write'
};

function assertSupportedMode(mode) {
  if (!SUPPORTED_MODES.has(mode)) {
    throw new Error(`Unsupported mode: ${mode}`);
  }
}

function normalizeServiceTier(requestedServiceTier, authProvider) {
  if (requestedServiceTier !== 'fast') {
    return requestedServiceTier ?? null;
  }

  return authProvider === 'chatgpt' ? 'fast' : null;
}

function buildCommonOptions({ model, effort, serviceTier, authProvider }) {
  const options = [];

  if (model) {
    options.push('-m', model);
  }

  if (effort) {
    options.push('-c', `model_reasoning_effort="${effort}"`);
  }

  const effectiveServiceTier = normalizeServiceTier(serviceTier, authProvider);
  if (effectiveServiceTier) {
    options.push('-c', `service_tier="${effectiveServiceTier}"`);
  }

  return {
    options,
    effectiveServiceTier
  };
}

export function buildInvocation({
  mode,
  cwd,
  taskId,
  model,
  effort,
  serviceTier,
  authProvider,
  schemaPath,
  promptFile,
  base,
  commit,
  sessionId,
  dryRun = false
}) {
  assertSupportedMode(mode);

  const { options: commonOptions, effectiveServiceTier } = buildCommonOptions({
    model,
    effort,
    serviceTier,
    authProvider
  });

  if (mode === 'review' && !schemaPath && (base || commit)) {
    return {
      command: commit ? ['codex', 'review', '--commit', commit] : ['codex', 'review', '--base', base],
      cwd,
      dryRun,
      mode,
      promptFile,
      base,
      commit,
      taskId,
      serviceTier: effectiveServiceTier
    };
  }

  if (mode === 'resume') {
    if (!sessionId) {
      throw new Error('resume mode requires a sessionId');
    }

    return {
      command: ['codex', 'exec', 'resume', sessionId, '--json', ...commonOptions],
      cwd,
      dryRun,
      mode,
      promptFile,
      taskId,
      sessionId,
      serviceTier: effectiveServiceTier
    };
  }

  const command = [
    'codex',
    'exec',
    '--json',
    '--sandbox',
    SANDBOX_BY_MODE[mode],
    '-C',
    cwd,
    ...commonOptions
  ];

  if (schemaPath) {
    command.push('--output-schema', schemaPath);
  }

  return {
    command,
    cwd,
    dryRun,
    promptFile,
    mode,
    taskId,
    base,
    commit,
    serviceTier: effectiveServiceTier
  };
}

export function extractThreadId(jsonl) {
  for (const line of jsonl.split('\n')) {
    if (!line.trim().startsWith('{')) {
      continue;
    }

    try {
      const event = JSON.parse(line);
      if (event.type === 'thread.started') {
        return event.thread_id ?? null;
      }
    } catch {
      // Ignore malformed lines and keep scanning.
    }
  }

  return null;
}

function stripFastServiceTier(command) {
  const stripped = [];

  for (let index = 0; index < command.length; index += 1) {
    if (command[index] === '-c' && command[index + 1] === 'service_tier="fast"') {
      index += 1;
      continue;
    }

    stripped.push(command[index]);
  }

  return stripped;
}

async function buildPrompt(invocation) {
  const promptBody = invocation.promptFile ? await readFile(invocation.promptFile, 'utf8') : undefined;

  if (invocation.mode !== 'review' || (!invocation.base && !invocation.commit)) {
    return promptBody;
  }

  if (invocation.base) {
    const [stat, diff] = await Promise.all([
      execFileAsync('git', ['diff', '--stat', `${invocation.base}..HEAD`], { cwd: invocation.cwd }),
      execFileAsync('git', ['diff', `${invocation.base}..HEAD`], { cwd: invocation.cwd })
    ]);

    return [
      promptBody ?? '',
      '',
      '## Diff Scope',
      `Base: ${invocation.base}`,
      '',
      '### git diff --stat',
      stat.stdout.trim(),
      '',
      '### git diff',
      diff.stdout.trim()
    ].join('\n');
  }

  const commitView = await execFileAsync(
    'git',
    ['show', '--stat', '--format=medium', invocation.commit],
    { cwd: invocation.cwd }
  );

  return [
    promptBody ?? '',
    '',
    '## Diff Scope',
    `Commit: ${invocation.commit}`,
    '',
    '### git show --stat --format=medium',
    commitView.stdout.trim()
  ].join('\n');
}

async function executeCommand(command, cwd, prompt) {
  const args = prompt ? [...command.slice(1), prompt] : command.slice(1);
  return execFileAsync(command[0], args, { cwd });
}

async function runInvocation(invocation) {
  if (invocation.dryRun) {
    return { stdout: JSON.stringify(invocation, null, 2), stderr: '' };
  }

  const prompt = await buildPrompt(invocation);

  try {
    return await executeCommand(invocation.command, invocation.cwd, prompt);
  } catch (error) {
    const output = `${error.stderr ?? ''}\n${error.stdout ?? ''}`;
    if (invocation.serviceTier === 'fast' && /service_tier|fast/i.test(output)) {
      return executeCommand(stripFastServiceTier(invocation.command), invocation.cwd, prompt);
    }

    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      cwd: { type: 'string' },
      taskId: { type: 'string' },
      model: { type: 'string' },
      effort: { type: 'string' },
      serviceTier: { type: 'string' },
      schema: { type: 'string' },
      promptFile: { type: 'string' },
      base: { type: 'string' },
      commit: { type: 'string' },
      sessionId: { type: 'string' },
      dryRun: { type: 'boolean' }
    }
  });

  const mode = positionals[0];
  // Validate early to fail before any async I/O (buildInvocation also validates).
  assertSupportedMode(mode);
  const cwd = values.cwd ?? process.cwd();
  const runtime = await detectCodexRuntime();
  const savedState =
    mode === 'resume' && values.taskId && !values.sessionId
      ? await loadRequiredTaskState(cwd, values.taskId)
      : null;
  const invocation = buildInvocation({
    mode,
    cwd,
    taskId: values.taskId,
    model: values.model,
    effort: values.effort,
    serviceTier: values.serviceTier,
    authProvider: runtime.authProvider,
    schemaPath: values.schema,
    promptFile: values.promptFile,
    base: values.base,
    commit: values.commit,
    sessionId: values.sessionId ?? savedState?.sessionId,
    dryRun: values.dryRun ?? false
  });

  const result = await runInvocation(invocation);
  const threadId = extractThreadId(result.stdout);

  if (threadId && values.taskId) {
    await saveTaskState(cwd, values.taskId, {
      taskId: values.taskId,
      role: mode,
      phase: mode,
      cwd,
      sessionId: threadId
    });
  }

  process.stdout.write(result.stdout);
}
