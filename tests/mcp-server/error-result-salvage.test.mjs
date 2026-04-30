import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolCallHandler } from '../../scripts/mcp-server.mjs';

function makeRequest(name, args = {}) {
  return {
    id: 7,
    params: { name, arguments: args }
  };
}

test('handler returns resume hint and structured session id when runWorkflow throws salvaged metadata', async () => {
  const handleToolCall = createToolCallHandler({
    pluginRoot: '/plugin',
    getRoots: async () => [{ uri: 'file:///repo' }],
    runWorkflow: async () => {
      const error = new Error('codex implement timed out (ETIMEDOUT)');
      error.taskId = 'phase-3';
      error.sessionId = 'thread-salvaged';
      error.salvageReason = 'partial-jsonl-thread';
      error.stderr = 'deadline exceeded';
      throw error;
    }
  });

  const result = await handleToolCall(
    makeRequest('codex_implement', {
      taskId: 'phase-3',
      prompt: 'Implement phase 3.',
      workspaceRoot: '/repo'
    })
  );

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Session saved as taskId=phase-3 \(sessionId=thread-salvaged\)/);
  assert.match(result.content[0].text, /Resume with codex_resume/);
  assert.equal(result.structuredContent.status, 'error');
  assert.equal(result.structuredContent.taskId, 'phase-3');
  assert.equal(result.structuredContent.sessionId, 'thread-salvaged');
  assert.match(result.structuredContent.stderrTail, /deadline exceeded/);
});
