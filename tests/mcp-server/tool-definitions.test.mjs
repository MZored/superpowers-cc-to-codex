import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  TOOL_DEFINITIONS,
  buildWorkflowRequest,
  getToolDefinition
} from '../../scripts/lib/mcp-tool-definitions.mjs';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('review tool schema has no top-level oneOf/anyOf/allOf (Claude API restriction)', () => {
  const reviewTool = getToolDefinition('codex_review');
  assert.equal(reviewTool.inputSchema.additionalProperties, false);
  assert.equal(reviewTool.inputSchema.oneOf, undefined);
  assert.equal(reviewTool.inputSchema.anyOf, undefined);
  assert.equal(reviewTool.inputSchema.allOf, undefined);
  assert.ok(reviewTool.inputSchema.required.includes('reviewStyle'));
  assert.ok(reviewTool.inputSchema.required.includes('scope'));
  assert.match(JSON.stringify(reviewTool.inputSchema), /uncommitted/);
});

test('no MCP tool schema uses top-level oneOf/anyOf/allOf', () => {
  for (const tool of TOOL_DEFINITIONS) {
    assert.equal(tool.inputSchema.oneOf, undefined, `${tool.name} has top-level oneOf`);
    assert.equal(tool.inputSchema.anyOf, undefined, `${tool.name} has top-level anyOf`);
    assert.equal(tool.inputSchema.allOf, undefined, `${tool.name} has top-level allOf`);
  }
});

test('buildWorkflowRequest rejects structured review with uncommitted scope', () => {
  const reviewTool = getToolDefinition('codex_review');
  assert.throws(
    () =>
      buildWorkflowRequest({
        tool: reviewTool,
        args: { scope: { kind: 'uncommitted' }, reviewStyle: 'structured', prompt: 'x' },
        cwd: '/repo',
        pluginRoot: '/plugin'
      }),
    /structured reviews require a concrete scope/
  );
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
  assert.equal(resumeRequest.promptFile, '/plugin/skills/test-driven-development-codex/prompts/tdd-implement-task.md');
});

test('every tool request resolves to existing promptFile and schemaPath on disk', async () => {
  // Enumerate every branch of buildWorkflowRequest so both promptTemplate and
  // scope/reviewStyle variants are exercised.
  const invocations = [
    { name: 'codex_research', args: { prompt: 'x' } },
    { name: 'codex_plan', args: { prompt: 'x' } },
    { name: 'codex_implement', args: { prompt: 'x' } },
    { name: 'codex_implement', args: { prompt: 'x', promptTemplate: 'tdd' } },
    {
      name: 'codex_review',
      args: { prompt: 'x', reviewStyle: 'structured', scope: { kind: 'base', base: 'main' } }
    },
    {
      name: 'codex_review',
      args: { prompt: 'x', reviewStyle: 'advisory', scope: { kind: 'uncommitted' } }
    },
    { name: 'codex_debug', args: { prompt: 'x' } },
    { name: 'codex_branch_analysis', args: { prompt: 'x' } },
    { name: 'codex_resume', args: { prompt: 'x', sessionId: 's', taskId: 't' } },
    {
      name: 'codex_resume',
      args: { prompt: 'x', sessionId: 's', taskId: 't', promptTemplate: 'tdd' }
    }
  ];

  for (const { name, args } of invocations) {
    const tool = getToolDefinition(name);
    const request = buildWorkflowRequest({
      tool,
      args,
      cwd: '/repo',
      pluginRoot: PLUGIN_ROOT
    });

    await assert.doesNotReject(
      access(request.promptFile),
      `${name}: promptFile missing on disk: ${request.promptFile}`
    );

    if (request.schemaPath) {
      await assert.doesNotReject(
        access(request.schemaPath),
        `${name}: schemaPath missing on disk: ${request.schemaPath}`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Resolution chain: args > projectConfig > tool defaults
// ---------------------------------------------------------------------------

test('buildWorkflowRequest: explicit args override projectConfig and defaults', () => {
  const tool = getToolDefinition('codex_implement');
  const request = buildWorkflowRequest({
    tool,
    args: { prompt: 'x', model: 'custom-model', effort: 'high', serviceTier: 'fast' },
    cwd: '/repo',
    pluginRoot: PLUGIN_ROOT,
    projectConfig: { model: 'config-model', effort: 'low', serviceTier: undefined }
  });

  assert.equal(request.model, 'custom-model');
  assert.equal(request.effort, 'high');
  assert.equal(request.serviceTier, 'fast');
});

test('buildWorkflowRequest: projectConfig overrides tool defaults', () => {
  const tool = getToolDefinition('codex_implement');
  const request = buildWorkflowRequest({
    tool,
    args: { prompt: 'x' },
    cwd: '/repo',
    pluginRoot: PLUGIN_ROOT,
    projectConfig: { model: 'config-model', effort: 'high', serviceTier: 'fast' }
  });

  assert.equal(request.model, 'config-model');
  assert.equal(request.effort, 'high');
  assert.equal(request.serviceTier, 'fast');
});

test('buildWorkflowRequest: tool defaults used when no args or config', () => {
  const tool = getToolDefinition('codex_implement');
  const request = buildWorkflowRequest({
    tool,
    args: { prompt: 'x' },
    cwd: '/repo',
    pluginRoot: PLUGIN_ROOT,
    projectConfig: {}
  });

  assert.equal(request.model, tool.defaults.model);
  assert.equal(request.effort, tool.defaults.effort);
  assert.equal(request.serviceTier, undefined);
});

test('buildWorkflowRequest: mini tools use projectConfig.modelMini', () => {
  const miniTools = ['codex_research', 'codex_plan', 'codex_debug', 'codex_branch_analysis'];
  for (const name of miniTools) {
    const tool = getToolDefinition(name);
    const request = buildWorkflowRequest({
      tool,
      args: { prompt: 'x' },
      cwd: '/repo',
      pluginRoot: PLUGIN_ROOT,
      projectConfig: { model: 'full-model', modelMini: 'mini-model' }
    });
    assert.equal(request.model, 'mini-model', `${name} should use modelMini from config`);
  }
});

test('buildWorkflowRequest: full tools use projectConfig.model (not modelMini)', () => {
  const fullToolArgs = [
    { name: 'codex_implement', args: { prompt: 'x' } },
    { name: 'codex_review', args: { prompt: 'x', reviewStyle: 'advisory', scope: { kind: 'uncommitted' } } },
    { name: 'codex_resume', args: { prompt: 'x', sessionId: 's', taskId: 't' } }
  ];
  for (const { name, args } of fullToolArgs) {
    const tool = getToolDefinition(name);
    const request = buildWorkflowRequest({
      tool,
      args,
      cwd: '/repo',
      pluginRoot: PLUGIN_ROOT,
      projectConfig: { model: 'full-model', modelMini: 'mini-model' }
    });
    assert.equal(request.model, 'full-model', `${name} should use model from config, not modelMini`);
  }
});

test('buildWorkflowRequest: works without projectConfig (backward compat)', () => {
  const tool = getToolDefinition('codex_research');
  const request = buildWorkflowRequest({
    tool,
    args: { prompt: 'x' },
    cwd: '/repo',
    pluginRoot: PLUGIN_ROOT
  });

  assert.equal(request.model, tool.defaults.model);
  assert.equal(request.effort, tool.defaults.effort);
});
