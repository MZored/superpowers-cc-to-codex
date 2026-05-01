import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// `codex login status` is normally fast, but it shells out and could in
// theory wedge (paused process, blocked stdin, etc.). Cap it with an
// AbortSignal-backed timeout so a hanging detection cannot block MCP
// bootstrap or every workflow dispatch. 5s is generous; the call is
// usually well under 100ms.
const DEFAULT_LOGIN_STATUS_TIMEOUT_MS = 5_000;

export async function detectCodexRuntime({
  runner = execFileAsync,
  loginStatusTimeoutMs = DEFAULT_LOGIN_STATUS_TIMEOUT_MS
} = {}) {
  const version = await runner('codex', ['--version']).catch((error) => {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  });

  if (!version) {
    return {
      installed: false,
      version: null,
      authenticated: false,
      loginStatus: 'codex binary not found in PATH'
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('login status timed out'), loginStatusTimeoutMs);
  // Don't keep the event loop alive solely for this watchdog — the runner
  // races it, and the timer is cleared synchronously after the runner settles.
  if (typeof timer.unref === 'function') timer.unref();

  let login;
  try {
    login = await runner('codex', ['login', 'status'], { signal: controller.signal });
  } catch (error) {
    login = {
      stdout: '',
      stderr: error?.stderr ?? error?.message ?? String(error),
      code: error?.code ?? 1,
      timedOut: controller.signal.aborted
    };
  } finally {
    clearTimeout(timer);
  }

  const loginStatus = (login.stdout || login.stderr || '').toString().trim();
  const authProvider = /ChatGPT/i.test(loginStatus)
    ? 'chatgpt'
    : /API key/i.test(loginStatus)
      ? 'api_key'
      : 'unknown';
  const authenticated = login.code === undefined || login.code === 0;

  return {
    installed: true,
    version: version.stdout.trim(),
    authenticated,
    loginStatus: login.timedOut ? 'login status check timed out' : loginStatus,
    authProvider
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runtime = await detectCodexRuntime();
  console.log(JSON.stringify(runtime, null, 2));
}
