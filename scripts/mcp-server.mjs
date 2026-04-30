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
import { truncateStderrTail } from './lib/codex-jsonl.mjs';

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

// runCommand surfaces failures with `error.message = `${command} ${args.join(' ')} exited with code ${code}``.
// Because args includes the prompt body, the message can balloon to MBs for
// long-running implement runs. Cap it before it goes onto the JSON-RPC wire.
const ERROR_MESSAGE_MAX_CHARS = 600;

function truncateErrorMessage(message) {
  if (typeof message !== 'string') return String(message ?? '');
  if (message.length <= ERROR_MESSAGE_MAX_CHARS) return message;
  return `${message.slice(0, ERROR_MESSAGE_MAX_CHARS)}...[truncated ${message.length - ERROR_MESSAGE_MAX_CHARS} chars]`;
}

function buildErrorResult(name, error, taskId = null) {
  const effectiveTaskId = error.taskId ?? taskId;
  const sessionId = error.sessionId ?? null;
  const displayName = name ? name.replace(/_/g, ' ') : 'tool';
  const resumeHint =
    effectiveTaskId && sessionId
      ? `Session saved as taskId=${effectiveTaskId} (sessionId=${sessionId}). Resume with codex_resume(taskId="${effectiveTaskId}") to continue.\n\n`
      : '';

  return {
    content: [
      {
        type: 'text',
        text: `${resumeHint}${displayName} failed: ${truncateErrorMessage(error.message)}`
      }
    ],
    structuredContent: {
      status: 'error',
      taskId: effectiveTaskId,
      sessionId,
      timedOut: false,
      result: null,
      assistantText: null,
      stderrTail: truncateStderrTail(error.stderr ?? ''),
      rawOutput: null
    },
    isError: true
  };
}

// ---------------------------------------------------------------------------
// handleCancellationNotification — process notifications/cancelled safely
// ---------------------------------------------------------------------------
//
// The MCP SDK invokes notification handlers synchronously and treats thrown
// exceptions as transport-level errors. A buggy or already-aborted request
// entry whose cancel() throws would otherwise propagate into the SDK and
// could destabilize the server. Cancellation is best-effort — we always evict
// the registry entry and surface the failure via logging without re-throwing.
//
// Exported for unit tests so the resilience contract stays explicit.
export function handleCancellationNotification({ notification, requestRegistry, sendLog }) {
  const requestId = String(notification?.params?.requestId ?? '');
  if (!requestId) return;

  const entry = requestRegistry.get(requestId);
  if (entry?.cancel) {
    try {
      entry.cancel();
    } catch (error) {
      try {
        sendLog?.({
          level: 'warning',
          logger: 'superpowers.codex',
          data: {
            message: 'cancellation handler threw',
            requestId,
            error: error?.message ?? String(error)
          }
        });
      } catch {
        // logging is best-effort; never re-raise out of a notification handler
      }
    }
  }
  requestRegistry.delete(requestId);
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

  // Skip the listRoots round-trip when the client did not advertise the roots
  // capability — many MCP clients connect without one, and a blocking request
  // here would stall every tool call until the SDK's default 60s timeout fires.
  // Use a short bounded timeout for clients that DO advertise roots so a hung
  // client can't gate workflows indefinitely; fall back to an empty roots list
  // and log the failure so operators can see it.
  const ROOTS_REQUEST_TIMEOUT_MS = 5000;

  // Concurrent tool calls (or a tool call racing with roots/list_changed) can
  // each call refreshRoots() before the cache is populated. Dedupe in-flight
  // requests so the server sends at most one roots/list per refresh cycle.
  let pendingRefresh = null;

  async function performRefresh() {
    const clientCaps = typeof server.getClientCapabilities === 'function'
      ? server.getClientCapabilities()
      : null;
    if (!clientCaps?.roots) {
      cachedRoots = [];
      return cachedRoots;
    }
    try {
      const result = await server.listRoots(undefined, { timeout: ROOTS_REQUEST_TIMEOUT_MS });
      cachedRoots = result.roots ?? [];
    } catch (error) {
      // Don't let a slow/broken client wedge dispatch — surface the failure
      // and continue with an empty roots list. The dispatcher will fall back
      // to the explicit `workspaceRoot` argument or fail with a clear error.
      try {
        await server.sendLoggingMessage({
          level: 'warning',
          logger: 'superpowers.codex',
          data: {
            message: 'roots/list request failed; continuing with empty roots',
            error: error?.message ?? String(error)
          }
        });
      } catch {
        // logging is best-effort; never block dispatch on it
      }
      cachedRoots = [];
    }
    return cachedRoots;
  }

  function refreshRoots() {
    if (pendingRefresh) return pendingRefresh;
    pendingRefresh = performRefresh().finally(() => {
      pendingRefresh = null;
    });
    return pendingRefresh;
  }

  const dispatcher = createDispatcher({
    pluginRoot: PLUGIN_ROOT,
    getRoots: async () => (cachedRoots.length > 0 ? cachedRoots : refreshRoots()),
    runWorkflow,
    server,
    requestRegistry,
    scaffoldedWorkspaces
  });

  const runDispatch = async (request, extra = {}) => {
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
    executeTool: runDispatch
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

    return runDispatch(request, extra);
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
    handleCancellationNotification({
      notification,
      requestRegistry,
      sendLog: (payload) => server.sendLoggingMessage(payload).catch(() => {})
    });
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
  try {
    const server = await createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error) {
    // Bootstrap failures must surface — a silent unhandled rejection here
    // leaves the MCP client waiting on an absent server.
    process.stderr.write(
      `[superpowers-cc-to-codex] MCP server failed to start: ${error?.stack ?? error?.message ?? error}\n`
    );
    process.exit(1);
  }
}
