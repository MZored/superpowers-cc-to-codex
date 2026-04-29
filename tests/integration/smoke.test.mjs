/**
 * smoke.test.mjs — codex-run.mjs integration smoke tests.
 *
 * Exercises the Codex CLI adapter (scripts/codex-run.mjs) by calling
 * runCodexWorkflow directly — the same entry point the MCP server uses —
 * for the workflow modes that don't require prior session state or git
 * diff setup (research, plan, implement).
 *
 * Skipped modes:
 *  - resume: requires a prior session id; covered by adapter unit tests
 *  - review: requires a structured git diff scope; covered by adapter
 *    unit tests and CLI contract tests
 *
 * For the stdio MCP server smoke test (initialize + tools/list handshake),
 * see tests/integration/mcp-server-smoke.test.mjs.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { detectCodexRuntime } from '../../scripts/detect-codex.mjs';
import { runCodexWorkflow } from '../../scripts/codex-run.mjs';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_CWD = resolve(TEST_DIR, '../..');

const MODES = ['research', 'plan', 'implement'];

describe('codex-run smoke tests', { timeout: 300_000 }, () => {
  let runtimeReady = false;
  let skipReason = '';

  before(async () => {
    const runtime = await detectCodexRuntime();

    if (!runtime.installed) {
      skipReason = `Codex CLI not installed: ${runtime.loginStatus ?? 'unknown'}`;
      return;
    }

    if (!runtime.authenticated) {
      skipReason = `Codex CLI not authenticated: ${runtime.loginStatus ?? 'unknown'}`;
      return;
    }

    runtimeReady = true;
  });

  for (const mode of MODES) {
    it(
      `runCodexWorkflow returns assistantText for mode=${mode}`,
      { timeout: 90_000 },
      async (t) => {
        if (!runtimeReady) {
          t.skip(skipReason || 'Codex runtime unavailable');
          return;
        }

        const output = await runCodexWorkflow({
          mode,
          cwd: PROJECT_CWD,
          taskId: `smoke-${mode}`,
          taskText: 'Respond with exactly the literal string: ok',
          model: 'auto',
          effort: 'auto'
        });

        assert.ok(
          typeof output.assistantText === 'string' && output.assistantText.trim().length > 0,
          `expected non-empty assistantText for mode=${mode}, got: ${JSON.stringify(output.assistantText)}`
        );
      }
    );
  }
});
