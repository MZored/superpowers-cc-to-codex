import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadProjectConfig, scaffoldProjectConfig } from '../../scripts/lib/codex-project-config.mjs';

test('loads valid config from .claude/codex-defaults.json', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-config-'));
  await mkdir(join(root, '.claude'), { recursive: true });
  await writeFile(
    join(root, '.claude', 'codex-defaults.json'),
    JSON.stringify({ model: 'gpt-5.4', serviceTier: 'fast' })
  );

  const config = await loadProjectConfig(root);
  assert.equal(config.model, 'gpt-5.4');
  assert.equal(config.serviceTier, 'fast');
});

test('returns empty object when config file is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-config-'));
  const config = await loadProjectConfig(root);
  assert.deepEqual(config, {});
});

test('returns empty object on invalid JSON', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-config-'));
  await mkdir(join(root, '.claude'), { recursive: true });
  await writeFile(join(root, '.claude', 'codex-defaults.json'), '{not json');

  const config = await loadProjectConfig(root);
  assert.deepEqual(config, {});
});

test('returns empty object when config is not a plain object', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-config-'));
  await mkdir(join(root, '.claude'), { recursive: true });
  await writeFile(join(root, '.claude', 'codex-defaults.json'), '"just a string"');

  const config = await loadProjectConfig(root);
  assert.deepEqual(config, {});
});

test('strips unknown keys from config', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-config-'));
  await mkdir(join(root, '.claude'), { recursive: true });
  await writeFile(
    join(root, '.claude', 'codex-defaults.json'),
    JSON.stringify({ model: 'gpt-5.4', unknownKey: 'should be removed', effort: 'high' })
  );

  const config = await loadProjectConfig(root);
  assert.equal(config.model, 'gpt-5.4');
  assert.equal(config.effort, 'high');
  assert.equal(config.unknownKey, undefined);
});

test('validates enum values — rejects invalid effort', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-config-'));
  await mkdir(join(root, '.claude'), { recursive: true });
  await writeFile(
    join(root, '.claude', 'codex-defaults.json'),
    JSON.stringify({ effort: 'turbo' })
  );

  const config = await loadProjectConfig(root);
  assert.equal(config.effort, undefined, 'invalid effort should be stripped');
});

test('accepts current Codex reasoning effort values', async () => {
  for (const effort of ['minimal', 'xhigh']) {
    const root = await mkdtemp(join(tmpdir(), 'sp-config-'));
    await mkdir(join(root, '.claude'), { recursive: true });
    await writeFile(
      join(root, '.claude', 'codex-defaults.json'),
      JSON.stringify({ effort })
    );

    const config = await loadProjectConfig(root);
    assert.equal(config.effort, effort);
  }
});

test('validates enum values — rejects invalid serviceTier', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-config-'));
  await mkdir(join(root, '.claude'), { recursive: true });
  await writeFile(
    join(root, '.claude', 'codex-defaults.json'),
    JSON.stringify({ serviceTier: 'premium' })
  );

  const config = await loadProjectConfig(root);
  assert.equal(config.serviceTier, undefined, 'invalid serviceTier should be stripped');
});

test('accepts all known config keys', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-config-'));
  await mkdir(join(root, '.claude'), { recursive: true });
  await writeFile(
    join(root, '.claude', 'codex-defaults.json'),
    JSON.stringify({
      model: 'gpt-5.4',
      modelMini: 'gpt-5.4-mini',
      effort: 'medium',
      serviceTier: 'fast'
    })
  );

  const config = await loadProjectConfig(root);
  assert.equal(config.model, 'gpt-5.4');
  assert.equal(config.modelMini, 'gpt-5.4-mini');
  assert.equal(config.effort, 'medium');
  assert.equal(config.serviceTier, 'fast');
});

// --- scaffoldProjectConfig tests ---

test('scaffolds config when file is missing — defers everything but service tier to ~/.codex/config.toml', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-config-'));
  const result = await scaffoldProjectConfig(root);
  assert.equal(result, true);

  const content = JSON.parse(await readFile(join(root, '.claude', 'codex-defaults.json'), 'utf8'));
  assert.equal(content.model, 'auto');
  assert.equal(content.modelMini, 'auto');
  assert.equal(content.effort, 'auto');
  assert.equal(content.serviceTier, 'fast');
});

test('scaffolds config and creates .claude directory when missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-config-'));
  await scaffoldProjectConfig(root);

  const content = await readFile(join(root, '.claude', 'codex-defaults.json'), 'utf8');
  assert.ok(content.length > 0, '.claude dir and file should be created');
});

test('does not overwrite existing config', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-config-'));
  await mkdir(join(root, '.claude'), { recursive: true });
  const custom = JSON.stringify({ model: 'custom-model' });
  await writeFile(join(root, '.claude', 'codex-defaults.json'), custom);

  const result = await scaffoldProjectConfig(root);
  assert.equal(result, false);

  const content = await readFile(join(root, '.claude', 'codex-defaults.json'), 'utf8');
  assert.equal(content, custom, 'existing file should not be overwritten');
});

test('scaffolded config round-trips through loadProjectConfig', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-config-'));
  await scaffoldProjectConfig(root);

  const config = await loadProjectConfig(root);
  assert.equal(config.model, 'auto');
  assert.equal(config.modelMini, 'auto');
  assert.equal(config.effort, 'auto');
  assert.equal(config.serviceTier, 'fast');
});

test('loadProjectConfig accepts effort=auto', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-config-'));
  await mkdir(join(root, '.claude'), { recursive: true });
  await writeFile(
    join(root, '.claude', 'codex-defaults.json'),
    JSON.stringify({ effort: 'auto' })
  );
  const config = await loadProjectConfig(root);
  assert.equal(config.effort, 'auto');
});
