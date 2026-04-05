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
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  CancelledNotificationSchema,
  RootsListChangedNotificationSchema
} from '@modelcontextprotocol/sdk/types.js';
import { runCodexWorkflow } from './codex-run.mjs';
import { createRequestRegistry, runWithMcpRuntime } from './lib/mcp-runtime.mjs';
import {
  TOOL_DEFINITIONS,
  buildWorkflowRequest,
  getToolDefinition
} from './lib/mcp-tool-definitions.mjs';
import { selectWorkspaceRoot } from './lib/mcp-workspace.mjs';

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
  return {
    content: [
      {
        type: 'text',
        text: error.message
      }
    ],
    structuredContent: {
      status: 'error',
      taskId,
      sessionId: null,
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
// createToolCallHandler — factory for the tools/call dispatch function
// ---------------------------------------------------------------------------

/**
 * @param {object} opts
 * @param {string}   opts.pluginRoot         - Absolute path to the plugin root
 * @param {Function} opts.getRoots           - async () => Root[]  (from MCP client state)
 * @param {Function} [opts.runWorkflow]      - Codex adapter (default: runCodexWorkflow)
 * @param {object}   [opts.server]           - MCP Server instance (for progress notifications)
 * @param {object}   [opts.requestRegistry]  - Registry for in-flight requests
 * @returns {Function} async handleToolCall(request, extra?) => CallToolResult
 */
export function createToolCallHandler({
  pluginRoot,
  getRoots,
  runWorkflow = runCodexWorkflow,
  server,
  requestRegistry = createRequestRegistry()
}) {
  return async function handleToolCall(request, extra = {}) {
    const { name, arguments: args = {} } = request.params;
    const taskId = args.taskId ?? null;

    // Resolve the tool definition
    const tool = getToolDefinition(name);
    if (!tool) {
      return buildErrorResult(name, new Error(`Unknown tool: ${name}`), taskId);
    }

    // Resolve workspace root
    let cwd;
    try {
      const roots = await getRoots();
      cwd = selectWorkspaceRoot({ workspaceRoot: args.workspaceRoot, roots });
    } catch (error) {
      return buildErrorResult(name, error, taskId);
    }

    // Build workflow request
    const workflowRequest = buildWorkflowRequest({
      tool,
      args,
      cwd,
      pluginRoot
    });

    // Track this request so notifications/cancelled can abort it.
    // Prefer extra.requestId (MCP SDK authoritative) over request.id; fall back
    // to a fresh UUID so concurrent null-id calls don't collide in the registry.
    const requestId = String(extra.requestId ?? request.id ?? randomUUID());
    const progressToken = request.params._meta?.progressToken;

    try {
      const runtimeResult = await runWithMcpRuntime({
        requestId,
        timeoutMs: args.timeoutMs ?? tool.defaults.timeoutMs,
        progressToken,
        sendProgress: async (payload) => {
          if (!server) return;
          await server.notification({
            method: 'notifications/progress',
            params: payload
          });
        },
        includeRawOutput: args.includeRawOutput ?? false,
        operation: async ({ signal, markSpawned, cancel }) => {
          requestRegistry.set(requestId, { cancel });
          try {
            return await runWorkflow({
              ...workflowRequest,
              signal,
              onSpawn: markSpawned
            });
          } finally {
            requestRegistry.delete(requestId);
          }
        }
      });

      return buildToolResult(name, { ...runtimeResult, taskId });
    } catch (error) {
      return buildErrorResult(name, error, taskId);
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
 * @returns {Promise<Server>}
 */
export async function createMcpServer() {
  // Mutable roots cache — updated when client sends roots/list_changed
  let cachedRoots = [];

  const server = new Server(
    { name: 'superpowers-cc-to-codex', version: PACKAGE_JSON.version },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  const requestRegistry = createRequestRegistry();

  async function refreshRoots() {
    try {
      const result = await server.listRoots();
      cachedRoots = result.roots ?? [];
    } catch {
      // Client may not advertise roots capability; leave cachedRoots unchanged.
    }
    return cachedRoots;
  }

  const handleToolCall = createToolCallHandler({
    pluginRoot: PLUGIN_ROOT,
    getRoots: async () => (cachedRoots.length > 0 ? cachedRoots : refreshRoots()),
    runWorkflow: runCodexWorkflow,
    server,
    requestRegistry
  });

  // tools/list — advertise all 7 workflow tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS.map(({ name, title, description, annotations, inputSchema, outputSchema }) => ({
      name,
      title,
      description,
      ...(annotations ? { annotations } : {}),
      inputSchema,
      ...(outputSchema ? { outputSchema } : {})
    }))
  }));

  // tools/call — dispatch to handler
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    return handleToolCall(request, extra);
  });

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
