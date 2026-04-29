import { randomUUID } from 'node:crypto';
import { runWithMcpRuntime } from './mcp-runtime.mjs';
import {
  buildWorkflowRequest,
  getToolDefinition
} from './mcp-tool-definitions.mjs';
import { selectWorkspaceRoot } from './mcp-workspace.mjs';
import { loadProjectConfig, scaffoldProjectConfig } from './codex-project-config.mjs';

export async function dispatchWorkflowTool({
  request,
  extra = {},
  pluginRoot,
  getRoots,
  runWorkflow,
  requestRegistry,
  sendProgress,
  sendLog,
  exposeCancel
}) {
  const { name, arguments: args = {} } = request.params;
  const taskId = args.taskId ?? null;
  const tool = getToolDefinition(name);

  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  const roots = await getRoots();
  const cwd = selectWorkspaceRoot({ workspaceRoot: args.workspaceRoot, roots });
  const scaffoldedWorkspaces = extra.scaffoldedWorkspaces;

  if (tool.annotations?.readOnlyHint) {
    // Read-only tools must not create project config files as a side effect.
  } else if (scaffoldedWorkspaces && !scaffoldedWorkspaces.has(cwd)) {
    scaffoldedWorkspaces.add(cwd);
    await scaffoldProjectConfig(cwd);
  } else if (!scaffoldedWorkspaces) {
    await scaffoldProjectConfig(cwd);
  }

  const projectConfig = await loadProjectConfig(cwd);
  const workflowRequest = buildWorkflowRequest({
    tool,
    args,
    cwd,
    pluginRoot,
    projectConfig
  });

  const requestId = String(extra.requestId ?? request.id ?? randomUUID());
  const progressToken = request.params._meta?.progressToken;

  const runtimeResult = await runWithMcpRuntime({
    requestId,
    timeoutMs: args.timeoutMs ?? tool.defaults.timeoutMs,
    progressToken,
    sendProgress,
    sendLog,
    includeRawOutput: args.includeRawOutput ?? false,
    operation: async ({ signal, markSpawned, cancel, onStdoutChunk, onStderrChunk }) => {
      exposeCancel?.(cancel);
      requestRegistry.set(requestId, { cancel });

      try {
        return await runWorkflow({
          ...workflowRequest,
          signal,
          onSpawn: markSpawned,
          onStdoutChunk,
          onStderrChunk
        });
      } finally {
        requestRegistry.delete(requestId);
      }
    }
  });

  return {
    name,
    taskId,
    runtimeResult
  };
}
