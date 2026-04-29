import { randomUUID } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultFs = { readFile, writeFile, rename };

const PLUGIN_JSON = ['.claude-plugin', 'plugin.json'];
const MARKETPLACE_JSON = ['.claude-plugin', 'marketplace.json'];

async function readJsonFile(fs, path) {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

/**
 * Atomically write a JSON document with 2-space indent + trailing newline.
 *
 * Mirrors `saveTaskState` in scripts/lib/codex-state.mjs: write to a unique
 * temp path, then rename onto the final file. `rename` is atomic on POSIX, so
 * readers never see a half-written file.
 */
async function writeJsonAtomic(fs, target, value) {
  const tempPath = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await fs.rename(tempPath, target);
}

/**
 * Synchronize plugin.json and marketplace.json versions with package.json.
 *
 * package.json is the single source of truth. This function reads its
 * `version` field, then rewrites the matching slots in plugin.json and
 * marketplace.json (plugins[0].version). File system access is injectable
 * for tests via the optional `fs` parameter.
 *
 * Returns the resolved version string.
 */
export async function syncVersions({ pluginRoot, fs = defaultFs } = {}) {
  if (!pluginRoot) {
    throw new Error('syncVersions requires a pluginRoot path');
  }

  const packagePath = join(pluginRoot, 'package.json');
  const pluginPath = join(pluginRoot, ...PLUGIN_JSON);
  const marketplacePath = join(pluginRoot, ...MARKETPLACE_JSON);

  const pkg = await readJsonFile(fs, packagePath);
  const version = pkg.version;
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error(`package.json at ${packagePath} is missing a string "version" field`);
  }

  const plugin = await readJsonFile(fs, pluginPath);
  plugin.version = version;
  await writeJsonAtomic(fs, pluginPath, plugin);

  const marketplace = await readJsonFile(fs, marketplacePath);
  if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0) {
    throw new Error(
      `marketplace.json at ${marketplacePath} must have a non-empty "plugins" array`
    );
  }
  marketplace.plugins[0].version = version;
  await writeJsonAtomic(fs, marketplacePath, marketplace);

  return { version, files: [pluginPath, marketplacePath] };
}

async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pluginRoot = resolve(__dirname, '..');
  const result = await syncVersions({ pluginRoot });
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
