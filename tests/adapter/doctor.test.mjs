import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
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
