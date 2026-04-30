/**
 * error-message-truncation.test.mjs
 *
 * Regression test: when the Codex CLI fails with a huge stderr or a long
 * argv (which `runCommand` includes verbatim in `error.message`), the MCP
 * tool result must not echo the raw message onto the JSON-RPC wire — the
 * displayed text must be bounded.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolCallHandler } from '../../scripts/mcp-server.mjs';

test('buildErrorResult truncates oversized error.message in displayed text', async () => {
  const huge = 'x'.repeat(10_000);
  const handleToolCall = createToolCallHandler({
    pluginRoot: '/plugin',
    getRoots: async () => [{ uri: 'file:///repo' }],
    runWorkflow: async () => {
      const error = new Error(`codex exec --json --huge-arg ${huge} exited with code 1`);
      error.stdout = '';
      error.stderr = '';
      throw error;
    }
  });

  const result = await handleToolCall({
    id: 1,
    params: {
      name: 'codex_research',
      arguments: { prompt: 'noop', workspaceRoot: '/repo' }
    }
  });

  assert.equal(result.isError, true, 'expected error result');

  const text = result.content?.[0]?.text ?? '';
  assert.ok(
    text.length < 2_000,
    `displayed text must be bounded (got ${text.length} chars)`
  );
  assert.match(text, /\.\.\.\[truncated \d+ chars]/, 'expected truncation marker');
  assert.match(text, /codex research failed:/, 'expected workflow-name prefix');
});

test('buildErrorResult leaves short error messages untouched', async () => {
  const handleToolCall = createToolCallHandler({
    pluginRoot: '/plugin',
    getRoots: async () => [{ uri: 'file:///repo' }],
    runWorkflow: async () => {
      const error = new Error('boom: small failure');
      error.stdout = '';
      error.stderr = '';
      throw error;
    }
  });

  const result = await handleToolCall({
    id: 1,
    params: {
      name: 'codex_research',
      arguments: { prompt: 'noop', workspaceRoot: '/repo' }
    }
  });

  assert.equal(result.isError, true);
  const text = result.content?.[0]?.text ?? '';
  assert.match(text, /boom: small failure/);
  assert.doesNotMatch(text, /\.\.\.\[truncated/);
});
