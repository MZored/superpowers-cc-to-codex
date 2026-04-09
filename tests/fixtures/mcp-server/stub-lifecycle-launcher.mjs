import { setTimeout as delay } from 'node:timers/promises';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from '../../../scripts/mcp-server.mjs';

const mixedStdout = [
  '2026-04-09T17:12:54.078044Z  WARN codex_state::runtime: failed to open state db',
  '{"type":"thread.started","thread_id":"thread-lifecycle"}',
  '{"type":"turn.started"}',
  '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"status\\":\\"DONE\\",\\"summary\\":\\"ok\\"}"}}',
  '{"type":"turn.completed","usage":{"input_tokens":1,"cached_input_tokens":0,"output_tokens":1}}'
].join('\n');

const server = await createMcpServer({
  runWorkflow: async ({ onSpawn, onStdoutChunk }) => {
    onSpawn({ terminate() {} });

    for (const line of mixedStdout.split('\n')) {
      onStdoutChunk(`${line}\n`);
      await delay(5);
    }

    return { stdout: mixedStdout, stderr: '' };
  }
});

await server.connect(new StdioServerTransport());
