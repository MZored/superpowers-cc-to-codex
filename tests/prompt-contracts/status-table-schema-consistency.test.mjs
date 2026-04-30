import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const REPO_ROOT = new URL('../../', import.meta.url);

// Maps each MCP-backed skill to the schema its primary tool returns.
// codex_implement and codex_resume share implementer-result.
const SKILL_TO_SCHEMA = {
  'brainstorming-codex': 'brainstorm-research.schema.json',
  'writing-plans-codex': 'plan-draft.schema.json',
  'subagent-driven-development-codex': 'implementer-result.schema.json',
  'requesting-code-review-codex': 'code-review.schema.json',
  'systematic-debugging-codex/PHASE_2': 'debug-investigation.schema.json',
  'systematic-debugging-codex/PHASE_4': 'implementer-result.schema.json',
  'test-driven-development-codex': 'implementer-result.schema.json',
  'finishing-a-development-branch-codex': 'branch-analysis.schema.json',
  'dispatching-parallel-agents-codex': 'implementer-result.schema.json'
};

async function readSchema(filename) {
  return JSON.parse(await readFile(new URL(`schemas/${filename}`, REPO_ROOT), 'utf8'));
}

async function readSkill(skillDir) {
  return readFile(new URL(`skills/${skillDir}/SKILL.md`, REPO_ROOT), 'utf8');
}

function schemaHasStatusEnum(schema, expectedValues) {
  const statusProp = schema?.properties?.status;
  if (!statusProp || !Array.isArray(statusProp.enum)) return false;
  return expectedValues.every((v) => statusProp.enum.includes(v));
}

// A SKILL.md that mentions DONE_WITH_CONCERNS / NEEDS_CONTEXT in a status
// table is asking Claude to read those values out of the Codex result. That
// only works if at least one of the schemas the skill's tool returns has the
// status enum defined. If the SKILL.md mentions the enum but no schema for
// the relevant phase defines it, Claude will look for a field that's never
// emitted — silent failure mode.
//
// We bind the assertion at the table level rather than the file level: each
// individual status-handling table in a SKILL.md must map to a phase whose
// schema actually declares status with the expected enum.
test('every status-handling table in a SKILL.md maps to a schema that defines the status enum', async () => {
  const ENUM_TOKENS = ['DONE_WITH_CONCERNS', 'NEEDS_CONTEXT', 'BLOCKED'];
  const ENUM_VALUES = ['DONE', 'DONE_WITH_CONCERNS', 'NEEDS_CONTEXT', 'BLOCKED'];

  const skillDirs = (await readdir(new URL('skills/', REPO_ROOT), { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const violations = [];

  for (const skillDir of skillDirs) {
    let body;
    try {
      body = await readSkill(skillDir);
    } catch {
      continue;
    }
    // Count status-handling tables: header line is "| Status ... | Action |".
    const tableHeaderMatches = body.match(/^\|\s*Status[^|]*\|\s*Action\s*\|/gm) ?? [];
    if (tableHeaderMatches.length === 0) continue;

    const enumTokenCount = ENUM_TOKENS.reduce(
      (sum, token) => sum + (body.match(new RegExp(token, 'g'))?.length ?? 0),
      0
    );
    if (enumTokenCount === 0) continue;

    const schemaMappings = Object.entries(SKILL_TO_SCHEMA).filter(([key]) =>
      key.startsWith(skillDir)
    );
    if (schemaMappings.length === 0) continue;

    const schemas = await Promise.all(
      schemaMappings.map(async ([key, file]) => ({
        key,
        file,
        schema: await readSchema(file),
        hasEnum: schemaHasStatusEnum(await readSchema(file), ENUM_VALUES)
      }))
    );

    const validSchemaCount = schemas.filter((s) => s.hasEnum).length;
    if (tableHeaderMatches.length > validSchemaCount) {
      violations.push(
        `${skillDir}/SKILL.md has ${tableHeaderMatches.length} status table(s) referencing the implementer enum but only ${validSchemaCount} of its phase schema(s) define it (mappings: ${schemas
          .map((s) => `${s.key}→${s.file}${s.hasEnum ? '✓' : '✗'}`)
          .join(', ')})`
      );
    }
  }

  assert.deepEqual(violations, [], `Status-table/schema mismatch:\n  ${violations.join('\n  ')}`);
});
