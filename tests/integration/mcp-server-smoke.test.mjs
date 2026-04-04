/**
 * mcp-server-smoke.test.mjs
 *
 * Integration smoke test for the stdio MCP server.
 * Spawns scripts/mcp-server.mjs as a child process via StdioClientTransport,
 * performs the full initialize → initialized → tools/list handshake, and
 * verifies that all 7 workflow tools are advertised.
 *
 * NOTE: This test does NOT invoke the Codex CLI — tools/call is out of scope.
 * For codex-run.mjs smoke tests, see tests/integration/smoke.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';

test('sdk client can complete initialize + initialized and list tools', { timeout: 15_000 }, async () => {
  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { capabilities: { roots: { listChanged: true } } }
  );

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['scripts/mcp-server.mjs'],
    cwd: process.cwd()
  });

  await client.connect(transport);

  const tools = await client.request({ method: 'tools/list', params: {} }, ListToolsResultSchema);

  assert.ok(Array.isArray(tools.tools), 'tools.tools should be an array');
  assert.equal(tools.tools.length, 7, 'should expose all 7 workflow tools');
  assert.ok(tools.tools.some((tool) => tool.name === 'codex_plan'), 'codex_plan should be listed');
  assert.ok(tools.tools.some((tool) => tool.name === 'codex_implement'), 'codex_implement should be listed');
  assert.ok(tools.tools.some((tool) => tool.name === 'codex_research'), 'codex_research should be listed');
  assert.ok(tools.tools.some((tool) => tool.name === 'codex_review'), 'codex_review should be listed');
  assert.ok(tools.tools.some((tool) => tool.name === 'codex_debug'), 'codex_debug should be listed');
  assert.ok(tools.tools.some((tool) => tool.name === 'codex_branch_analysis'), 'codex_branch_analysis should be listed');
  assert.ok(tools.tools.some((tool) => tool.name === 'codex_resume'), 'codex_resume should be listed');

  await client.close();
});

test('each listed tool has name, description, and inputSchema', { timeout: 15_000 }, async () => {
  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { capabilities: {} }
  );

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['scripts/mcp-server.mjs'],
    cwd: process.cwd()
  });

  await client.connect(transport);

  const tools = await client.request({ method: 'tools/list', params: {} }, ListToolsResultSchema);

  for (const tool of tools.tools) {
    assert.ok(typeof tool.name === 'string' && tool.name.length > 0, `${tool.name}: name should be non-empty string`);
    assert.ok(typeof tool.description === 'string' && tool.description.length > 0, `${tool.name}: description should be non-empty string`);
    assert.ok(tool.inputSchema && typeof tool.inputSchema === 'object', `${tool.name}: inputSchema should be an object`);
  }

  await client.close();
});
