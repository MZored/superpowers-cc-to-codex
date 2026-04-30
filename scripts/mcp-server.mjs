/**
 * mcp-server.mjs
 *
 * Stdio MCP server that exposes Codex workflow tools to MCP clients.
 * Claude stays as the controller; this server delegates bounded work to
 * the Codex CLI via the runCodexWorkflow adapter.
 *
 * Exports:
 *   createToolCallHandler({ pluginRoot, getRoots, runWorkflow, server, requestRegistry })
 *   createMcpServer() → Promise<Server>
 *
 * CLI entry: node scripts/mcp-server.mjs
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  GetTaskRequestSchema,
  GetTaskPayloadRequestSchema,
  ListTasksRequestSchema,
  CancelTaskRequestSchema,
  CancelledNotificationSchema,
  RootsListChangedNotificationSchema
} from '@modelcontextprotocol/sdk/types.js';
import { runCodexWorkflow } from './codex-run.mjs';
import { createRequestRegistry } from './lib/mcp-runtime.mjs';
import { TOOL_DEFINITIONS } from './lib/mcp-tool-definitions.mjs';
import { loadExperimentalFeatures } from './lib/experimental-features.mjs';
import { createTaskRegistry } from './lib/mcp-task-registry.mjs';
import { createTaskModeController, isTaskEligibleTool } from './lib/mcp-task-mode.mjs';
import { dispatchWorkflowTool } from './lib/mcp-workflow-dispatch.mjs';
import { createCodexEventEmitterFromEnv } from './lib/codex-events.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = resolve(__dirname, '..');
const PACKAGE_JSON = JSON.parse(await readFile(join(PLUGIN_ROOT, 'package.json'), 'utf8'));

// ---------------------------------------------------------------------------
// buildToolResult — shapes a runtime result into an MCP CallToolResult
// ---------------------------------------------------------------------------

function buildToolResult(name, runtimeResult) {
  const displayName = name.replace(/_/g, ' ');
  const isPartial = runtimeResult.status === 'partial';
  const suffix = isPartial ? ' partially' : '';

  return {
    content: [
      {
        type: 'text',
        text: `${displayName} completed${suffix}.`
      }
    ],
    structuredContent: {
      status: runtimeResult.status ?? null,
      taskId: runtimeResult.taskId ?? null,
      sessionId: runtimeResult.sessionId ?? null,
      timedOut: runtimeResult.timedOut ?? false,
      result: runtimeResult.result ?? null,
      assistantText: runtimeResult.assistantText ?? null,
      stderrTail: runtimeResult.stderrTail ?? '',
      rawOutput: runtimeResult.rawOutput ?? null
    },
    isError: false
  };
}

function buildErrorResult(name, error, taskId = null) {
  const effectiveTaskId = error.taskId ?? taskId;
  const sessionId = error.sessionId ?? null;
  const resumeHint =
    effectiveTaskId && sessionId
      ? `Session saved as taskId=${effectiveTaskId} (sessionId=${sessionId}). Resume with codex_resume to continue.\n\n`
      : '';

  return {
    content: [
      {
        type: 'text',
        text: `${resumeHint}${error.message}`
      }
    ],
    structuredContent: {
      status: 'error',
      taskId: effectiveTaskId,
      sessionId,
      timedOut: false,
      result: null,
      assistantText: null,
      stderrTail: error.stderr ?? '',
      rawOutput: null
    },
    isError: true
  };
}

// ---------------------------------------------------------------------------
// createDispatcher — shared request dispatcher used by tools/call and task mode
// ---------------------------------------------------------------------------

/**
 * @param {object} opts
 * @param {string}   opts.pluginRoot
 * @param {Function} opts.getRoots
 * @param {Function} [opts.runWorkflow]
 * @param {object}   [opts.server]
 * @param {object}   [opts.requestRegistry]
 * @param {Set<string>} [opts.scaffoldedWorkspaces]
 * @param {object}   [opts.eventEmitter]
 * @returns {{ dispatch(request, extra?): Promise<{name, taskId, runtimeResult}> }}
 */
export function createDispatcher({
  pluginRoot,
  getRoots,
  runWorkflow = runCodexWorkflow,
  server,
  requestRegistry = createRequestRegistry(),
  scaffoldedWorkspaces = new Set(),
  eventEmitter
}) {
  const sendProgress = async (payload) => {
    if (!server) return;
    await server.notification({
      method: 'notifications/progress',
      params: payload
    });
  };

  const sendLog = async (payload) => {
    if (!server) return;
    await server.sendLoggingMessage(payload);
  };

  const resolvedEventEmitter =
    eventEmitter ??
    createCodexEventEmitterFromEnv({
      sendLog: server ? sendLog : undefined
    });

  return {
    async dispatch(request, extra = {}) {
      return dispatchWorkflowTool({
        request,
        extra: {
          ...extra,
          scaffoldedWorkspaces
        },
        pluginRoot,
        getRoots,
        runWorkflow: (workflowRequest) =>
          runWorkflow({
            ...workflowRequest,
            eventEmitter: resolvedEventEmitter
          }),
        requestRegistry,
        sendProgress,
        sendLog,
        eventEmitter: resolvedEventEmitter,
        exposeCancel: extra.exposeCancel
      });
    }
  };
}

// ---------------------------------------------------------------------------
// createToolCallHandler — factory for the tools/call dispatch function
// ---------------------------------------------------------------------------

/**
 * @param {object} opts
 * @param {string}   opts.pluginRoot         - Absolute path to the plugin root
 * @param {Function} opts.getRoots           - async () => Root[]  (from MCP client state)
 * @param {Function} [opts.runWorkflow]      - Codex adapter (default: runCodexWorkflow)
 * @param {object}   [opts.server]           - MCP Server instance (for progress notifications)
 * @param {object}   [opts.requestRegistry]  - Registry for in-flight requests
 * @param {Set<string>} [opts.scaffoldedWorkspaces] - Workspaces already scaffolded this session
 * @returns {Function} async handleToolCall(request, extra?) => CallToolResult
 */
export function createToolCallHandler({
  pluginRoot,
  getRoots,
  runWorkflow = runCodexWorkflow,
  server,
  requestRegistry = createRequestRegistry(),
  scaffoldedWorkspaces = new Set()
}) {
  const dispatcher = createDispatcher({
    pluginRoot,
    getRoots,
    runWorkflow,
    server,
    requestRegistry,
    scaffoldedWorkspaces
  });

  return async function handleToolCall(request, extra = {}) {
    try {
      const { name, taskId, runtimeResult } = await dispatcher.dispatch(request, extra);
      return buildToolResult(name, { ...runtimeResult, taskId });
    } catch (error) {
      return buildErrorResult(
        request.params?.name ?? 'unhandled_tool',
        error,
        request.params?.arguments?.taskId ?? null
      );
    }
  };
}

// ---------------------------------------------------------------------------
// createMcpServer — configures and returns a Server instance
// ---------------------------------------------------------------------------

/**
 * Creates and configures the MCP Server with all workflow tool handlers.
 * Does NOT call server.connect() — caller is responsible for transport wiring.
 *
 * @param {object} [opts]
 * @param {Function} [opts.runWorkflow]
 * @param {{taskMode?: string}} [opts.featureFlags]
 * @param {object} [opts.taskRegistry]
 * @returns {Promise<Server>}
 */
export async function createMcpServer({
  runWorkflow = runCodexWorkflow,
  featureFlags = loadExperimentalFeatures(process.env),
  taskRegistry = createTaskRegistry()
} = {}) {
  // Mutable roots cache — updated when client sends roots/list_changed
  let cachedRoots = [];

  const server = new Server(
    { name: 'superpowers-cc-to-codex', version: PACKAGE_JSON.version },
    {
      capabilities: {
        logging: {},
        tools: {},
        ...(featureFlags.taskMode === 'implement-resume'
          ? { tasks: { list: {}, cancel: {}, requests: { tools: { call: {} } } } }
          : {})
      }
    }
  );

  const requestRegistry = createRequestRegistry();
  const scaffoldedWorkspaces = new Set();

  async function refreshRoots() {
    try {
      const result = await server.listRoots();
      cachedRoots = result.roots ?? [];
    } catch {
      // Client may not advertise roots capability; leave cachedRoots unchanged.
    }
    return cachedRoots;
  }

  const dispatcher = createDispatcher({
    pluginRoot: PLUGIN_ROOT,
    getRoots: async () => (cachedRoots.length > 0 ? cachedRoots : refreshRoots()),
    runWorkflow,
    server,
    requestRegistry,
    scaffoldedWorkspaces
  });

  const handleToolCall = async (request, extra = {}) => {
    try {
      const { name, taskId, runtimeResult } = await dispatcher.dispatch(request, extra);
      return buildToolResult(name, { ...runtimeResult, taskId });
    } catch (error) {
      return buildErrorResult(
        request.params?.name ?? 'unhandled_tool',
        error,
        request.params?.arguments?.taskId ?? null
      );
    }
  };

  const executeTool = async (request, extra = {}) => {
    try {
      const { name, taskId, runtimeResult } = await dispatcher.dispatch(request, extra);
      return buildToolResult(name, { ...runtimeResult, taskId });
    } catch (error) {
      return buildErrorResult(
        request.params?.name ?? 'unhandled_tool',
        error,
        request.params?.arguments?.taskId ?? null
      );
    }
  };

  const taskMode = createTaskModeController({
    featureFlags,
    taskRegistry,
    server,
    executeTool
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS.map(({ name, title, description, annotations, inputSchema, outputSchema }) => ({
      name,
      title,
      description,
      ...(annotations ? { annotations } : {}),
      inputSchema,
      ...(outputSchema ? { outputSchema } : {}),
      ...(featureFlags.taskMode === 'implement-resume' && isTaskEligibleTool(name)
        ? { execution: { taskSupport: 'optional' } }
        : {})
    }))
  }));

  // tools/call — dispatch to handler
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    if (taskMode.shouldCreateTask(request)) {
      return taskMode.createTask(request, extra);
    }

    return handleToolCall(request, extra);
  });

  if (featureFlags.taskMode === 'implement-resume') {
    server.setRequestHandler(GetTaskRequestSchema, async (request) => {
      return taskMode.getTask(request.params.taskId);
    });

    server.setRequestHandler(GetTaskPayloadRequestSchema, async (request) => {
      return taskMode.getTaskResult(request.params.taskId);
    });

    server.setRequestHandler(ListTasksRequestSchema, async () => {
      return taskMode.listTasks();
    });

    server.setRequestHandler(CancelTaskRequestSchema, async (request) => {
      return taskMode.cancelTask(request.params.taskId);
    });
  }

  // notifications/cancelled — cancel in-flight Codex subprocess
  server.setNotificationHandler(CancelledNotificationSchema, (notification) => {
    const requestId = String(notification.params?.requestId ?? '');
    if (!requestId) return;

    const entry = requestRegistry.get(requestId);
    if (entry?.cancel) {
      entry.cancel();
    }
    requestRegistry.delete(requestId);
  });

  // notifications/roots/list_changed — refresh cached roots from client
  server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
    await refreshRoots();
  });

  return server;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = await createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
