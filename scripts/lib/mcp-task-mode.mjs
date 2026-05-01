import { randomUUID } from 'node:crypto';

const ELIGIBLE_TASK_TOOLS = new Set(['codex_implement', 'codex_resume']);
const TASK_MODE_FLAG = 'implement-resume';
const DEFAULT_POLL_INTERVAL_MS = 1000;

function isTaskModeEnabled(featureFlags) {
  return featureFlags?.taskMode === TASK_MODE_FLAG;
}

function toTaskSnapshot(record) {
  return {
    taskId: record.taskId,
    status: record.status,
    ttl: record.ttl ?? null,
    createdAt: record.createdAt,
    lastUpdatedAt: record.lastUpdatedAt,
    ...(record.pollInterval != null ? { pollInterval: record.pollInterval } : {}),
    ...(record.statusMessage ? { statusMessage: record.statusMessage } : {})
  };
}

export function isTaskEligibleTool(name) {
  return ELIGIBLE_TASK_TOOLS.has(name);
}

export function createTaskModeController({
  featureFlags,
  taskRegistry,
  server,
  executeTool,
  sendLog
}) {
  const runningTasks = new Map();

  // Operator visibility hook for fire-and-forget IIFE failures. The catch
  // blocks below MUST swallow exceptions (the IIFE is fire-and-forget — an
  // unhandled rejection would crash the server in strict mode) but the
  // operator still needs to learn that something went wrong, especially when
  // both executeTool and the failure-save throw. Best-effort log emission;
  // never throw from this helper.
  async function emitWarning(taskId, error, context) {
    if (!sendLog) return;
    try {
      await sendLog({
        level: 'warning',
        logger: 'superpowers.codex.taskMode',
        data: {
          taskId,
          context,
          message: error instanceof Error ? error.message : String(error)
        }
      });
    } catch {
      // logging is best-effort
    }
  }

  async function emitStatus(record) {
    if (!server) return;

    try {
      await server.notification({
        method: 'notifications/tasks/status',
        params: toTaskSnapshot(record)
      });
    } catch {
      // Task status notifications are best-effort.
    }
  }

  async function loadTask(taskId) {
    const record = await taskRegistry.get(taskId);
    if (!record) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return record;
  }

  return {
    shouldCreateTask(request) {
      if (!isTaskModeEnabled(featureFlags)) {
        return false;
      }

      return Boolean(request.params?.task) && isTaskEligibleTool(request.params?.name);
    },

    async createTask(request, extra = {}) {
      const args = request.params?.arguments ?? {};
      const now = new Date().toISOString();
      const taskId = randomUUID();
      const record = {
        taskId,
        status: 'working',
        ttl: request.params?.task?.ttl ?? null,
        createdAt: now,
        lastUpdatedAt: now,
        pollInterval: DEFAULT_POLL_INTERVAL_MS,
        statusMessage: `Running ${request.params?.name}`,
        toolName: request.params?.name,
        workspaceRoot: args.workspaceRoot ?? null,
        result: null
      };

      await taskRegistry.save(record);

      const running = { cancelled: false, cancel: null };
      runningTasks.set(taskId, running);

      // Persist a non-cancelled terminal status, but if cancellation arrives
      // while the save is in flight, re-assert the cancelled state afterwards
      // so we never leave a stale "completed"/"failed" record overwriting it.
      const persistTerminal = async (updated) => {
        if (running.cancelled) return;
        await taskRegistry.save(updated);
        if (running.cancelled) {
          const reasserted = {
            ...updated,
            status: 'cancelled',
            lastUpdatedAt: new Date().toISOString(),
            statusMessage: 'Task cancelled.',
            result: null
          };
          try {
            await taskRegistry.save(reasserted);
          } catch {
            // Best-effort reassertion — if the registry is wedged, the
            // cancelTask path will have already attempted to save 'cancelled'.
          }
          return;
        }
        await emitStatus(updated);
      };

      void (async () => {
        try {
          const result = await executeTool(request, {
            ...extra,
            requestId: `task:${taskId}`,
            exposeCancel: (cancel) => {
              if (running.cancelled) {
                cancel('cancelled');
                return;
              }

              running.cancel = cancel;
            }
          });

          const latest = await taskRegistry.get(taskId);
          if (!latest || latest.status === 'cancelled' || running.cancelled) {
            return;
          }

          const updated = {
            ...latest,
            status: result.isError ? 'failed' : 'completed',
            lastUpdatedAt: new Date().toISOString(),
            statusMessage: result.isError
              ? result.content?.[0]?.text ?? 'Task failed.'
              : 'Task completed.',
            result
          };

          await persistTerminal(updated);
        } catch (error) {
          // Best-effort failure reporting. The catch path itself must never
          // leak an unhandled rejection — the IIFE is fire-and-forget, and a
          // throw here would crash the server in --unhandled-rejections=strict.
          // Always surface the original error via sendLog, even if the
          // failure-save below throws — operators need this signal to debug
          // tasks stuck in "working".
          await emitWarning(taskId, error, 'executeTool threw');

          try {
            const latest = await taskRegistry.get(taskId);
            if (!latest || latest.status === 'cancelled' || running.cancelled) {
              return;
            }

            const updated = {
              ...latest,
              status: 'failed',
              lastUpdatedAt: new Date().toISOString(),
              statusMessage: error instanceof Error ? error.message : String(error),
              result: null
            };

            await persistTerminal(updated);
          } catch (saveError) {
            // Surface the secondary failure separately so operators see both
            // the original cause and that the registry save also failed.
            await emitWarning(taskId, saveError, 'failed to persist failed status');
          }
        } finally {
          runningTasks.delete(taskId);
        }
      })();

      return {
        task: toTaskSnapshot(record)
      };
    },

    async getTask(taskId) {
      return toTaskSnapshot(await loadTask(taskId));
    },

    async listTasks() {
      const tasks = await taskRegistry.list();
      return {
        tasks: tasks.map(toTaskSnapshot)
      };
    },

    async getTaskResult(taskId) {
      const record = await loadTask(taskId);
      if (record.result == null) {
        throw new Error(`Task result is not available for task: ${taskId}`);
      }
      return record.result;
    },

    async cancelTask(taskId) {
      const record = await loadTask(taskId);
      if (record.status !== 'working') {
        return toTaskSnapshot(record);
      }

      const running = runningTasks.get(taskId);
      if (running) {
        running.cancelled = true;
        running.cancel?.('cancelled');
      }

      const updated = {
        ...record,
        status: 'cancelled',
        lastUpdatedAt: new Date().toISOString(),
        statusMessage: 'Task cancelled.',
        result: null
      };

      await taskRegistry.save(updated);
      await emitStatus(updated);

      return toTaskSnapshot(updated);
    }
  };
}
