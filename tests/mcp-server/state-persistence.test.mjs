import test from 'node:test';
import assert from 'node:assert/strict';
import { runWithMcpRuntime, createRequestRegistry } from '../../scripts/lib/mcp-runtime.mjs';

test('runWithMcpRuntime status ok result exposes sessionId, assistantText, and result', async () => {
  const stdout = [
    '{"type":"thread.started","thread_id":"thread-persist-1"}',
    '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"status\\":\\"DONE\\",\\"summary\\":\\"all good\\"}"}}'
  ].join('\n');

  const result = await runWithMcpRuntime({
    requestId: 'req-persist',
    timeoutMs: 5000,
    operation: async ({ markSpawned }) => {
      markSpawned({ kill() {} });
      return { stdout, stderr: '' };
    }
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.timedOut, false);
  assert.equal(result.sessionId, 'thread-persist-1');
  assert.deepEqual(result.result, { status: 'DONE', summary: 'all good' });
  assert.equal(typeof result.assistantText, 'string');
  assert.match(result.assistantText, /DONE/);
  assert.equal(typeof result.stderrTail, 'string');
});

test('createRequestRegistry set and get returns the stored entry', () => {
  const registry = createRequestRegistry();
  const entry = { controller: new AbortController(), child: null };

  registry.set('req-a', entry);
  const retrieved = registry.get('req-a');

  assert.equal(retrieved, entry);
});

test('createRequestRegistry get returns null for unknown request id', () => {
  const registry = createRequestRegistry();

  const result = registry.get('nonexistent');

  assert.equal(result, null);
});

test('createRequestRegistry delete removes entry so subsequent get returns null', () => {
  const registry = createRequestRegistry();
  const entry = { controller: new AbortController(), child: null };

  registry.set('req-b', entry);
  registry.delete('req-b');
  const result = registry.get('req-b');

  assert.equal(result, null);
});

test('createRequestRegistry multiple entries coexist independently', () => {
  const registry = createRequestRegistry();
  const entryA = { id: 'a' };
  const entryB = { id: 'b' };

  registry.set('req-a', entryA);
  registry.set('req-b', entryB);

  assert.equal(registry.get('req-a'), entryA);
  assert.equal(registry.get('req-b'), entryB);

  registry.delete('req-a');
  assert.equal(registry.get('req-a'), null);
  assert.equal(registry.get('req-b'), entryB);
});
