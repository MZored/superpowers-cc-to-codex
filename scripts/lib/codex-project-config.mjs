import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ALLOWED_KEYS = ['model', 'modelMini', 'effort', 'serviceTier'];
const EFFORT_VALUES = ['low', 'medium', 'high'];
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
