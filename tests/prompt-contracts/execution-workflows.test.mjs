import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

test('execution workflow preserves review order and explicit status handling', async () => {
  const skill = await read('skills/subagent-driven-development-codex/SKILL.md');
  assert.match(skill, /spec compliance/i);
  assert.match(skill, /code quality/i);
  assert.match(skill, /DONE_WITH_CONCERNS/);
  assert.match(skill, /NEEDS_CONTEXT/);
});

test('TDD skill uses codex_implement MCP tool with TDD prompt template', async () => {
  const skill = await read('skills/test-driven-development-codex/SKILL.md');
  assert.match(skill, /codex_implement/);
  assert.match(skill, /promptTemplate:\s*"tdd"/);
  assert.match(skill, /tdd-implement-task\.md/);
  assert.match(skill, /red-green-refactor/i);
  assert.match(skill, /disable-model-invocation:\s*true/);
  assert.doesNotMatch(skill, /subagent_type/);
});

test('TDD prompt enforces test-first discipline', async () => {
  const prompt = await read('skills/test-driven-development-codex/prompts/tdd-implement-task.md');
  assert.match(prompt, /NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST/);
  assert.match(prompt, /implementer-result\.schema\.json/);
});

test('implementation prompts define outcome, side effects, and evidence contracts', async () => {
  for (const relativePath of [
    'skills/subagent-driven-development-codex/prompts/implement-task.md',
    'skills/test-driven-development-codex/prompts/tdd-implement-task.md'
  ]) {
    const prompt = await read(relativePath);
    assert.match(prompt, /Expected outcome/i, `${relativePath} should state the expected outcome`);
    assert.match(prompt, /Allowed side effects/i, `${relativePath} should constrain side effects`);
    assert.match(prompt, /Verification evidence/i, `${relativePath} should require evidence`);
  }
});

test('subagent-driven development reviews each task from a captured base revision', async () => {
  const skill = await read('skills/subagent-driven-development-codex/SKILL.md');
  assert.match(skill, /Capture task base/i);
  assert.match(skill, /TASK_BASE_SHA/);
  assert.match(skill, /substitute the captured TASK_BASE_SHA value/i);
  assert.doesNotMatch(skill, /"base": "TASK_BASE_SHA"/);
  assert.doesNotMatch(skill, /"base": "origin\/main"/);
});

test('TDD output schema supports explicit red-green evidence', async () => {
  const schema = JSON.parse(await read('schemas/implementer-result.schema.json'));
  const prompt = await read('skills/test-driven-development-codex/prompts/tdd-implement-task.md');

  assert.ok(schema.properties.red_green_evidence, 'implementer schema should allow red_green_evidence');
  assert.match(prompt, /red_green_evidence/);
});

test('debugging and branch-finish skills use MCP tool calls instead of subagent types', async () => {
  const debugging = await read('skills/systematic-debugging-codex/SKILL.md');
  const finishing = await read('skills/finishing-a-development-branch-codex/SKILL.md');

  assert.match(debugging, /codex_debug/);
  assert.match(finishing, /codex_branch_analysis/);
  assert.doesNotMatch(debugging, /subagent_type/);
  assert.doesNotMatch(finishing, /subagent_type/);
});

test('finishing-a-development-branch skill presents structured options', async () => {
  const skill = await read('skills/finishing-a-development-branch-codex/SKILL.md');
  assert.match(skill, /codex_branch_analysis/);
  assert.match(skill, /Merge back to/);
  assert.match(skill, /Pull Request/);
  assert.match(skill, /Keep the branch as-is/);
  assert.match(skill, /Discard this work/);
  assert.match(skill, /disable-model-invocation:\s*true/);
});

test('execution workflows preserve TDD, review style, and resume semantics with MCP calls', async () => {
  const workflow = await read('skills/subagent-driven-development-codex/SKILL.md');
  const tdd = await read('skills/test-driven-development-codex/SKILL.md');
  const review = await read('skills/requesting-code-review-codex/SKILL.md');

  assert.match(workflow, /codex_implement/);
  assert.match(workflow, /codex_resume/);
  assert.match(workflow, /codex_review/);
  assert.match(tdd, /"promptTemplate":\s*"tdd"/);
  assert.match(review, /"reviewStyle":\s*"advisory"/);
  assert.match(review, /"kind":\s*"uncommitted"/);
  assert.doesNotMatch(workflow, /subagent_type/);
  assert.doesNotMatch(review, /subagent_type/);
});
