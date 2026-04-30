import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
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
