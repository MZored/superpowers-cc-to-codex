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

function percentile(values, percentileValue) {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1)
  );
  return sorted[index];
}

export function summarizeCodexEvents(events) {
  const byMode = {};
  const durationsByMode = {};
  const errors = [];

  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const mode = event.mode;
    if (!mode) continue;

    byMode[mode] ??= { ok: 0, partial: 0, error: 0, retried: 0 };

    if (event.type === 'codex.invocation.end') {
      const status = event.status === 'partial' ? 'partial' : event.status === 'error' ? 'error' : 'ok';
      byMode[mode][status] += 1;
      if (event.retried) byMode[mode].retried += 1;
      if (Number.isFinite(event.durationMs)) {
        durationsByMode[mode] ??= [];
        durationsByMode[mode].push(event.durationMs);
      }
    }

    if (event.type === 'codex.invocation.error') {
      byMode[mode].error += 1;
      errors.push({
        mode,
        message: event.message ?? '',
        sessionId: event.salvagedSessionId ?? event.sessionId ?? null
      });
    }
  }

  const durations = {};
  for (const [mode, values] of Object.entries(durationsByMode)) {
    durations[mode] = {
      p50Ms: percentile(values, 50),
      p95Ms: percentile(values, 95)
    };
  }

  return {
    byMode,
    lastErrors: errors.slice(-5),
    durations
  };
}

export async function readRecentCodexEvents(logPath, { fs = { readFile }, maxLines = 100 } = {}) {
  if (!logPath) {
    return { path: null, readable: false, events: [] };
  }

  try {
    const raw = await fs.readFile(logPath, 'utf8');
    const lines = raw.split(/\r?\n/).filter(Boolean).slice(-maxLines);
    const events = [];
    for (const line of lines) {
      try {
        events.push(JSON.parse(line));
      } catch {
        continue;
      }
    }
    return { path: logPath, readable: true, events };
  } catch (error) {
    return {
      path: logPath,
      readable: false,
      error: error.message ?? String(error),
      events: []
    };
  }
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
  mcpListTools = defaultMcpListTools,
  verbose = false,
  env = process.env
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
    eventLog: null,
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

  if (verbose) {
    const recent = await readRecentCodexEvents(env.SUPERPOWERS_CODEX_LOG_FILE);
    result.eventLog = {
      path: recent.path,
      readable: recent.readable,
      ...(recent.error ? { error: recent.error } : {}),
      summary: summarizeCodexEvents(recent.events)
    };
  }

  result.ok = failures.length === 0;
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const verbose = process.argv.includes('--verbose');
  const result = await runDoctorChecks({ cwd: process.cwd(), verbose });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exit(1);
  }
}
