/**
 * codex-run-salvage.test.mjs
 *
 * Regression: when the codex CLI fails AND the salvaged partial result is
 * malformed (validateImplementerResult throws), the validation error must
 * still carry the salvaged sessionId/taskId so callers can resume the thread.
 *
 * Without the fix, the validation error replaced the executor error and
 * dropped the resume hint, leaving the operator with no way to recover.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCodexWorkflow } from '../../scripts/codex-run.mjs';

function malformedJsonl(threadId) {
  // thread.started gives us a sessionId; agent_message has bogus JSON that
  // parses into an object, but the object is missing required keys —
  // validateImplementerResult will reject it.
  return [
    JSON.stringify({ type: 'thread.started', thread_id: threadId }),
    JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', text: JSON.stringify({ status: 'DONE' }) } // missing summary, files_changed, ...
    })
  ].join('\n');
}

test('malformed partial implementer-result preserves salvaged sessionId on the thrown validation error', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'codex-salvage-'));
  try {
    const taskId = 'task-salvage';
    const threadId = '019d4f82-58b8-72d3-9212-2e3d3fc69bcb';

    let thrown;
    try {
      await runCodexWorkflow({
        mode: 'implement',
        cwd,
        taskId,
        schemaPath: '/some/schema.json',
        runtimeDetector: async () => ({ authProvider: 'chatgpt' }),
        executor: async () => {
          const error = new Error('codex exec exited with code 1');
          error.stdout = malformedJsonl(threadId);
          error.stderr = '';
          throw error;
        }
      });
    } catch (err) {
      thrown = err;
    }

    assert.ok(thrown, 'runCodexWorkflow should propagate an error');
    assert.match(thrown.message, /implementer-result/i, 'expected validation error');
    assert.equal(thrown.taskId, taskId, 'salvaged taskId must survive validation throw');
    assert.equal(thrown.sessionId, threadId, 'salvaged sessionId must survive validation throw');
    assert.equal(thrown.salvageReason, 'malformed-partial-result');
    assert.ok(thrown.cause, 'underlying executor error should be attached as cause');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('valid partial implementer-result still re-throws the executor error with salvage info', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'codex-salvage-ok-'));
  try {
    const taskId = 'task-ok-salvage';
    const threadId = '019d4f82-58b8-72d3-9212-2e3d3fc69bcb';
    const validResult = {
      status: 'BLOCKED',
      summary: 'partial work',
      files_changed: [],
      tests: [],
      concerns: ['interrupted before tests']
    };

    const validJsonl = [
      JSON.stringify({ type: 'thread.started', thread_id: threadId }),
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: JSON.stringify(validResult) }
      })
    ].join('\n');

    let thrown;
    try {
      await runCodexWorkflow({
        mode: 'implement',
        cwd,
        taskId,
        schemaPath: '/some/schema.json',
        runtimeDetector: async () => ({ authProvider: 'chatgpt' }),
        executor: async () => {
          const error = new Error('codex exec exited with code 1');
          error.stdout = validJsonl;
          error.stderr = '';
          throw error;
        }
      });
    } catch (err) {
      thrown = err;
    }

    assert.ok(thrown);
    assert.match(thrown.message, /exited with code 1/, 'should re-throw executor error');
    assert.equal(thrown.taskId, taskId);
    assert.equal(thrown.sessionId, threadId);
    assert.equal(thrown.salvageReason, 'partial-jsonl-thread');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
