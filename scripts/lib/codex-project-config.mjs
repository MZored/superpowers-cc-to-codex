import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';

const ALLOWED_KEYS = ['model', 'modelMini', 'effort', 'serviceTier'];
const EFFORT_VALUES = ['minimal', 'low', 'medium', 'high', 'xhigh'];
const SERVICE_TIER_VALUES = ['fast'];

/**
 * Load per-project Codex defaults from `{workspaceRoot}/.claude/codex-defaults.json`.
 * Returns an empty object on missing file, invalid JSON, or non-object content.
 * Unknown keys and invalid enum values are silently stripped.
 *
 * @param {string} workspaceRoot - Absolute path to the workspace root
 * @returns {Promise<Record<string, string>>}
 */
export async function loadProjectConfig(workspaceRoot) {
  const configPath = join(workspaceRoot, '.claude', 'codex-defaults.json');

  let raw;
  try {
    raw = await readFile(configPath, 'utf8');
  } catch {
    return {};
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {};
  }

  const config = {};
  for (const key of ALLOWED_KEYS) {
    if (key in parsed && typeof parsed[key] === 'string') {
      config[key] = parsed[key];
    }
  }

  if (config.effort && !EFFORT_VALUES.includes(config.effort)) {
    delete config.effort;
  }
  if (config.serviceTier && !SERVICE_TIER_VALUES.includes(config.serviceTier)) {
    delete config.serviceTier;
  }

  return config;
}

const SCAFFOLD_DEFAULTS = {
  model: 'auto',
  modelMini: 'gpt-5.4-mini',
  effort: 'medium',
  serviceTier: 'fast'
};

/**
 * Create `.claude/codex-defaults.json` with sensible defaults if it doesn't exist.
 * Returns `true` when a new file was created, `false` otherwise.
 *
 * @param {string} workspaceRoot - Absolute path to the workspace root
 * @returns {Promise<boolean>}
 */
export async function scaffoldProjectConfig(workspaceRoot) {
  const configPath = join(workspaceRoot, '.claude', 'codex-defaults.json');

  try {
    await access(configPath);
    return false; // already exists
  } catch {
    // file doesn't exist — proceed to create
  }

  try {
    await mkdir(join(workspaceRoot, '.claude'), { recursive: true });
    await writeFile(configPath, JSON.stringify(SCAFFOLD_DEFAULTS, null, 2) + '\n');
    return true;
  } catch {
    return false; // non-critical — silently degrade
  }
}
