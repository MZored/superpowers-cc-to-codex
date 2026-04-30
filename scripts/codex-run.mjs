import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { detectCodexRuntime } from './detect-codex.mjs';
import { assertSafeTaskId, loadRequiredTaskState, saveTaskState } from './lib/codex-state.mjs';
import { runCommand } from './lib/run-command.mjs';
import { buildStructuredReviewPrompt } from './lib/review-scope.mjs';
import { parseCodexJsonl, validateImplementerResult } from './lib/codex-jsonl.mjs';
import { noopCodexEventEmitter } from './lib/codex-events.mjs';

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

function assertValidReviewSelector({ mode, base, commit, uncommitted }) {
  if (mode !== 'review') return;
  const selectorCount = [Boolean(base), Boolean(commit), Boolean(uncommitted)].filter(Boolean).length;
  if (selectorCount > 1) {
    throw new Error('Choose exactly one review selector: --base, --commit, or --uncommitted.');
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

  if (model && model !== 'auto') {
    options.push('-m', model);
  }

  // 'auto' (and empty) means: defer to ~/.codex/config.toml. Don't pass -c.
  if (effort && effort !== 'auto') {
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
  taskText,
  dryRun = false
}) {
  assertSupportedMode(mode);
  assertValidReviewSelector({ mode, base, commit, uncommitted });

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
        taskText,
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
      taskText,
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
    taskText,
    base,
    commit,
    uncommitted,
    serviceTier: effectiveServiceTier
  };
}

// Retry policy ------------------------------------------------------------
//
// Codex CLI calls run over the network. Transient infrastructure failures —
// dropped connections, 5xx upstream responses, brief auth refresh hiccups —
// surface as executor errors that succeed on a second attempt. User-facing
// errors (bad model, missing auth, schema validation) do NOT, and we must
// not paper over them with a retry.
//
// `isTransientCodexError` returns `true` only for failure shapes that we
// expect a fresh subprocess invocation to fix. Override via runCodexWorkflow's
// `isTransient` parameter for tests or operator-managed policies.

const TRANSIENT_NODE_ERROR_CODES = new Set([
  'ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'EAI_AGAIN'
]);

const TRANSIENT_OUTPUT_PATTERNS = [
  /\b(?:5\d\d)\s+(?:status|service unavailable|bad gateway|gateway timeout)\b/i,
  /service unavailable|temporarily unavailable/i,
  /connection reset|connection aborted|connection closed/i,
  /econnreset|etimedout|enetunreach|enotfound/i,
  /upstream\s+(?:error|timeout)/i
];

async function runWithTransientRetry({ attempt, isTransient, maxRetries, onRetry }) {
  let lastError;
  for (let i = 0; i <= maxRetries; i += 1) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      if (i === maxRetries || !isTransient(error)) {
        throw error;
      }
      onRetry?.(error);
      // Loop continues — single retry by default. No backoff: Codex's own
      // server-side rate limiting handles real overload.
    }
  }
  throw lastError;
}

export function isTransientCodexError(error) {
  if (!error) return false;
  if (TRANSIENT_NODE_ERROR_CODES.has(error.code)) return true;

  const haystack = `${error.message ?? ''}\n${error.stderr ?? ''}\n${error.stdout ?? ''}`;
  return TRANSIENT_OUTPUT_PATTERNS.some((pattern) => pattern.test(haystack));
}

export function composePromptText(template, taskText) {
  if (!template && !taskText) return undefined;
  if (!template) return taskText;
  if (!taskText) return template;
  return `${template}\n\n## Your Task\n\n${taskText}`;
}

export function extractThreadId(jsonl) {
  return parseCodexJsonl(jsonl).threadId;
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

export async function buildPrompt(invocation) {
  const template = invocation.promptFile ? await readFile(invocation.promptFile, 'utf8') : undefined;

  if (invocation.mode !== 'review') {
    return composePromptText(template, invocation.taskText);
  }

  // Advisory review path: command is `codex review ...`, prompt is passed verbatim.
  if (invocation.command?.[1] === 'review') {
    return composePromptText(template, invocation.taskText);
  }

  if (!invocation.base && !invocation.commit && !invocation.uncommitted) {
    return template;
  }

  return buildStructuredReviewPrompt({
    cwd: invocation.cwd,
    promptBody: composePromptText(template, invocation.taskText) ?? '',
    base: invocation.base,
    commit: invocation.commit,
    uncommitted: invocation.uncommitted
  });
}

async function executeCommand(
  command,
  cwd,
  prompt,
  { signal, onSpawn, onStdoutChunk, onStderrChunk } = {}
) {
  const args = prompt ? [...command.slice(1), prompt] : command.slice(1);
  return runCommand(command[0], args, {
    cwd,
    signal,
    onSpawn,
    onStdout: onStdoutChunk,
    onStderr: onStderrChunk
  });
}

async function runInvocation(
  invocation,
  { signal, onSpawn, onStdoutChunk, onStderrChunk } = {}
) {
  if (invocation.dryRun) {
    return { stdout: JSON.stringify(invocation, null, 2), stderr: '' };
  }

  const prompt = await buildPrompt(invocation);

  try {
    return await executeCommand(invocation.command, invocation.cwd, prompt, {
      signal,
      onSpawn,
      onStdoutChunk,
      onStderrChunk
    });
  } catch (error) {
    const output = `${error.stderr ?? ''}\n${error.stdout ?? ''}`;
    if (invocation.serviceTier === 'fast' && /service_tier|fast/i.test(output)) {
      return executeCommand(stripFastServiceTier(invocation.command), invocation.cwd, prompt, {
        signal,
        onSpawn,
        onStdoutChunk,
        onStderrChunk
      });
    }

    throw error;
  }
}

export async function runCodexWorkflow({
  mode,
  cwd,
  taskId,
  model,
  effort,
  serviceTier,
  schemaPath,
  promptFile,
  base,
  commit,
  uncommitted = false,
  sessionId,
  taskText,
  signal,
  onSpawn,
  onStdoutChunk,
  onStderrChunk,
  dryRun = false,
  runtimeDetector = detectCodexRuntime,
  executor = runInvocation,
  stateStore = { loadRequired: loadRequiredTaskState, save: saveTaskState },
  isTransient = isTransientCodexError,
  maxRetries = 1,
  eventEmitter = noopCodexEventEmitter
}) {
  if (taskId != null) {
    assertSafeTaskId(taskId);
  }

  const runtime = await runtimeDetector();

  const savedState =
    mode === 'resume' && taskId && !sessionId
      ? await stateStore.loadRequired(cwd, taskId)
      : null;

  const resolvedSessionId = sessionId ?? savedState?.sessionId;

  const invocation = buildInvocation({
    mode,
    cwd,
    taskId,
    model,
    effort,
    serviceTier,
    authProvider: runtime.authProvider,
    schemaPath,
    promptFile,
    base,
    commit,
    uncommitted,
    sessionId: resolvedSessionId,
    taskText,
    dryRun
  });

  const startedAt = Date.now();
  let retried = false;

  await eventEmitter.emit({
    type: 'codex.invocation.start',
    mode,
    taskId,
    model: invocation.model ?? model ?? null,
    effort: invocation.effort ?? effort ?? null,
    serviceTier: invocation.serviceTier ?? null,
    sessionId: invocation.sessionId ?? null
  });

  let execution;

  try {
    execution = await runWithTransientRetry({
      isTransient,
      maxRetries,
      onRetry: () => {
        retried = true;
      },
      attempt: () => executor(invocation, { signal, onSpawn, onStdoutChunk, onStderrChunk })
    });
  } catch (error) {
    // Salvage: attempt to extract partial state from error output
    const rawStdout = error.stdout ?? '';
    const parsed = parseCodexJsonl(rawStdout);

    if (taskId) {
      error.taskId = taskId;
    }

    if (parsed.threadId) {
      error.sessionId = parsed.threadId;
      error.salvageReason = 'partial-jsonl-thread';
    }

    if (parsed.threadId && taskId) {
      await stateStore.save(cwd, taskId, {
        taskId,
        role: mode,
        phase: mode,
        cwd,
        sessionId: parsed.threadId
      });
    }

    // Implement and resume share the implementer-result contract — validate
    // both even on failure, before re-throwing the underlying executor error.
    if (['implement', 'resume'].includes(mode) && schemaPath && parsed.result) {
      validateImplementerResult(parsed.result);
    }

    await eventEmitter.emit({
      type: 'codex.invocation.error',
      mode,
      taskId,
      errorClass: error.name ?? 'Error',
      transient: isTransient(error),
      message: error.message ?? String(error),
      salvagedSessionId: parsed.threadId ?? null
    });

    throw error;
  }

  const rawStdout = execution.stdout ?? '';
  const parsed = parseCodexJsonl(rawStdout);
  const plainAdvisoryText =
    mode === 'review' && !schemaPath && !parsed.assistantText
      ? rawStdout.trim() || null
      : null;

  // Implement and resume share the implementer-result contract.
  if (['implement', 'resume'].includes(mode) && schemaPath && parsed.result) {
    validateImplementerResult(parsed.result);
  }

  const effectiveSessionId = parsed.threadId ?? invocation.sessionId ?? null;

  await eventEmitter.emit({
    type: 'codex.invocation.end',
    mode,
    taskId,
    sessionId: effectiveSessionId,
    durationMs: Date.now() - startedAt,
    status: 'ok',
    exitCode: execution.code ?? 0,
    retried
  });

  if (effectiveSessionId && taskId) {
    await stateStore.save(cwd, taskId, {
      taskId,
      role: mode,
      phase: mode,
      cwd,
      sessionId: effectiveSessionId
    });
  }

  return {
    ...execution,
    sessionId: effectiveSessionId,
    assistantText: parsed.assistantText ?? plainAdvisoryText,
    result: parsed.result
  };
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
  const taskText = positionals.slice(1).join(' ') || undefined;
  // Validate early to fail before any async I/O (buildInvocation also validates).
  assertSupportedMode(mode);
  const cwd = values.cwd ?? process.cwd();

  const output = await runCodexWorkflow({
    mode,
    cwd,
    taskId: values.taskId,
    model: values.model,
    effort: values.effort,
    serviceTier: values.serviceTier,
    schemaPath: values.schema,
    promptFile: values.promptFile,
    base: values.base,
    commit: values.commit,
    uncommitted: values.uncommitted ?? false,
    sessionId: values.sessionId,
    taskText,
    dryRun: values.dryRun ?? false
  });

  process.stdout.write(output.stdout);
}
