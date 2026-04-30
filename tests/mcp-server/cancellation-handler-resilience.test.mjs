import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCancellationNotification } from '../../scripts/mcp-server.mjs';

test('handleCancellationNotification swallows exceptions thrown by entry.cancel()', async () => {
  const deletes = [];
  const logs = [];
  const requestRegistry = {
    get: () => ({
      cancel: () => {
        throw new Error('cancel exploded');
      }
    }),
    delete: (id) => {
      deletes.push(id);
    }
  };
  const sendLog = (payload) => {
    logs.push(payload);
    return Promise.resolve();
  };

  // Must not throw — the SDK invokes the notification handler synchronously
  // and an unhandled exception here would propagate into the transport layer.
  await assert.doesNotReject(async () => {
    handleCancellationNotification({
      notification: { params: { requestId: 'req-1' } },
      requestRegistry,
      sendLog
    });
  });

  // Even on failure, the request entry must be evicted so the registry does
  // not retain a dangling reference to a dead request.
  assert.deepEqual(deletes, ['req-1']);

  // The failure should be surfaced via logging so operators can diagnose it.
  assert.equal(logs.length, 1);
  assert.equal(logs[0].level, 'warning');
  assert.match(JSON.stringify(logs[0]), /cancel exploded/);
});

test('handleCancellationNotification ignores empty requestId', () => {
  let getCalled = false;
  const requestRegistry = {
    get: () => {
      getCalled = true;
      return null;
    },
    delete: () => {}
  };

  handleCancellationNotification({
    notification: { params: {} },
    requestRegistry,
    sendLog: () => {}
  });

  assert.equal(getCalled, false);
});

test('handleCancellationNotification still deletes when no cancel is registered', () => {
  const deletes = [];
  const requestRegistry = {
    get: () => ({}),
    delete: (id) => deletes.push(id)
  };

  handleCancellationNotification({
    notification: { params: { requestId: 'req-2' } },
    requestRegistry,
    sendLog: () => {}
  });

  assert.deepEqual(deletes, ['req-2']);
});
