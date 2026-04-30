import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { assertWritableStateDir, runDoctorChecks } from '../../scripts/doctor.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('assertWritableStateDir creates the state directory and cleans up the probe file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-doctor-'));
  const calls = { mkdir: [], writeFile: [], rm: [] };

  const fs = {
    mkdir: async (dir, opts) => {
      calls.mkdir.push(dir);
      return (await import('node:fs/promises')).mkdir(dir, opts);
    },
    writeFile: async (path, data, enc) => {
      calls.writeFile.push(path);
      return (await import('node:fs/promises')).writeFile(path, data, enc);
    },
    rm: async (path) => {
      calls.rm.push(path);
      return (await import('node:fs/promises')).rm(path);
    }
  };

  await assertWritableStateDir(root, { fs });

  assert.equal(calls.mkdir.length, 1);
  assert.ok(calls.mkdir[0].endsWith(join('.claude', 'state', 'codex')));
  assert.equal(calls.writeFile.length, 1);
  assert.ok(calls.writeFile[0].endsWith('.doctor-write-test'));
  assert.equal(calls.rm.length, 1, 'probe file must be cleaned up');
});

test('assertWritableStateDir throws when the directory is not writable', async () => {
  const fs = {
    mkdir: async () => {
      throw new Error('EACCES: permission denied');
    },
    writeFile: async () => {},
    rm: async () => {}
  };

  await assert.rejects(
    assertWritableStateDir('/nonexistent', { fs }),
    /permission denied/
  );
});

test('runDoctorChecks reports plugin version, workspace, and registered MCP tool names', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-doctor-enriched-'));
  const result = await runDoctorChecks({
    cwd: root,
    pluginRoot: PROJECT_ROOT,
    detectRuntime: async () => ({
      installed: true,
      authenticated: true,
      authProvider: 'chatgpt',
      version: 'codex-cli 0.125.0'
    }),
    runCommand: async () => ({ stdout: '', stderr: '', code: 0 }),
    mcpListTools: async () => [
      'codex_research', 'codex_plan', 'codex_implement', 'codex_review',
      'codex_debug', 'codex_branch_analysis', 'codex_resume'
    ]
  });

  assert.equal(result.ok, true);
  assert.equal(result.workspace, root);
  assert.match(result.pluginVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(result.tools.count, 7);
  assert.deepEqual(
    result.tools.names.slice().sort(),
    ['codex_branch_analysis', 'codex_debug', 'codex_implement', 'codex_plan', 'codex_research', 'codex_resume', 'codex_review'].sort()
  );
});

test('runDoctorChecks reports structured per-step failure (not an opaque throw)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-doctor-fail-'));
  const result = await runDoctorChecks({
    cwd: root,
    pluginRoot: PROJECT_ROOT,
    detectRuntime: async () => ({
      installed: true,
      authenticated: true,
      authProvider: 'chatgpt',
      version: 'codex-cli 0.125.0'
    }),
    runCommand: async (name, args) => {
      if (name === 'claude' && args[0] === 'plugin') {
        const err = new Error('plugin manifest invalid');
        err.code = 1;
        throw err;
      }
      return { stdout: '', stderr: '', code: 0 };
    },
    mcpListTools: async () => ['codex_research']
  });

  assert.equal(result.ok, false);
  assert.ok(Array.isArray(result.failures), 'failures must be an array');
  const pluginValidate = result.failures.find((f) => /plugin/i.test(f.step));
  assert.ok(pluginValidate, `expected a plugin-validate failure entry, got ${JSON.stringify(result.failures)}`);
  assert.match(pluginValidate.error, /plugin manifest invalid/);
});

test('runDoctorChecks runs an in-process MCP tools/list smoke check', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-doctor-mcp-'));
  let mcpListCalled = false;

  await runDoctorChecks({
    cwd: root,
    pluginRoot: PROJECT_ROOT,
    detectRuntime: async () => ({
      installed: true,
      authenticated: true,
      authProvider: 'chatgpt',
      version: 'codex-cli 0.125.0'
    }),
    runCommand: async () => ({ stdout: '', stderr: '', code: 0 }),
    mcpListTools: async () => {
      mcpListCalled = true;
      return ['codex_research'];
    }
  });

  assert.equal(mcpListCalled, true, 'doctor must invoke the MCP tools/list smoke');
});

test('summarizeCodexEvents reports mode histogram, recent errors, and duration percentiles', async () => {
  const { summarizeCodexEvents } = await import('../../scripts/doctor.mjs');
  const summary = summarizeCodexEvents([
    { type: 'codex.invocation.end', mode: 'implement', status: 'ok', durationMs: 100, retried: false },
    { type: 'codex.invocation.end', mode: 'implement', status: 'ok', durationMs: 300, retried: true },
    { type: 'codex.invocation.end', mode: 'plan', status: 'partial', durationMs: 50, retried: false },
    { type: 'codex.invocation.error', mode: 'review', message: 'auth failure', salvagedSessionId: 'thread-err' }
  ]);

  assert.equal(summary.byMode.implement.ok, 2);
  assert.equal(summary.byMode.implement.retried, 1);
  assert.equal(summary.byMode.plan.partial, 1);
  assert.equal(summary.lastErrors.length, 1);
  assert.equal(summary.lastErrors[0].sessionId, 'thread-err');
  assert.equal(summary.durations.implement.p50Ms, 100);
  assert.equal(summary.durations.implement.p95Ms, 300);
});

test('runDoctorChecks verbose mode reads SUPERPOWERS_CODEX_LOG_FILE when set', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-doctor-verbose-'));
  const logPath = join(root, 'codex-events.jsonl');
  await writeFile(
    logPath,
    [
      JSON.stringify({ type: 'codex.invocation.end', mode: 'research', status: 'ok', durationMs: 25, retried: false }),
      'not-json',
      JSON.stringify({ type: 'codex.invocation.error', mode: 'implement', message: 'timeout', salvagedSessionId: 'thread-timeout' })
    ].join('\n'),
    'utf8'
  );

  const result = await runDoctorChecks({
    cwd: root,
    pluginRoot: PROJECT_ROOT,
    verbose: true,
    env: { SUPERPOWERS_CODEX_LOG_FILE: logPath },
    detectRuntime: async () => ({
      installed: true,
      authenticated: true,
      authProvider: 'chatgpt',
      version: 'codex-cli 0.125.0'
    }),
    runCommand: async () => ({ stdout: '', stderr: '', code: 0 }),
    mcpListTools: async () => ['codex_research']
  });

  assert.equal(result.ok, true);
  assert.equal(result.eventLog.path, logPath);
  assert.equal(result.eventLog.summary.byMode.research.ok, 1);
  assert.equal(result.eventLog.summary.lastErrors[0].sessionId, 'thread-timeout');
});

test('readRecentCodexEvents is fail-soft for null and missing paths', async () => {
  const { readRecentCodexEvents } = await import('../../scripts/doctor.mjs');

  const nullResult = await readRecentCodexEvents(null);
  assert.equal(nullResult.path, null);
  assert.equal(nullResult.readable, false);
  assert.deepEqual(nullResult.events, []);

  const missing = await readRecentCodexEvents('/tmp/sp-doctor-does-not-exist-' + Date.now() + '.jsonl');
  assert.equal(missing.readable, false);
  assert.ok(missing.error, 'should surface the fs error message');
  assert.deepEqual(missing.events, []);
});
