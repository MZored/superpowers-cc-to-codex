import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, relative, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_ROOT = resolve(__dirname, '..');

export const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';
export const SCHEMA_ID_BASE = 'https://github.com/mzored/superpowers-cc-to-codex/schemas/';
export const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function listFilesRecursive(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursive(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function schemaNameFromFile(fileName) {
  return fileName.replace(/\.schema\.json$/, '');
}

export function buildExpectedSchemaId(fileName) {
  return `${SCHEMA_ID_BASE}${fileName}`;
}

async function listSchemaFiles(root) {
  const schemaDir = join(root, 'schemas');
  const entries = await readdir(schemaDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.schema.json'))
    .map((entry) => entry.name)
    .sort();
}

export async function validateSchemaRegistry({ root = DEFAULT_ROOT } = {}) {
  const errors = [];
  const schemaDir = join(root, 'schemas');
  const indexPath = join(schemaDir, 'INDEX.json');
  const index = await readJson(indexPath);
  const schemaFiles = await listSchemaFiles(root);
  const indexSchemas = index.schemas && typeof index.schemas === 'object' ? index.schemas : {};
  const schemaNames = schemaFiles.map(schemaNameFromFile);
  const schemas = [];

  for (const fileName of schemaFiles) {
    const schemaName = schemaNameFromFile(fileName);
    const schema = await readJson(join(schemaDir, fileName));
    const version = schema.version;
    schemas.push({ fileName, schemaName, version });

    if (!(schemaName in indexSchemas)) {
      errors.push(`schemas/INDEX.json missing entry for ${schemaName}`);
    }

    if (schema.$schema !== DRAFT_2020_12) {
      errors.push(`${fileName} must declare $schema ${DRAFT_2020_12}`);
    }

    const expectedId = buildExpectedSchemaId(fileName);
    if (schema.$id !== expectedId) {
      errors.push(`${fileName} must declare $id ${expectedId}`);
    }

    if (typeof version !== 'string' || !SEMVER_PATTERN.test(version)) {
      errors.push(`${fileName} must declare a SemVer version`);
    }

    if (indexSchemas[schemaName] !== version) {
      errors.push(`${fileName} version ${version} must match INDEX entry ${indexSchemas[schemaName]}`);
    }
  }

  for (const schemaName of Object.keys(indexSchemas).sort()) {
    if (!schemaNames.includes(schemaName)) {
      errors.push(`schemas/INDEX.json entry ${schemaName} has no matching schema file`);
    }
  }

  if (typeof index.policy !== 'string' || index.policy.length === 0) {
    errors.push('schemas/INDEX.json must include a non-empty policy string');
  }

  return {
    valid: errors.length === 0,
    errors,
    schemaNames,
    schemas
  };
}

function outputRequirementsSection(markdown) {
  const match = markdown.match(/^## Output Requirements\s*$/m);
  if (!match) return null;
  return markdown.slice(match.index);
}

export async function validatePromptSchemaReferences({ root = DEFAULT_ROOT } = {}) {
  const errors = [];
  const schemaDir = join(root, 'schemas');
  const schemaFiles = new Set(await listSchemaFiles(root));
  const markdownFiles = (await listFilesRecursive(join(root, 'skills')))
    .filter((file) => extname(file) === '.md');
  const references = [];

  for (const file of markdownFiles) {
    const body = await readFile(file, 'utf8');
    const matches = [...body.matchAll(/schemas\/([a-z0-9-]+\.schema\.json)/g)];
    if (matches.length === 0) continue;

    for (const match of matches) {
      const schemaFile = match[1];
      const promptPath = relative(root, file);
      references.push({ promptPath, schemaFile });

      if (!schemaFiles.has(schemaFile)) {
        errors.push(`${promptPath} references missing schema ${schemaFile}`);
        continue;
      }

      const section = outputRequirementsSection(body);
      if (!section) continue;

      const schema = await readJson(join(schemaDir, schemaFile));
      for (const key of schema.required ?? []) {
        if (!new RegExp(`\\b${key}\\b`).test(section)) {
          errors.push(`${promptPath} Output Requirements must mention required key ${key}`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    references
  };
}

export async function runSchemaValidation({ root = DEFAULT_ROOT } = {}) {
  const registry = await validateSchemaRegistry({ root });
  const prompts = await validatePromptSchemaReferences({ root });
  return {
    valid: registry.valid && prompts.valid,
    errors: [...registry.errors, ...prompts.errors],
    registry,
    prompts
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runSchemaValidation({ root: process.cwd() });
  if (!result.valid) {
    for (const error of result.errors) {
      console.error(error);
    }
    process.exit(1);
  }

  console.log(`validated ${result.registry.schemas.length} schemas and ${result.prompts.references.length} prompt references`);
}
