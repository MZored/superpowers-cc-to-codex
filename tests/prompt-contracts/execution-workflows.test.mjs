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

test('implementer and reviewer agents forward to the adapter without doing git work themselves', async () => {
  const implementer = await read('agents/codex-implementer.md');
  const reviewer = await read('agents/codex-reviewer.md');
  assert.match(implementer, /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/codex-run\.mjs.*implement/);
  assert.match(reviewer, /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/codex-run\.mjs.*review/);
  assert.doesNotMatch(implementer, /git commit/);
  assert.doesNotMatch(reviewer, /git commit/);
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

test('branch-analyzer agent forwards to the adapter in research mode', async () => {
  const agent = await read('agents/codex-branch-analyzer.md');
  assert.match(agent, /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/codex-run\.mjs.*research/);
  assert.match(agent, /branch-analysis\.schema\.json/);
  assert.doesNotMatch(agent, /git commit/);
  assert.doesNotMatch(agent, /git merge/);
  assert.doesNotMatch(agent, /git push/);
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

test('implementer agent documents task headers, resume headers, and prompt-file overrides', async () => {
  const implementer = await read('agents/codex-implementer.md');
  assert.match(implementer, /^---[\s\S]*tools:\s*Bash/m);
  assert.match(implementer, /Task ID:/);
  assert.match(implementer, /RESUME_SESSION:/);
  assert.match(implementer, /PROMPT_FILE:/);
  assert.match(implementer, /codex-run\.mjs.*resume/);
});

test('reviewer agent documents review headers and review-type routing', async () => {
  const reviewer = await read('agents/codex-reviewer.md');
  assert.match(reviewer, /^---[\s\S]*tools:\s*Bash/m);
  assert.match(reviewer, /REVIEW_TYPE:\s*structured/);
  assert.match(reviewer, /REVIEW_TYPE:\s*advisory/);
  assert.match(reviewer, /REVIEW_TYPE:\s*commit/);
  assert.match(reviewer, /REVIEW_TYPE:\s*uncommitted/);
  assert.match(reviewer, /codex-run\.mjs.*review/);
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
