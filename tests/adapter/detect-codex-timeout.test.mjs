import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCodexRuntime } from '../../scripts/detect-codex.mjs';

// `codex login status` is generally fast, but defensive code paths matter:
// if the CLI ever wedges (waiting on stdin, paused under a debugger, etc.),
// detection must not block the MCP server's bootstrap or every workflow
// dispatch. Cap login-status detection with an AbortSignal-backed timeout
// and degrade gracefully — version is still useful even when login status
// is unknown.

test('detectCodexRuntime times out a hanging codex login status without throwing', async () => {
  let loginAbortReceived = null;

  // First runner call ('codex --version') resolves quickly; second call
  // ('codex login status') ignores the deadline and "hangs" until aborted.
  let callIndex = 0;
  const runner = async (cmd, args, opts = {}) => {
    callIndex += 1;
    if (callIndex === 1) {
      return { stdout: 'codex-cli 0.125.0\n', stderr: '' };
    }
    // Hang until the abort signal fires; then surface an AbortError-shaped reject.
    const signal = opts?.signal;
    if (!signal) {
      throw new Error('expected detectCodexRuntime to pass a signal to login status');
    }
    return new Promise((_resolve, reject) => {
      const onAbort = () => {
        loginAbortReceived = signal.reason ?? 'aborted';
        const error = new Error('aborted');
        error.code = 'ABORT_ERR';
        error.stderr = '';
        reject(error);
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    });
  };

  const start = Date.now();
  const runtime = await detectCodexRuntime({ runner, loginStatusTimeoutMs: 50 });
  const elapsed = Date.now() - start;

  assert.equal(runtime.installed, true);
  assert.equal(runtime.version, 'codex-cli 0.125.0');
  // Even with login status hanging, we still get a runtime object back.
  assert.ok(typeof runtime.authProvider === 'string');
  // The signal must have actually fired — not bypassed by a missed wiring.
  assert.ok(loginAbortReceived, 'expected login status runner to receive an abort signal');
  // Must not block past a small multiple of the configured deadline.
  assert.ok(elapsed < 1000, `detection took ${elapsed}ms, expected <1000ms`);
});
