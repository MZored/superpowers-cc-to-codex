import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { detectCodexRuntime } from './detect-codex.mjs';
import { loadRequiredTaskState, saveTaskState } from './lib/codex-state.mjs';
import { runCommand } from './lib/run-command.mjs';
import { buildStructuredReviewPrompt } from './lib/review-scope.mjs';

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

function assertValidReviewSelector({ mode, base, commit, uncommitted, schemaPath }) {
  if (mode !== 'review') return;
  const selectorCount = [Boolean(base), Boolean(commit), Boolean(uncommitted)].filter(Boolean).length;
  if (selectorCount > 1) {
    throw new Error('Choose exactly one review selector: --base, --commit, or --uncommitted.');
  }
  if (schemaPath && uncommitted) {
    throw new Error('Structured review does not support --uncommitted. Use advisory review without --schema.');
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
  uncommitted = false,
  sessionId,
  dryRun = false
}) {
  assertSupportedMode(mode);
  assertValidReviewSelector({ mode, base, commit, uncommitted, schemaPath });

  const { options: commonOptions, effectiveServiceTier } = buildCommonOptions({
    model,
    effort,
    serviceTier,
    authProvider
  });

  if (mode === 'review' && !schemaPath) {
    let command;
    if (uncommitted) {
      command = ['codex', 'review', '--uncommitted'];
    } else if (commit) {
      command = ['codex', 'review', '--commit', commit];
    } else if (base) {
      command = ['codex', 'review', '--base', base];
    }

    if (command) {
      return {
        command,
        cwd,
        dryRun,
        mode,
        promptFile,
        base,
        commit,
        uncommitted,
        taskId,
        serviceTier: effectiveServiceTier
      };
    }
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

  if (invocation.mode !== 'review') {
    return promptBody;
  }

  if (invocation.uncommitted) {
    // Advisory uncommitted review: prompt is passed separately to codex review --uncommitted
    return promptBody;
  }

  if (!invocation.base && !invocation.commit) {
    return promptBody;
  }

  return buildStructuredReviewPrompt({
    cwd: invocation.cwd,
    promptBody: promptBody ?? '',
    base: invocation.base,
    commit: invocation.commit
  });
}

async function executeCommand(command, cwd, prompt) {
  const args = prompt ? [...command.slice(1), prompt] : command.slice(1);
  return runCommand(command[0], args, { cwd });
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
      uncommitted: { type: 'boolean' },
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
    uncommitted: values.uncommitted ?? false,
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
