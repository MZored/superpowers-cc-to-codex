import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path/posix';

async function readJson(relativePath) {
  const url = new URL(`../../${relativePath}`, import.meta.url);
  return JSON.parse(await readFile(url, 'utf8'));
}

test('plugin manifest exists and declares the fork metadata', async () => {
  const plugin = await readJson('.claude-plugin/plugin.json');
  assert.equal(plugin.name, 'superpowers-cc-to-codex');
  assert.match(plugin.description, /Codex-backed/i);
});

test('marketplace manifest exposes exactly one plugin from this repo', async () => {
  const marketplace = await readJson('.claude-plugin/marketplace.json');
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.name, 'superpowers-cc-to-codex');
  assert.equal(marketplace.plugins[0].name, 'superpowers-cc-to-codex');
  assert.equal(marketplace.plugins[0].source, './');
});

test('package.json wires the maintainer scripts', async () => {
  const pkg = await readJson('package.json');
  assert.equal(pkg.name, 'superpowers-cc-to-codex');
  assert.equal(pkg.type, 'module');
  assert.ok(pkg.scripts.test);
  assert.ok(pkg.scripts['validate:plugin']);
  assert.ok(pkg.scripts.doctor);
});

test('plugin manifest registers the bundled MCP server', async () => {
  const plugin = await readJson('.claude-plugin/plugin.json');
  assert.equal(plugin.mcpServers.codex.command, 'node');
  assert.match(plugin.mcpServers.codex.args[0], /scripts\/mcp-server\.mjs$/);
});

test('public repo does not track internal planning artifacts', async () => {
  const gitignore = await readFile(new URL('../../.gitignore', import.meta.url), 'utf8');
  const repoEntries = await readdir(new URL('../../', import.meta.url), {
    recursive: true,
    withFileTypes: true,
  });
  const repoFiles = repoEntries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath === '.' ? '' : entry.parentPath, entry.name));

  assert.match(gitignore, /^docs\/superpowers\/plans\/$/m);
  assert.match(gitignore, /^docs\/superpowers\/specs\/$/m);
  assert.match(gitignore, /^\/20\?\?-\?\?-\?\?-\*-design\*\.md$/m);

  assert.ok(
    repoFiles.every((file) => !file.startsWith('docs/superpowers/plans/')),
    'expected docs/superpowers/plans/ to stay out of the public repository tree',
  );
  assert.ok(
    repoFiles.every((file) => !file.startsWith('docs/superpowers/specs/')),
    'expected docs/superpowers/specs/ to stay out of the public repository tree',
  );
  assert.ok(
    repoFiles.every((file) => !/^20\d{2}-\d{2}-\d{2}-.*-design.*\.md$/.test(file)),
    'expected ad-hoc dated design notes to stay out of the public repository tree',
  );
});
