import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ensurePluginDataSubdir, resolvePluginDataDir } from '../../scripts/lib/plugin-data.mjs';

test('resolvePluginDataDir returns a resolved plugin data directory from the environment', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-plugin-data-'));
  const features = resolvePluginDataDir({ CLAUDE_PLUGIN_DATA: root });

  assert.equal(features, resolve(root));
});

test('resolvePluginDataDir trims whitespace around CLAUDE_PLUGIN_DATA', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-plugin-data-'));
  const features = resolvePluginDataDir({ CLAUDE_PLUGIN_DATA: `  ${root}  ` });

  assert.equal(features, resolve(root));
});

test('resolvePluginDataDir returns null when CLAUDE_PLUGIN_DATA is missing', () => {
  const result = resolvePluginDataDir({});

  assert.equal(result, null);
});

test('ensurePluginDataSubdir returns null when CLAUDE_PLUGIN_DATA is missing', async () => {
  const result = await ensurePluginDataSubdir('mcp-tasks', { env: {} });

  assert.equal(result, null);
});

test('ensurePluginDataSubdir creates a resolved subdirectory under plugin data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-plugin-data-'));
  const mkdirCalls = [];

  const result = await ensurePluginDataSubdir('mcp-tasks', {
    env: { CLAUDE_PLUGIN_DATA: root },
    mkdirFn: async (dir, options) => {
      mkdirCalls.push({ dir, options });
    }
  });

  assert.equal(result, resolve(root, 'mcp-tasks'));
  assert.equal(mkdirCalls.length, 1);
  assert.equal(mkdirCalls[0].dir, resolve(root, 'mcp-tasks'));
  assert.deepEqual(mkdirCalls[0].options, { recursive: true });
});
