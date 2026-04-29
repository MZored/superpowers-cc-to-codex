import { randomUUID } from 'node:crypto';
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertSafeTaskId } from './codex-state.mjs';
import { ensurePluginDataSubdir, resolvePluginDataDir } from './plugin-data.mjs';

const TASK_SUBDIR = 'mcp-tasks';

function taskPath(dir, taskId) {
  return join(dir, `${taskId}.json`);
}

async function readTaskRecord(dir, taskId) {
  assertSafeTaskId(taskId);
  const raw = await readFile(taskPath(dir, taskId), 'utf8');
  return JSON.parse(raw);
}

export function createTaskRegistry({ env = process.env } = {}) {
  return {
    async save(record) {
      assertSafeTaskId(record?.taskId);
      const dir = await ensurePluginDataSubdir(TASK_SUBDIR, { env });
      if (!dir) {
        throw new Error('CLAUDE_PLUGIN_DATA is required when task mode is enabled.');
      }

      const target = taskPath(dir, record.taskId);
      const tempPath = join(dir, `${record.taskId}.${randomUUID()}.tmp`);
      await writeFile(tempPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
      await rename(tempPath, target);
      return record;
    },

    async get(taskId) {
      assertSafeTaskId(taskId);
      const pluginDataDir = resolvePluginDataDir(env);
      if (!pluginDataDir) {
        return null;
      }

      const dir = join(pluginDataDir, TASK_SUBDIR);
      try {
        return await readTaskRecord(dir, taskId);
      } catch (error) {
        if (error?.code === 'ENOENT') {
          return null;
        }
        throw error;
      }
    },

    async list() {
      const dir = await ensurePluginDataSubdir(TASK_SUBDIR, { env });
      if (!dir) {
        return [];
      }

      const names = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
      const results = await Promise.allSettled(names.map((name) => readTaskRecord(dir, name.slice(0, -5))));
      return results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
    }
  };
}
