import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export function resolvePluginDataDir(env = process.env) {
  const raw = env?.CLAUDE_PLUGIN_DATA;
  if (typeof raw !== 'string' || raw.trim() === '') {
    return null;
  }

  return resolve(raw.trim());
}

export async function ensurePluginDataSubdir(name, { env = process.env, mkdirFn = mkdir } = {}) {
  const pluginDataDir = resolvePluginDataDir(env);
  if (!pluginDataDir) {
    return null;
  }

  const subdir = join(pluginDataDir, name);
  await mkdirFn(subdir, { recursive: true });
  return subdir;
}
