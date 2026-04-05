import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

async function read(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

async function listSkillDirectories() {
  const entries = await readdir(new URL('../../skills/', import.meta.url), { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
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

test('CLAUDE.md Forked Skills table lists every skill directory', async () => {
  const claudeMd = await read('CLAUDE.md');
  const skills = await listSkillDirectories();
  for (const skill of skills) {
    assert.match(
      claudeMd,
      new RegExp(`\`${skill}\``),
      `CLAUDE.md Forked Skills table missing entry for '${skill}'`
    );
  }
});

test('CLAUDE.md documents Claude-side-only skills as invariant exception', async () => {
  const claudeMd = await read('CLAUDE.md');
  assert.match(
    claudeMd,
    /Claude-side(-|\s)only|pure discipline|exempt/i,
    'CLAUDE.md skill-authoring section must document the Claude-side-only exception'
  );
  assert.match(claudeMd, /verification-before-completion/);
  assert.match(claudeMd, /using-git-worktrees/);
});

test('.claude/rules/skills.md anti-pattern wording acknowledges Claude-side exception', async () => {
  const rules = await read('.claude/rules/skills.md');
  assert.match(
    rules,
    /Claude-side|exempt|discipline/i,
    '.claude/rules/skills.md must acknowledge Claude-side-only exemption'
  );
});

function stripDivergenceComments(body) {
  return body.replace(/<!--[\s\S]*?-->/g, '');
}

test('dispatching-parallel-agents has no stale upstream Task() or subagent references', async () => {
  const raw = await read('skills/dispatching-parallel-agents/SKILL.md');
  const skill = stripDivergenceComments(raw);
  assert.doesNotMatch(skill, /\bTask\(/, 'Stale upstream Task() call found in active content');
  assert.doesNotMatch(skill, /general-purpose/, 'Stale upstream general-purpose agent reference');
  assert.doesNotMatch(skill, /subagent_type/, 'Stale upstream subagent_type parameter');
});

test('dispatching-parallel-agents notes sessionId capture for codex_resume', async () => {
  const skill = await read('skills/dispatching-parallel-agents/SKILL.md');
  assert.match(
    skill,
    /sessionId[\s\S]*response|returned[\s\S]*sessionId|capture[\s\S]*sessionId/i,
    'Skill must explain that codex_implement response returns sessionId needed by codex_resume'
  );
});

test('codex_implement JSON examples use only valid MCP tool keys', async () => {
  const skill = await read('skills/dispatching-parallel-agents/SKILL.md');
  const allowedArgKeys = new Set([
    'taskId', 'prompt', 'promptTemplate', 'workspaceRoot',
    'model', 'effort', 'serviceTier', 'timeoutMs', 'includeRawOutput'
  ]);
  const allowedTopKeys = new Set(['tool', 'arguments']);
  const blocks = [...skill.matchAll(/```json\n([\s\S]*?)\n```/g)];
  assert.ok(blocks.length > 0, 'expected at least one JSON example');
  for (const [, body] of blocks) {
    const parsed = JSON.parse(body);
    for (const key of Object.keys(parsed)) {
      assert.ok(allowedTopKeys.has(key), `Unknown top-level key '${key}' in example`);
    }
    if (parsed.arguments) {
      for (const key of Object.keys(parsed.arguments)) {
        assert.ok(allowedArgKeys.has(key), `Unknown argument key '${key}' in codex_implement example`);
      }
      assert.ok(parsed.arguments.taskId, 'codex_implement example must include taskId');
    }
  }
});

test('research-brief references a schema file that exists on disk', async () => {
  const brief = await read('skills/brainstorming/prompts/research-brief.md');
  const match = brief.match(/schemas\/([a-z0-9-]+\.schema\.json)/);
  assert.ok(match, 'research-brief.md must reference a schema file in schemas/');
  const schemaText = await read(`schemas/${match[1]}`);
  const schema = JSON.parse(schemaText);
  assert.ok(schema.required, 'referenced schema must declare required fields');
});

test('receiving-code-review documents trust hierarchy for feedback sources', async () => {
  const skill = await read('skills/receiving-code-review/SKILL.md');
  assert.match(
    skill,
    /trust (hierarchy|order|level)|partner\s*>\s*|prioriti[sz]e/i,
    'Source-Specific Handling section must explain the trust hierarchy between sources'
  );
});

test('Claude-side-only skills flag upstream-namespace collision in divergence header', async () => {
  for (const skill of ['verification-before-completion', 'using-git-worktrees']) {
    const body = await read(`skills/${skill}/SKILL.md`);
    assert.match(
      body,
      /collision|also (ships|exists) (in|under) upstream|duplicate|superpowers:/i,
      `${skill} must note upstream-namespace collision in divergence header`
    );
  }
});

test('using-git-worktrees uses consistent bare skill references in Integration section', async () => {
  const skill = await read('skills/using-git-worktrees/SKILL.md');
  const integrationSection = skill.split('## Integration')[1] ?? '';
  assert.doesNotMatch(
    integrationSection,
    /superpowers-cc-to-codex:/,
    'Integration section should use bare skill names, matching sibling references'
  );
});
