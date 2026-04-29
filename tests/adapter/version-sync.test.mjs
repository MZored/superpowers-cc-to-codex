import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncVersions } from '../../scripts/version-sync.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function writeJson(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

test('syncVersions rewrites plugin and marketplace versions to match package.json', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-codex-version-sync-'));
  await mkdir(join(root, '.claude-plugin'), { recursive: true });

  await writeJson(join(root, 'package.json'), { name: 'sp', version: '9.9.9' });
  await writeJson(join(root, '.claude-plugin', 'plugin.json'), {
    name: 'sp',
    version: '0.0.1'
  });
  await writeJson(join(root, '.claude-plugin', 'marketplace.json'), {
    name: 'sp',
    plugins: [{ name: 'sp', version: '1.2.3' }]
  });

  const result = await syncVersions({ pluginRoot: root });

  const pluginAfter = await readJson(join(root, '.claude-plugin', 'plugin.json'));
  const marketplaceAfter = await readJson(join(root, '.claude-plugin', 'marketplace.json'));

  assert.equal(pluginAfter.version, '9.9.9');
  assert.equal(marketplaceAfter.plugins[0].version, '9.9.9');
  assert.equal(result.version, '9.9.9');
});

test('syncVersions writes atomically via .tmp + rename', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-codex-version-sync-atomic-'));
  await mkdir(join(root, '.claude-plugin'), { recursive: true });

  await writeJson(join(root, 'package.json'), { name: 'sp', version: '2.0.0' });
  await writeJson(join(root, '.claude-plugin', 'plugin.json'), { name: 'sp', version: '1.0.0' });
  await writeJson(join(root, '.claude-plugin', 'marketplace.json'), {
    name: 'sp',
    plugins: [{ name: 'sp', version: '1.0.0' }]
  });

  const writeCalls = [];
  const renameCalls = [];
  const fsImpl = await import('node:fs/promises');

  const fs = {
    readFile: fsImpl.readFile,
    writeFile: async (target, data, encoding) => {
      writeCalls.push(target);
      return fsImpl.writeFile(target, data, encoding);
    },
    rename: async (from, to) => {
      renameCalls.push({ from, to });
      return fsImpl.rename(from, to);
    }
  };

  await syncVersions({ pluginRoot: root, fs });

  assert.equal(renameCalls.length, 2, 'expected one rename per managed JSON file');
  for (const { from, to } of renameCalls) {
    assert.ok(from.endsWith('.tmp'), `temp source must end with .tmp, got ${from}`);
    assert.ok(!to.endsWith('.tmp'), `final path must not end with .tmp, got ${to}`);
  }
  assert.equal(writeCalls.length, 2);
  assert.ok(
    writeCalls.every((path) => path.endsWith('.tmp')),
    'writeFile must always target a temp path'
  );
});

test('syncVersions preserves trailing newline and 2-space indent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-codex-version-sync-format-'));
  await mkdir(join(root, '.claude-plugin'), { recursive: true });

  await writeJson(join(root, 'package.json'), { name: 'sp', version: '3.4.5' });
  await writeJson(join(root, '.claude-plugin', 'plugin.json'), { name: 'sp', version: '0.0.1' });
  await writeJson(join(root, '.claude-plugin', 'marketplace.json'), {
    name: 'sp',
    plugins: [{ name: 'sp', version: '0.0.1' }]
  });

  await syncVersions({ pluginRoot: root });

  const pluginRaw = await readFile(join(root, '.claude-plugin', 'plugin.json'), 'utf8');
  const marketplaceRaw = await readFile(join(root, '.claude-plugin', 'marketplace.json'), 'utf8');

  assert.ok(pluginRaw.endsWith('\n'), 'plugin.json must end with a newline');
  assert.ok(marketplaceRaw.endsWith('\n'), 'marketplace.json must end with a newline');
  assert.match(pluginRaw, /\n  "version": "3\.4\.5"/, 'plugin.json must use 2-space indent');
  assert.match(
    marketplaceRaw,
    /\n      "version": "3\.4\.5"/,
    'marketplace.json plugins[0] entry must use 2-space indent (6 spaces of nesting)'
  );
});

test('bundled plugin and marketplace versions match package.json (release contract)', async () => {
  const pkg = await readJson(join(REPO_ROOT, 'package.json'));
  const plugin = await readJson(join(REPO_ROOT, '.claude-plugin', 'plugin.json'));
  const marketplace = await readJson(join(REPO_ROOT, '.claude-plugin', 'marketplace.json'));

  assert.equal(
    plugin.version,
    pkg.version,
    `.claude-plugin/plugin.json version (${plugin.version}) must match package.json version (${pkg.version}). Run: npm run version:sync`
  );
  assert.equal(
    marketplace.plugins[0].version,
    pkg.version,
    `.claude-plugin/marketplace.json plugins[0].version (${marketplace.plugins[0].version}) must match package.json version (${pkg.version}). Run: npm run version:sync`
  );
});
