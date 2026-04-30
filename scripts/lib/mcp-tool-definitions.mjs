import { SAFE_TASK_ID_PATTERN } from './codex-state.mjs';

const sharedProperties = {
  taskId: {
    type: 'string',
    pattern: SAFE_TASK_ID_PATTERN,
    description: 'State-file-safe identifier. Use letters, numbers, dots, underscores, and hyphens; do not use path separators.'
  },
  workspaceRoot: {
    type: 'string',
    description: 'Absolute path or file:// URI for the repository root to run Codex in.'
  },
  model: {
    type: 'string',
    description: 'Override the Codex model. Use "auto" (default) to defer to your ~/.codex/config.toml.'
  },
  effort: {
    type: 'string',
    enum: ['auto', 'minimal', 'low', 'medium', 'high', 'xhigh'],
    description: 'Reasoning effort. Use "auto" (default) to defer to your ~/.codex/config.toml.'
  },
  serviceTier: { type: 'string', enum: ['fast'] },
  timeoutMs: { type: 'integer', minimum: 1 },
  includeRawOutput: { type: 'boolean' }
};

const standardOutputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['ok', 'partial', 'error'] },
    taskId: { type: ['string', 'null'] },
    sessionId: { type: ['string', 'null'] },
    timedOut: { type: 'boolean' },
    assistantText: { type: ['string', 'null'] },
    result: { type: ['object', 'array', 'null'] },
    stderrTail: { type: 'string' },
    rawOutput: { type: ['string', 'null'] }
  },
  required: ['status', 'taskId', 'sessionId', 'timedOut', 'assistantText', 'result', 'stderrTail', 'rawOutput']
};

export const TOOL_DEFINITIONS = Object.freeze([
  {
    name: 'codex_research',
    title: 'Codex Research',
    description: 'Run bounded repository research for brainstorming. Call BEFORE asking design questions — pass the areas to explore in the prompt.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        prompt: { type: 'string' },
        ...sharedProperties
      },
      required: ['prompt']
    },
    outputSchema: standardOutputSchema,
    defaults: { mode: 'research', promptTemplate: 'research-brief', model: 'auto', effort: 'auto', timeoutMs: 120000 }
  },
  {
    name: 'codex_plan',
    title: 'Codex Plan',
    description: 'Draft an implementation plan. Call to generate first-pass plan — you review and refine, not write from scratch.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        prompt: { type: 'string' },
        ...sharedProperties
      },
      required: ['prompt']
    },
    outputSchema: standardOutputSchema,
    defaults: { mode: 'plan', promptTemplate: 'planning-brief', model: 'auto', effort: 'auto', timeoutMs: 180000 }
  },
  {
    name: 'codex_implement',
    title: 'Codex Implement',
    description: 'Implement a bounded coding task. Dispatch this for ALL implementation work — Claude orchestrates, Codex executes.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        prompt: { type: 'string' },
        promptTemplate: { type: 'string', enum: ['default', 'tdd'] },
        ...sharedProperties
      },
      required: ['taskId']
    },
    outputSchema: standardOutputSchema,
    defaults: { mode: 'implement', promptTemplate: 'implement-task', model: 'auto', effort: 'auto', timeoutMs: 600000 }
  },
  {
    name: 'codex_review',
    title: 'Codex Review',
    description: 'Run external code review against a diff scope. Call for ALL review work — external review catches what self-review misses.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        prompt: { type: 'string' },
        reviewStyle: { type: 'string', enum: ['structured', 'advisory'] },
        scope: {
          oneOf: [
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: { const: 'base' },
                base: { type: 'string' }
              },
              required: ['kind', 'base']
            },
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: { const: 'commit' },
                commit: { type: 'string' }
              },
              required: ['kind', 'commit']
            },
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: { const: 'uncommitted' }
              },
              required: ['kind']
            }
          ]
        },
        ...sharedProperties
      },
      required: ['scope', 'reviewStyle']
    },
    outputSchema: standardOutputSchema,
    defaults: { mode: 'review', promptTemplate: 'review-brief', model: 'auto', effort: 'auto', timeoutMs: 180000 }
  },
  {
    name: 'codex_debug',
    title: 'Codex Debug',
    description: 'Investigate root cause of a bug or failure. Call BEFORE proposing any fix — pass error messages, repro steps, and evidence in the prompt.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        prompt: { type: 'string' },
        ...sharedProperties
      },
      required: ['prompt']
    },
    outputSchema: standardOutputSchema,
    defaults: { mode: 'research', promptTemplate: 'investigation-brief', model: 'auto', effort: 'auto', timeoutMs: 180000 }
  },
  {
    name: 'codex_branch_analysis',
    title: 'Codex Branch Analysis',
    description: 'Assess branch readiness before finishing. Call BEFORE presenting finish options — analysis informs the decision.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        prompt: { type: 'string' },
        ...sharedProperties
      },
      required: ['prompt']
    },
    outputSchema: standardOutputSchema,
    defaults: { mode: 'research', promptTemplate: 'branch-analysis-brief', model: 'auto', effort: 'auto', timeoutMs: 120000 }
  },
  {
    name: 'codex_resume',
    title: 'Codex Resume',
    description: 'Resume an existing implementation thread by task id or session id.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sessionId: { type: 'string' },
        prompt: { type: 'string' },
        promptTemplate: { type: 'string', enum: ['default', 'tdd'] },
        ...sharedProperties
      },
      required: ['taskId']
    },
    outputSchema: standardOutputSchema,
    defaults: { mode: 'resume', promptTemplate: 'fix-task', model: 'auto', effort: 'auto', timeoutMs: 600000 }
  }
]);

export function getToolDefinition(name) {
  return TOOL_DEFINITIONS.find((tool) => tool.name === name) ?? null;
}

/** Mini-model tool names — use `projectConfig.modelMini` when available. */
const MINI_MODEL_TOOLS = new Set([
  'codex_research', 'codex_plan', 'codex_debug', 'codex_branch_analysis'
]);

/**
 * Maps typed MCP tool arguments to a `runCodexWorkflow` request object.
 *
 * Resolution chain (left wins): explicit args → projectConfig → tool defaults.
 *
 * Note: `timeoutMs` and `includeRawOutput` are runtime concerns consumed by
 * `runWithMcpRuntime`, not forwarded into the workflow request object.
 * Task 4's MCP server extracts them from `args` directly before calling
 * `runWithMcpRuntime`.
 */
export function buildWorkflowRequest({ tool, args, cwd, pluginRoot, projectConfig = {} }) {
  const configModel = MINI_MODEL_TOOLS.has(tool.name)
    ? (projectConfig.modelMini ?? projectConfig.model)
    : projectConfig.model;

  const request = {
    mode: tool.defaults.mode,
    cwd,
    taskId: args.taskId,
    model: args.model ?? configModel ?? tool.defaults.model,
    effort: args.effort ?? projectConfig.effort ?? tool.defaults.effort,
    serviceTier: args.serviceTier ?? projectConfig.serviceTier,
    taskText: args.prompt
  };

  switch (tool.name) {
    case 'codex_research':
      return {
        ...request,
        promptFile: `${pluginRoot}/skills/brainstorming-codex/prompts/research-brief.md`,
        schemaPath: `${pluginRoot}/schemas/brainstorm-research.schema.json`
      };
    case 'codex_plan':
      return {
        ...request,
        promptFile: `${pluginRoot}/skills/writing-plans-codex/prompts/planning-brief.md`,
        schemaPath: `${pluginRoot}/schemas/plan-draft.schema.json`
      };
    case 'codex_implement':
      return {
        ...request,
        promptFile:
          args.promptTemplate === 'tdd'
            ? `${pluginRoot}/skills/test-driven-development-codex/prompts/tdd-implement-task.md`
            : `${pluginRoot}/skills/subagent-driven-development-codex/prompts/implement-task.md`,
        schemaPath: `${pluginRoot}/schemas/implementer-result.schema.json`
      };
    case 'codex_review':
      return {
        ...request,
        promptFile: `${pluginRoot}/skills/requesting-code-review-codex/prompts/review-brief.md`,
        base: args.scope?.kind === 'base' ? args.scope.base : undefined,
        commit: args.scope?.kind === 'commit' ? args.scope.commit : undefined,
        uncommitted: args.scope?.kind === 'uncommitted',
        schemaPath:
          args.reviewStyle === 'structured'
            ? `${pluginRoot}/schemas/code-review.schema.json`
            : undefined
      };
    case 'codex_debug':
      return {
        ...request,
        promptFile: `${pluginRoot}/skills/systematic-debugging-codex/prompts/investigation-brief.md`,
        schemaPath: `${pluginRoot}/schemas/debug-investigation.schema.json`
      };
    case 'codex_branch_analysis':
      return {
        ...request,
        promptFile: `${pluginRoot}/skills/finishing-a-development-branch-codex/prompts/branch-analysis-brief.md`,
        schemaPath: `${pluginRoot}/schemas/branch-analysis.schema.json`
      };
    case 'codex_resume':
      return {
        ...request,
        sessionId: args.sessionId,
        promptFile:
          args.promptTemplate === 'tdd'
            ? `${pluginRoot}/skills/test-driven-development-codex/prompts/tdd-implement-task.md`
            : `${pluginRoot}/skills/subagent-driven-development-codex/prompts/fix-task.md`,
        schemaPath: `${pluginRoot}/schemas/implementer-result.schema.json`
      };
    default:
      throw new Error(`Unhandled MCP tool mapping: ${tool.name}`);
  }
}
