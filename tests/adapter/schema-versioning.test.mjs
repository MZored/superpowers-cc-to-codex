import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  SEMVER_PATTERN,
  buildExpectedSchemaId,
  validatePromptSchemaReferences,
  validateSchemaRegistry
} from '../../scripts/validate-schemas.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('schema registry covers every schema file with matching metadata', async () => {
  const result = await validateSchemaRegistry({ root: PROJECT_ROOT });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.schemaNames.sort(),
    [
      'brainstorm-research',
      'branch-analysis',
      'code-review',
      'codex-defaults',
      'debug-investigation',
      'implementer-result',
      'plan-draft',
      'spec-review'
    ].sort()
  );
});

test('schema ids are canonical GitHub URLs ending in the schema file name', () => {
  assert.equal(
    buildExpectedSchemaId('implementer-result.schema.json'),
    'https://github.com/mzored/superpowers-cc-to-codex/schemas/implementer-result.schema.json'
  );
});

test('schema versions use SemVer core format', async () => {
  const result = await validateSchemaRegistry({ root: PROJECT_ROOT });

  for (const schema of result.schemas) {
    assert.match(schema.version, SEMVER_PATTERN, `${schema.fileName} version must be SemVer`);
  }
});

test('prompt schema references point at live schemas and output requirement sections mention required keys', async () => {
  const result = await validatePromptSchemaReferences({ root: PROJECT_ROOT });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.ok(
    result.references.some((entry) => entry.schemaFile === 'debug-investigation.schema.json'),
    'debug prompt schema reference must be checked'
  );
});

test('validatePromptSchemaReferences flags references to nonexistent schemas', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sp-schema-ref-'));
  try {
    await mkdir(join(tmp, 'schemas'), { recursive: true });
    await mkdir(join(tmp, 'skills', 'fake-skill'), { recursive: true });
    await writeFile(
      join(tmp, 'schemas', 'real.schema.json'),
      JSON.stringify({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://github.com/mzored/superpowers-cc-to-codex/schemas/real.schema.json',
        version: '1.0.0',
        type: 'object',
        required: ['mustHave']
      })
    );
    await writeFile(
      join(tmp, 'skills', 'fake-skill', 'SKILL.md'),
      '# Fake\n\nReferences schemas/missing.schema.json and schemas/real.schema.json.\n'
    );
    const result = await validatePromptSchemaReferences({ root: tmp });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('missing.schema.json')));
    assert.ok(!result.errors.some((e) => e.includes('mustHave')));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('validatePromptSchemaReferences enforces required keys when Output Requirements section exists', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sp-schema-req-'));
  try {
    await mkdir(join(tmp, 'schemas'), { recursive: true });
    await mkdir(join(tmp, 'skills', 'fake-skill', 'prompts'), { recursive: true });
    await writeFile(
      join(tmp, 'schemas', 'real.schema.json'),
      JSON.stringify({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://github.com/mzored/superpowers-cc-to-codex/schemas/real.schema.json',
        version: '1.0.0',
        type: 'object',
        required: ['mustHave', 'alsoNeeded']
      })
    );
    await writeFile(
      join(tmp, 'skills', 'fake-skill', 'prompts', 'p.md'),
      '# Prompt\n\nUse schemas/real.schema.json.\n\n## Output Requirements\n\nProvide mustHave only.\n\n## Examples\n\nNothing here.\n'
    );
    const result = await validatePromptSchemaReferences({ root: tmp });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('alsoNeeded')));
    assert.ok(!result.errors.some((e) => e.includes('mustHave') && !e.includes('alsoNeeded')));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
