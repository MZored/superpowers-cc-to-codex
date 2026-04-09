import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  CallToolResultSchema,
  LoggingMessageNotificationSchema,
  ProgressNotificationSchema
} from '@modelcontextprotocol/sdk/types.js';

test('integration client observes progress and logging notifications during a tool call', { timeout: 20_000 }, async () => {
  const client = new Client(
    { name: 'lifecycle-test', version: '1.0.0' },
    { capabilities: { roots: { listChanged: true } } }
  );

  const progress = [];
  const logs = [];

  client.setNotificationHandler(ProgressNotificationSchema, (notification) => {
    progress.push(notification.params.message);
  });
  client.setNotificationHandler(LoggingMessageNotificationSchema, (notification) => {
    logs.push(notification.params.level);
  });

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['tests/fixtures/mcp-server/stub-lifecycle-launcher.mjs'],
    cwd: process.cwd()
  });

  await client.connect(transport);

  const result = await client.callTool(
    {
      name: 'codex_plan',
      arguments: {
        prompt: 'Return a small plan object.',
        workspaceRoot: process.cwd()
      }
    },
    CallToolResultSchema,
    {
      timeout: 20_000,
      resetTimeoutOnProgress: true,
      onprogress: () => {}
    }
  );

  assert.equal(result.structuredContent.status, 'ok');
  assert.match(progress[0] ?? '', /Codex process started/);
  assert.ok(logs.includes('warning'));

  await client.close();
});
