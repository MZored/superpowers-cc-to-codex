/**
 * smoke.test.mjs — codex-run.mjs integration smoke tests.
 *
 * Exercises the Codex CLI adapter (scripts/codex-run.mjs) by spawning real
 * Codex processes for all 6 workflow agent modes.
 *
 * For the stdio MCP server smoke test (initialize + tools/list handshake),
 * see tests/integration/mcp-server-smoke.test.mjs.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { detectCodexRuntime } from '../../scripts/detect-codex.mjs';

const execFileAsync = promisify(execFile);
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const CODEX_RUN = resolve(TEST_DIR, '../../scripts/codex-run.mjs');
const PROJECT_CWD = resolve(TEST_DIR, '../..');
const REVIEW_SCHEMA = resolve(TEST_DIR, '../../schemas/code-review.schema.json');

const AGENTS = [
  { name: 'codex-brainstorm-researcher', mode: 'research' },
  { name: 'codex-plan-drafter', mode: 'plan' },
  { name: 'codex-implementer', mode: 'implement' },
  { name: 'codex-reviewer', mode: 'review' },
  { name: 'codex-debug-investigator', mode: 'research' },
  { name: 'codex-branch-analyzer', mode: 'research' }
];

describe('codex-run smoke tests', { timeout: 210_000 }, () => {
  before(async () => {
    const runtime = await detectCodexRuntime();

    if (!runtime.installed) {
      throw new Error(`Codex CLI not found: ${runtime.loginStatus}`);
    }

    if (!runtime.authenticated) {
      throw new Error(`Codex CLI not authenticated: ${runtime.loginStatus}`);
    }
  });

  for (const { name, mode } of AGENTS) {
    it(
      `returns output for ${name}`,
      { timeout: 30_000 },
      async () => {
        const args = [CODEX_RUN, mode, '--cwd', PROJECT_CWD];

        // Structured review (with --schema + --base) routes through codex exec,
        // avoiding codex review CLI's stdin-only prompt limitation.
        if (mode === 'review') {
          args.push('--schema', REVIEW_SCHEMA, '--base', 'HEAD');
        }

        args.push('Respond with exactly: ok');

        const result = await execFileAsync('node', args, {
          cwd: PROJECT_CWD,
          timeout: 30_000
        });

        assert.ok(result.stdout.trim().length > 0);
      }
    );
  }
});
