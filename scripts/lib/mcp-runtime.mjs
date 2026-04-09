import {
  advanceCodexLifecycle,
  createCodexJsonlStreamParser,
  parseCodexJsonl,
  truncateRawOutput
} from './codex-jsonl.mjs';

const PROGRESS_INTERVAL_MS = 20_000;

/**
 * createRequestRegistry — tracks in-flight MCP requests by requestId.
 * Allows the MCP server to cancel a running Codex subprocess when the client
 * sends a cancellation notification.
 *
 * @returns {{ set(id: string, entry: unknown): void, get(id: string): unknown|null, delete(id: string): void }}
 */
export function createRequestRegistry() {
  const map = new Map();

  return {
    set(requestId, entry) {
      map.set(requestId, entry);
    },
    get(requestId) {
      return map.has(requestId) ? map.get(requestId) : null;
    },
    delete(requestId) {
      map.delete(requestId);
    }
  };
}

/**
 * runWithMcpRuntime — executes a Codex operation with:
 *   - AbortController for cancellation
 *   - Optional timeout that cancels and attempts partial-result salvage
 *   - Optional 20-second progress ticker to keep MCP clients alive
 *   - Partial result extraction from thrown errors (for timeout salvage)
 *
 * @param {object} opts
 * @param {string}   opts.requestId          - Reserved for external registry integration in
 *                                              Task 4; not consumed internally.
 * @param {number}   [opts.timeoutMs]        - Hard timeout in ms; 0/undefined = no timeout
 * @param {string}   [opts.progressToken]    - MCP progress token; triggers progress notifications
 * @param {Function} [opts.sendProgress]     - async (payload) => void; called every PROGRESS_INTERVAL_MS
 * @param {Function} [opts.sendLog]          - async (payload) => void; forwards logging messages
 * @param {boolean}  [opts.includeRawOutput=false] - Attach truncated raw stdout to the result
 * @param {Function}  opts.operation         - async ({ signal, cancel, markSpawned, onStdoutChunk, onStderrChunk }) => result
 *                                              Call markSpawned(handle) once the subprocess starts.
 *                                              Call cancel(reason) to self-cancel the operation.
 *
 * @returns {Promise<{ status: 'ok'|'partial', timedOut, sessionId, assistantText, result, stderrTail, rawOutput? }>}
 */
export async function runWithMcpRuntime({
  requestId,
  timeoutMs,
  progressToken,
  sendProgress,
  sendLog,
  includeRawOutput = false,
  operation
}) {
  const controller = new AbortController();
  const startedAt = Date.now();
  let trackedHandle = null;
  let progressTimer = null;
  let timeoutTimer = null;
  let timedOut = false;
  let progress = 0;
  let lifecycleState = null;

  async function emitProgress(message) {
    if (!progressToken || !sendProgress) return;

    progress += 1;

    try {
      await sendProgress({
        progressToken,
        progress,
        message
      });
    } catch {
      // Non-fatal — progress notification failures must not kill the operation
    }
  }

  async function emitLog(level, logger, data) {
    if (!sendLog) return;

    try {
      await sendLog({ level, logger, data });
    } catch {
      // Non-fatal — log notification failures must not kill the operation
    }
  }

  const stdoutParser = createCodexJsonlStreamParser({
    onJsonEvent: (event) => {
      const nextState = advanceCodexLifecycle(lifecycleState, event);
      const stageChanged = nextState?.stage && nextState.stage !== lifecycleState?.stage;
      lifecycleState = nextState;

      if (stageChanged && nextState?.message) {
        void emitProgress(nextState.message);
      }
    },
    onDiagnosticLine: (line) => {
      const level = /\bWARN\b/.test(line) ? 'warning' : 'info';
      void emitLog(level, 'codex.exec', { requestId, line });
    }
  });

  function cancel(reason = 'cancelled') {
    controller.abort(reason);
    if (trackedHandle) {
      trackedHandle.terminate(reason);
    }
  }

  function markSpawned(handle) {
    trackedHandle = handle;
    void emitProgress('Codex process started');
  }

  // Start optional progress ticker
  if (progressToken && sendProgress) {
    progressTimer = setInterval(async () => {
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      await emitProgress(`Codex still running (${elapsed}s elapsed)`);
    }, PROGRESS_INTERVAL_MS);
  }

  // Start optional timeout
  if (timeoutMs && timeoutMs > 0) {
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      cancel('timed out');
    }, timeoutMs);
  }

  function cleanup() {
    if (progressTimer) clearInterval(progressTimer);
    if (timeoutTimer) clearTimeout(timeoutTimer);
  }

  try {
    const executionResult = await operation({
      signal: controller.signal,
      cancel,
      markSpawned,
      onStdoutChunk: (chunk) => {
        stdoutParser.push(chunk);
      },
      onStderrChunk: (chunk) => {
        const line = chunk.trimEnd();
        if (!line) return;
        void emitLog('warning', 'codex.stderr', { requestId, line });
      }
    });
    stdoutParser.end();
    cleanup();

    const raw = executionResult?.stdout ?? '';
    // Prefer pre-parsed fields when the operation (e.g. runCodexWorkflow) has
    // already parsed stdout; fall back to re-parsing for low-level callers
    // that return raw {stdout, stderr} without enriched fields.
    const hasPreParsed = executionResult && 'sessionId' in executionResult;
    const parsed = hasPreParsed
      ? {
          threadId: executionResult.sessionId,
          assistantText: executionResult.assistantText,
          result: executionResult.result
        }
      : parseCodexJsonl(raw);

    return {
      status: 'ok',
      timedOut: false,
      sessionId: parsed.threadId ?? null,
      assistantText: parsed.assistantText ?? null,
      result: parsed.result ?? null,
      stderrTail: executionResult?.stderr ?? executionResult?.stderrTail ?? '',
      ...(includeRawOutput ? { rawOutput: raw ? truncateRawOutput(raw) : null } : {})
    };
  } catch (error) {
    stdoutParser.end();
    cleanup();

    // Attempt partial salvage from stdout attached to the error
    const raw = error.stdout ?? '';
    const parsed = parseCodexJsonl(raw);

    if (parsed.threadId || parsed.assistantText || parsed.result) {
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      await emitProgress(
        timedOut
          ? `Codex timed out after ${elapsed}s — returning partial result`
          : `Codex errored after ${elapsed}s — returning partial result`
      );

      return {
        status: 'partial',
        timedOut,
        sessionId: parsed.threadId ?? null,
        assistantText: parsed.assistantText ?? null,
        result: parsed.result ?? null,
        stderrTail: error.stderr ?? '',
        ...(includeRawOutput ? { rawOutput: truncateRawOutput(raw) } : {})
      };
    }

    // No parseable data — re-throw so the MCP server can return an error response
    throw error;
  }
}
