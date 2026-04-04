import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOOL_DEFINITIONS,
  buildWorkflowRequest,
  getToolDefinition
} from '../../scripts/lib/mcp-tool-definitions.mjs';

test('review tool schema rejects uncommitted structured review at the contract level', () => {
  const reviewTool = getToolDefinition('codex_review');
  assert.equal(reviewTool.inputSchema.additionalProperties, false);
  assert.equal(Array.isArray(reviewTool.inputSchema.oneOf), true);
  assert.match(JSON.stringify(reviewTool.inputSchema), /reviewStyle/);
  assert.match(JSON.stringify(reviewTool.inputSchema), /uncommitted/);
});

test('read-only tools are annotated as readOnlyHint', () => {
  const readOnlyNames = TOOL_DEFINITIONS.filter((tool) => tool.annotations?.readOnlyHint).map((tool) => tool.name);
  assert.deepEqual(readOnlyNames.sort(), [
    'codex_branch_analysis', 'codex_debug', 'codex_plan', 'codex_research', 'codex_review'
  ]);
});

test('tool definitions expose all seven workflow tools', () => {
  assert.deepEqual(
    TOOL_DEFINITIONS.map((tool) => tool.name).sort(),
    ['codex_branch_analysis', 'codex_debug', 'codex_implement', 'codex_plan', 'codex_research', 'codex_resume', 'codex_review'].sort()
  );
});

test('buildWorkflowRequest maps typed review and resume arguments to adapter flags', () => {
  const reviewTool = getToolDefinition('codex_review');
  const resumeTool = getToolDefinition('codex_resume');

  const reviewRequest = buildWorkflowRequest({
    tool: reviewTool,
    args: { scope: { kind: 'base', base: 'origin/main' }, reviewStyle: 'structured', prompt: 'Review the MCP rewrite.' },
    cwd: '/repo',
    pluginRoot: '/plugin'
  });

  const resumeRequest = buildWorkflowRequest({
    tool: resumeTool,
    args: { taskId: 'task-17', sessionId: 'thread-123', prompt: 'Fix the review findings.', promptTemplate: 'tdd' },
    cwd: '/repo',
    pluginRoot: '/plugin'
  });

  assert.equal(reviewRequest.base, 'origin/main');
  assert.equal(reviewRequest.schemaPath, '/plugin/schemas/code-review.schema.json');
  assert.equal(resumeRequest.promptFile, '/plugin/skills/test-driven-development/prompts/tdd-implement-task.md');
});
