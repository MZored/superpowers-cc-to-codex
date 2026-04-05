import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

test('verification-before-completion skill exists with upstream sync header and iron law', async () => {
  const skill = await read('skills/verification-before-completion/SKILL.md');
  assert.match(skill, /name: verification-before-completion/);
  assert.match(skill, /Upstream source: obra\/superpowers/);
  assert.match(skill, /NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE/);
});

test('receiving-code-review skill exists with upstream sync header and Codex review handling', async () => {
  const skill = await read('skills/receiving-code-review/SKILL.md');
  assert.match(skill, /name: receiving-code-review/);
  assert.match(skill, /Upstream source: obra\/superpowers/);
  assert.match(skill, /codex_review/);
  assert.match(skill, /NEVER|Forbidden/i);
});

test('dispatching-parallel-agents skill adapts Task dispatch to codex_implement MCP calls', async () => {
  const skill = await read('skills/dispatching-parallel-agents/SKILL.md');
  assert.match(skill, /name: dispatching-parallel-agents/);
  assert.match(skill, /Upstream source: obra\/superpowers/);
  assert.match(skill, /codex_implement/);
  assert.doesNotMatch(skill, /subagent_type/);
});

test('using-git-worktrees skill exists with safety verification steps', async () => {
  const skill = await read('skills/using-git-worktrees/SKILL.md');
  assert.match(skill, /name: using-git-worktrees/);
  assert.match(skill, /Upstream source: obra\/superpowers/);
  assert.match(skill, /git check-ignore/);
  assert.match(skill, /\.gitignore/);
});

test('research-brief covers repository structure, approaches, and risks with substance', async () => {
  const brief = await read('skills/brainstorming/prompts/research-brief.md');
  assert.match(brief, /repository structure|current patterns/i);
  assert.match(brief, /approach/i);
  assert.match(brief, /risk|tradeoff/i);
  assert.ok(brief.split('\n').length > 15, 'research-brief.md should have more than 15 lines of guidance');
});
