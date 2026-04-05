import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProjectConfig } from '../../scripts/lib/codex-project-config.mjs';

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
