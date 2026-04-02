import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function readJson(relativePath) {
  const url = new URL(`../../${relativePath}`, import.meta.url);
  return JSON.parse(await readFile(url, 'utf8'));
}

test('plugin manifest exists and declares the fork metadata', async () => {
  const plugin = await readJson('.claude-plugin/plugin.json');
  assert.equal(plugin.name, 'superpowers-codex-fork');
  assert.match(plugin.description, /Codex-backed workflow/i);
});

test('marketplace manifest exposes exactly one plugin from this repo', async () => {
  const marketplace = await readJson('.claude-plugin/marketplace.json');
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, 'superpowers-codex-fork');
  assert.equal(marketplace.plugins[0].source, './');
});

test('package.json wires the maintainer scripts', async () => {
  const pkg = await readJson('package.json');
  assert.equal(pkg.type, 'module');
  assert.ok(pkg.scripts.test);
  assert.ok(pkg.scripts['validate:plugin']);
  assert.ok(pkg.scripts.doctor);
});
