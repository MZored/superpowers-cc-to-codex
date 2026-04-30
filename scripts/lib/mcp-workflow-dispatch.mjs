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
  eventEmitter,
  exposeCancel
}) {
  const { name, arguments: args = {} } = request.params;
  const taskId = args.taskId ?? null;
  const tool = getToolDefinition(name);

  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  // Server-side input validation. The advertised inputSchema is informational
  // for clients; the SDK does not enforce it on incoming tools/call requests,
  // so the server must reject calls that omit required fields before any
  // Codex spawn or workspace resolution work runs.
  const required = tool.inputSchema?.required ?? [];
  const missing = required.filter((field) => {
    const value = args[field];
    if (value === undefined || value === null) return true;
    if (typeof value === 'string' && value.length === 0) return true;
    return false;
  });
  if (missing.length > 0) {
    throw new Error(
      `${name} requires ${missing.join(', ')}. Provide ${missing.length === 1 ? 'this argument' : 'these arguments'} in the tools/call request.`
    );
  }

  const roots = await getRoots();
  const cwd = selectWorkspaceRoot({ workspaceRoot: args.workspaceRoot, roots });
  const scaffoldedWorkspaces = extra.scaffoldedWorkspaces;

  let scaffoldCreated = false;
  if (tool.annotations?.readOnlyHint) {
    // Read-only tools must not create project config files as a side effect.
  } else if (scaffoldedWorkspaces && !scaffoldedWorkspaces.has(cwd)) {
    scaffoldedWorkspaces.add(cwd);
    scaffoldCreated = await scaffoldProjectConfig(cwd);
  } else if (!scaffoldedWorkspaces) {
    scaffoldCreated = await scaffoldProjectConfig(cwd);
  }

  if (scaffoldCreated && sendLog) {
    try {
      await sendLog({
        level: 'info',
        logger: 'codex.config',
        data: {
          message: `Created .claude/codex-defaults.json with auto/fast defaults. Customize model/effort there.`,
          path: `${cwd}/.claude/codex-defaults.json`
        }
      });
    } catch {
      // Logging is best-effort.
    }
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
    requestName: name,
    timeoutMs: args.timeoutMs ?? tool.defaults.timeoutMs,
    progressToken,
    sendProgress,
    sendLog,
    eventEmitter,
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
