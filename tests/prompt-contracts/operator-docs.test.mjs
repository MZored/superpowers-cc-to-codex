import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

test('doctor command points to the maintained preflight checks', async () => {
  const doctor = await read('commands/doctor.md');
  assert.match(doctor, /detect-codex\.mjs/);
  assert.match(doctor, /check-codex-cli\.mjs/);
  assert.match(doctor, /claude plugin validate/);
});

test('README documents marketplace install, upstream superpowers reference, license, and all forked skills', async () => {
  const readme = await read('README.md');
  assert.match(readme, /\/plugin marketplace add mzored\/superpowers-cc-to-codex/);
  assert.match(readme, /\/plugin install superpowers-cc-to-codex@superpowers-cc-to-codex/);
  assert.match(readme, /https:\/\/github\.com\/obra\/superpowers/);
  assert.match(readme, /MIT/);

  const expectedSkills = [
    'brainstorming-codex', 'writing-plans-codex', 'subagent-driven-development-codex',
    'requesting-code-review-codex', 'receiving-code-review-codex', 'systematic-debugging-codex',
    'test-driven-development-codex', 'finishing-a-development-branch-codex',
    'dispatching-parallel-agents-codex', 'verification-before-completion-codex', 'using-git-worktrees-codex'
  ];
  for (const skill of expectedSkills) {
    assert.match(readme, new RegExp(skill), `README should mention skill: ${skill}`);
  }
});

test('doctor command documents MCP-aware validation', async () => {
  const doctor = await read('commands/doctor.md');
  assert.match(doctor, /mcp-server\.mjs/);
  assert.match(doctor, /claude plugin validate \.claude-plugin\/plugin\.json/);
});

test('architecture docs describe the MCP server instead of forwarder agents as the primary path', async () => {
  const architecture = await read('docs/architecture.md');
  assert.match(architecture, /MCP server/i);
  assert.match(architecture, /codex-run\.mjs/);
  assert.doesNotMatch(architecture, /forwarders handle research/i);
});

test('operator docs cover codex state inspection and workflow examples', async () => {
  const doctor = await read('commands/doctor.md');
  const state = await read('commands/codex-state.md');
  const readme = await read('README.md');

  assert.match(state, /list-codex-state\.mjs/);
  assert.match(state, /\$\{CLAUDE_PLUGIN_ROOT\}/);
  assert.match(state, /workspace resume/i);
  assert.match(state, /CLAUDE_PLUGIN_DATA/);
  assert.match(doctor, /commands\/codex-state\.md/);
  assert.match(readme, /brainstorming/);
  assert.match(readme, /writing-plans/);
  assert.match(readme, /subagent-driven-development/);
  assert.match(readme, /requesting-code-review/);
  assert.match(readme, /test-driven-development/);
  assert.match(readme, /finishing-a-development-branch/);
  assert.match(readme, /codex_resume/i);
  assert.match(readme, /notifications\/progress/);
  assert.match(readme, /SUPERPOWERS_CODEX_EXPERIMENTAL_TASKS=implement-resume/);
});

test('README serviceTier default matches the scaffolded sample config', async () => {
  const readme = await read('README.md');
  assert.match(
    readme,
    /\|\s*`serviceTier`\s*\|[^\n]*\|\s*`fast`\s*\|/,
    'README config table should document the generated serviceTier default'
  );
});

test('branch finishing cleanup policy is consistent for PR option', async () => {
  const skill = await read('skills/finishing-a-development-branch-codex/SKILL.md');
  assert.match(skill, /Option 2: Push and Create PR[\s\S]*Then: Cleanup worktree \(Step 5\)/);
  assert.match(skill, /For Options 1, 2, 4/);
  assert.match(skill, /Clean up worktree for Options 1, 2, and 4 only/);
});

test('README documents troubleshooting and observability environment variables', async () => {
  const readme = await read('README.md');

  assert.match(readme, /## Troubleshooting/);
  assert.match(readme, /ETIMEDOUT|connection reset/i);
  assert.match(readme, /codex_resume/);
  assert.match(readme, /codex login/);
  assert.match(readme, /model not available/i);
  assert.match(readme, /status.*ok.*partial.*error/is);
  assert.match(readme, /SUPERPOWERS_CODEX_LOG_FILE/);
  assert.match(readme, /SUPERPOWERS_CODEX_LOG=1/);
  assert.match(readme, /npm run validate:schemas/);
});

test('CLAUDE documents event log and schema validation surfaces', async () => {
  const claudeMd = await read('CLAUDE.md');

  assert.match(claudeMd, /scripts\/lib\/codex-events\.mjs/);
  assert.match(claudeMd, /SUPERPOWERS_CODEX_LOG_FILE/);
  assert.match(claudeMd, /schemas\/INDEX\.json/);
  assert.match(claudeMd, /npm run validate:schemas/);
});
