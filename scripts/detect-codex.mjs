import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function detectCodexRuntime({ runner = execFileAsync } = {}) {
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

  const login = await runner('codex', ['login', 'status']).catch((error) => ({
    stdout: '',
    stderr: error.stderr ?? error.message,
    code: error.code ?? 1
  }));
  const loginStatus = (login.stdout || login.stderr).trim();
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
    loginStatus,
    authProvider
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runtime = await detectCodexRuntime();
  console.log(JSON.stringify(runtime, null, 2));
}
