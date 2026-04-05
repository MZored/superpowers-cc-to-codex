import { parseCodexJsonl, truncateRawOutput } from './codex-jsonl.mjs';

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
 * @param {boolean}  [opts.includeRawOutput=false] - Attach truncated raw stdout to the result
 * @param {Function}  opts.operation         - async ({ signal, cancel, markSpawned }) => result
 *                                              Call markSpawned(child) once the subprocess starts.
 *                                              Call cancel(reason) to self-cancel the operation.
 *
 * @returns {Promise<{ status: 'ok'|'partial', timedOut, sessionId, assistantText, result, stderrTail, rawOutput? }>}
 */
export async function runWithMcpRuntime({
  requestId,
  timeoutMs,
  progressToken,
  sendProgress,
  includeRawOutput = false,
  operation
}) {
  const controller = new AbortController();
  const startedAt = Date.now();
  let trackedChild = null;
  let progressTimer = null;
  let timeoutTimer = null;
  let timedOut = false;

  function cancel(reason = 'cancelled') {
    controller.abort(reason);
    if (trackedChild) {
      trackedChild.kill('SIGTERM');
    }
  }

  function markSpawned(child) {
    trackedChild = child;
  }

  // Start optional progress ticker
  if (progressToken && sendProgress) {
    progressTimer = setInterval(async () => {
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      try {
        await sendProgress({
          progressToken,
          progress: elapsed,
          message: `Codex still running (${elapsed}s elapsed)`
        });
      } catch {
        // Non-fatal — progress notification failures must not kill the operation
      }
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
    const executionResult = await operation({ signal: controller.signal, cancel, markSpawned });
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
    cleanup();

    // Attempt partial salvage from stdout attached to the error
    const raw = error.stdout ?? '';
    const parsed = parseCodexJsonl(raw);

    if (parsed.threadId || parsed.assistantText || parsed.result) {
      if (progressToken && sendProgress) {
        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        try {
          await sendProgress({
            progressToken,
            progress: elapsed,
            message: timedOut
              ? `Codex timed out after ${elapsed}s — returning partial result`
              : `Codex errored after ${elapsed}s — returning partial result`
          });
        } catch {
          // Non-fatal
        }
      }

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
