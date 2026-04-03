import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

test('execution workflow preserves review order and explicit status handling', async () => {
  const skill = await read('skills/subagent-driven-development/SKILL.md');
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

test('TDD skill dispatches codex-implementer with TDD-specific prompt', async () => {
  const skill = await read('skills/test-driven-development/SKILL.md');
  assert.match(skill, /subagent_type:\s*"codex-implementer"/);
  assert.match(skill, /tdd-implement-task\.md/);
  assert.match(skill, /red-green-refactor/i);
  assert.match(skill, /disable-model-invocation:\s*true/);
});

test('TDD prompt enforces test-first discipline', async () => {
  const prompt = await read('skills/test-driven-development/prompts/tdd-implement-task.md');
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

test('debugging and branch-finish skills dispatch named research subagents', async () => {
  const debugging = await read('skills/systematic-debugging/SKILL.md');
  const finishing = await read('skills/finishing-a-development-branch/SKILL.md');

  assert.match(debugging, /subagent_type:\s*"codex-debug-investigator"/);
  assert.match(finishing, /subagent_type:\s*"codex-branch-analyzer"/);
  assert.doesNotMatch(debugging, /codex-run\.mjs/);
  assert.doesNotMatch(finishing, /codex-run\.mjs/);
});

test('finishing-a-development-branch skill presents structured options', async () => {
  const skill = await read('skills/finishing-a-development-branch/SKILL.md');
  assert.match(skill, /codex-branch-analyzer/);
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

test('execution skills dispatch codex-implementer with structured prompt headers', async () => {
  const workflow = await read('skills/subagent-driven-development/SKILL.md');
  const tdd = await read('skills/test-driven-development/SKILL.md');

  assert.match(workflow, /subagent_type:\s*"codex-implementer"/);
  assert.match(workflow, /Task ID:\s*task-17/);
  assert.match(workflow, /RESUME_SESSION:/);
  assert.match(tdd, /PROMPT_FILE:\s*test-driven-development\/prompts\/tdd-implement-task\.md/);
  assert.doesNotMatch(tdd, /codex-run\.mjs/);
});
