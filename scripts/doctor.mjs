import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { detectCodexRuntime } from './detect-codex.mjs';

const PLUGIN_ROOT = fileURLToPath(new URL('..', import.meta.url));
const MCP_SERVER_PATH = join(PLUGIN_ROOT, 'scripts', 'mcp-server.mjs');

const execFileAsync = promisify(execFile);

export async function assertWritableStateDir(root, { fs = { mkdir, writeFile, rm } } = {}) {
  const dir = join(root, '.claude', 'state', 'codex');
  const probe = join(dir, '.doctor-write-test');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(probe, 'ok\n', 'utf8');
  await fs.rm(probe);
}

async function assertCommand(name, args) {
  await execFileAsync(name, args);
}

/**
 * Run all doctor checks and return a result object.
 *
 * @param {object} opts
 * @param {string}   opts.cwd            - Workspace root to check
 * @param {Function} [opts.detectRuntime] - Runtime detector (DI for tests)
 * @returns {Promise<{ ok: boolean, codexVersion: string, authProvider: string, fastModeAvailable: boolean }>}
 */
export async function runDoctorChecks({ cwd, detectRuntime = detectCodexRuntime } = {}) {
  const runtime = await detectRuntime();
  if (!runtime.installed) {
    throw new Error(runtime.loginStatus);
  }

  if (!runtime.authenticated) {
    throw new Error(`Codex is not authenticated: ${runtime.loginStatus}`);
  }

  const fastModeAvailable = runtime.authProvider === 'chatgpt';

  await assertCommand('git', ['--version']);
  await assertCommand('node', ['--version']);
  await assertWritableStateDir(cwd);
  await assertCommand('node', ['scripts/check-codex-cli.mjs']);
  await assertCommand('node', [
    '-e',
    `import(${JSON.stringify(MCP_SERVER_PATH)}).then(({ createMcpServer }) => createMcpServer())`
  ]);
  await assertCommand('claude', ['plugin', 'validate', '.claude-plugin/plugin.json']);

  return {
    ok: true,
    codexVersion: runtime.version,
    authProvider: runtime.authProvider,
    fastModeAvailable
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runDoctorChecks({ cwd: process.cwd() });
  console.log(JSON.stringify(result, null, 2));
}
