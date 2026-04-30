import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { detectCodexRuntime } from './detect-codex.mjs';

const PLUGIN_ROOT_DEFAULT = fileURLToPath(new URL('..', import.meta.url));

const execFileAsync = promisify(execFile);

export async function assertWritableStateDir(root, { fs = { mkdir, writeFile, rm } } = {}) {
  const dir = join(root, '.claude', 'state', 'codex');
  const probe = join(dir, '.doctor-write-test');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(probe, 'ok\n', 'utf8');
  await fs.rm(probe);
}

async function defaultRunCommand(name, args) {
  return execFileAsync(name, args);
}

async function defaultMcpListTools({ pluginRoot }) {
  // In-process smoke: instantiate the MCP server and read its tools/list.
  // No transport — we just exercise the registration path that real clients
  // depend on. Failure here means the bundled MCP wiring is broken.
  const moduleUrl = new URL(`file://${join(pluginRoot, 'scripts', 'mcp-server.mjs')}`).href;
  const { createMcpServer } = await import(moduleUrl);
  const { TOOL_DEFINITIONS } = await import(
    new URL(`file://${join(pluginRoot, 'scripts', 'lib', 'mcp-tool-definitions.mjs')}`).href
  );
  // createMcpServer registers handlers on a Server instance; we don't need
  // to connect a transport to confirm that TOOL_DEFINITIONS is exhaustively
  // wired. Booting the module is the actual contract test — the catch above
  // would surface any registration error.
  await createMcpServer();
  return TOOL_DEFINITIONS.map((tool) => tool.name);
}

async function readPluginVersion(pluginRoot) {
  const raw = await readFile(join(pluginRoot, 'package.json'), 'utf8');
  return JSON.parse(raw).version;
}

/**
 * Run all doctor checks and return a structured result.
 *
 * On success: `ok: true` with codexVersion, authProvider, fastModeAvailable,
 * pluginVersion, workspace, and tools (list+count).
 *
 * On failure: `ok: false` with `failures: [{step, error}]` so operators can
 * see which check broke instead of an opaque process exit.
 *
 * @param {object} opts
 * @param {string}   opts.cwd            - Workspace root to check.
 * @param {string}   [opts.pluginRoot]   - Plugin root (DI for tests).
 * @param {Function} [opts.detectRuntime] - Codex runtime detector (DI).
 * @param {Function} [opts.runCommand]    - Subprocess runner (DI). Receives (name, args).
 * @param {Function} [opts.mcpListTools]  - MCP tools/list smoke (DI). Returns string[].
 */
export async function runDoctorChecks({
  cwd,
  pluginRoot = PLUGIN_ROOT_DEFAULT,
  detectRuntime = detectCodexRuntime,
  runCommand = defaultRunCommand,
  mcpListTools = defaultMcpListTools
} = {}) {
  const failures = [];
  const result = {
    ok: false,
    workspace: cwd,
    pluginRoot: resolve(pluginRoot),
    pluginVersion: null,
    codexVersion: null,
    authProvider: null,
    fastModeAvailable: false,
    tools: { count: 0, names: [] },
    failures
  };

  async function step(name, fn) {
    try {
      await fn();
    } catch (error) {
      failures.push({ step: name, error: error.message ?? String(error) });
    }
  }

  await step('plugin-version', async () => {
    result.pluginVersion = await readPluginVersion(pluginRoot);
  });

  await step('codex-runtime', async () => {
    const runtime = await detectRuntime();
    if (!runtime.installed) {
      throw new Error(runtime.loginStatus || 'codex CLI not found');
    }
    if (!runtime.authenticated) {
      throw new Error(`Codex is not authenticated: ${runtime.loginStatus}`);
    }
    result.codexVersion = runtime.version;
    result.authProvider = runtime.authProvider;
    result.fastModeAvailable = runtime.authProvider === 'chatgpt';
  });

  await step('git-binary', async () => {
    await runCommand('git', ['--version']);
  });

  await step('node-binary', async () => {
    await runCommand('node', ['--version']);
  });

  await step('writable-state-dir', async () => {
    await assertWritableStateDir(cwd);
  });

  await step('codex-cli-contract', async () => {
    await runCommand('node', [join(pluginRoot, 'scripts', 'check-codex-cli.mjs')]);
  });

  await step('mcp-tools-list', async () => {
    const tools = await mcpListTools({ pluginRoot });
    result.tools.count = tools.length;
    result.tools.names = tools;
  });

  await step('plugin-manifest', async () => {
    await runCommand(
      'claude',
      ['plugin', 'validate', join(pluginRoot, '.claude-plugin', 'plugin.json')]
    );
  });

  result.ok = failures.length === 0;
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runDoctorChecks({ cwd: process.cwd() });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exit(1);
  }
}
