import { appendFile as appendFileDefault } from 'node:fs/promises';
import { z } from 'zod';

const baseEvent = {
  taskId: z.string().optional(),
  requestId: z.string().optional()
};

const eventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('codex.invocation.start'),
    mode: z.string(),
    taskId: z.string().optional(),
    model: z.string().nullish(),
    effort: z.string().nullish(),
    serviceTier: z.string().nullish(),
    sessionId: z.string().nullish()
  }).passthrough(),
  z.object({
    type: z.literal('codex.invocation.end'),
    mode: z.string(),
    taskId: z.string().optional(),
    sessionId: z.string().nullish(),
    durationMs: z.number().int().nonnegative(),
    status: z.enum(['ok', 'partial', 'error']),
    exitCode: z.number().int().nullish(),
    retried: z.boolean()
  }).passthrough(),
  z.object({
    type: z.literal('codex.invocation.error'),
    mode: z.string(),
    taskId: z.string().optional(),
    errorClass: z.string(),
    transient: z.boolean(),
    message: z.string(),
    salvagedSessionId: z.string().nullish()
  }).passthrough(),
  z.object({
    type: z.literal('mcp.request.start'),
    name: z.string(),
    ...baseEvent
  }).passthrough(),
  z.object({
    type: z.literal('mcp.request.end'),
    name: z.string(),
    durationMs: z.number().int().nonnegative(),
    status: z.enum(['ok', 'partial', 'error']),
    ...baseEvent
  }).passthrough(),
  z.object({
    type: z.literal('mcp.request.cancel'),
    name: z.string(),
    ...baseEvent
  }).passthrough()
]);

const REDACTED_KEYS = new Set(['prompt', 'taskText', 'promptBody', 'rawPrompt']);

export function redactEvent(event) {
  const redacted = {};
  for (const [key, value] of Object.entries(event)) {
    if (REDACTED_KEYS.has(key)) continue;
    redacted[key] = value;
  }
  return redacted;
}

export function eventLevel(event) {
  switch (event.type) {
    case 'codex.invocation.start':
    case 'mcp.request.start':
      return 'debug';
    case 'codex.invocation.error':
      return 'error';
    case 'codex.invocation.end':
      return event.status === 'ok' ? 'info' : 'warning';
    case 'mcp.request.cancel':
      return 'warning';
    case 'mcp.request.end':
      return event.status === 'ok' ? 'info' : 'warning';
    default:
      return 'info';
  }
}

export function createMcpLoggingSink(sendLog) {
  return async function mcpLoggingSink(record) {
    if (!sendLog) return;
    await sendLog({
      level: eventLevel(record),
      logger: 'superpowers.codex',
      data: record
    });
  };
}

export function createCodexEventEmitter({
  mcpSink,
  logFile,
  consoleSink,
  appendFile = appendFileDefault,
  now = () => new Date().toISOString()
} = {}) {
  let fileSinkDisabled = false;

  return {
    async emit(event) {
      const parsed = eventSchema.parse(redactEvent(event));
      const record = {
        timestamp: now(),
        ...parsed
      };

      if (mcpSink) {
        await mcpSink(record);
      }

      if (logFile && !fileSinkDisabled) {
        try {
          await appendFile(logFile, `${JSON.stringify(record)}\n`, 'utf8');
        } catch {
          fileSinkDisabled = true;
        }
      }

      if (consoleSink) {
        consoleSink(JSON.stringify(record));
      }

      return record;
    }
  };
}

export function createCodexEventEmitterFromEnv({
  env = process.env,
  sendLog,
  consoleSink = (line) => process.stderr.write(`${line}\n`)
} = {}) {
  return createCodexEventEmitter({
    mcpSink: sendLog ? createMcpLoggingSink(sendLog) : undefined,
    logFile: env.SUPERPOWERS_CODEX_LOG_FILE || undefined,
    consoleSink: env.SUPERPOWERS_CODEX_LOG === '1' ? consoleSink : undefined
  });
}

export const noopCodexEventEmitter = Object.freeze({
  async emit() {}
});
