import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequestRegistry } from '../../scripts/lib/mcp-runtime.mjs';
import { installShutdownHandlers } from '../../scripts/mcp-server.mjs';

test('createRequestRegistry exposes cancelAll that calls cancel on every entry', () => {
  const registry = createRequestRegistry();
  const reasons = [];

  registry.set('a', { cancel: (reason) => reasons.push(['a', reason]) });
  registry.set('b', { cancel: (reason) => reasons.push(['b', reason]) });
  registry.set('c', { cancel: () => { throw new Error('c exploded'); } });
  registry.set('d', { /* no cancel function */ });

  // Must not throw even when individual cancels throw.
  registry.cancelAll('shutdown:SIGTERM');

  // Both healthy entries got the reason; the throwing one was tolerated;
  // the entry with no cancel was skipped.
  assert.deepEqual(reasons.sort(), [['a', 'shutdown:SIGTERM'], ['b', 'shutdown:SIGTERM']]);

  // After cancelAll the registry is empty so a subsequent shutdown is a no-op.
  registry.cancelAll('shutdown:retry');
  assert.deepEqual(reasons.sort(), [['a', 'shutdown:SIGTERM'], ['b', 'shutdown:SIGTERM']]);
});

test('createRequestRegistry.cancelAll defaults to "shutdown" reason when none provided', () => {
  const registry = createRequestRegistry();
  let received;
  registry.set('x', { cancel: (reason) => { received = reason; } });

  registry.cancelAll();

  assert.equal(received, 'shutdown');
});

test('installShutdownHandlers cancels in-flight requests and closes server on SIGTERM', async () => {
  const proc = new EventEmitter();
  proc.once = proc.once.bind(proc);
  proc.stderr = { write: () => true };

  const cancels = [];
  const closes = [];
  let exitCode;

  const registry = createRequestRegistry();
  registry.set('a', { cancel: (reason) => cancels.push(['a', reason]) });
  registry.set('b', { cancel: (reason) => cancels.push(['b', reason]) });

  const server = {
    requestRegistry: registry,
    close: async () => {
      closes.push('closed');
    }
  };

  const exitPromise = new Promise((resolve) => {
    installShutdownHandlers({
      server,
      proc,
      exit: (code) => {
        exitCode = code;
        resolve();
      },
      log: () => {}
    });
  });

  proc.emit('SIGTERM');
  await exitPromise;

  assert.deepEqual(cancels.sort(), [['a', 'shutdown:SIGTERM'], ['b', 'shutdown:SIGTERM']]);
  assert.deepEqual(closes, ['closed']);
  assert.equal(exitCode, 0);
});

test('installShutdownHandlers is idempotent — second signal during shutdown is ignored', async () => {
  const proc = new EventEmitter();
  proc.once = proc.once.bind(proc);
  proc.stderr = { write: () => true };

  let cancelCalls = 0;
  let exits = 0;

  const registry = createRequestRegistry();
  registry.set('only', { cancel: () => { cancelCalls += 1; } });

  // Slow close so we can fire a second signal while shutdown is in progress.
  let resolveClose;
  const closeStarted = new Promise((resolve) => {
    resolveClose = resolve;
  });
  const server = {
    requestRegistry: registry,
    close: () => {
      resolveClose();
      return new Promise((r) => setTimeout(r, 30));
    }
  };

  const exitPromise = new Promise((resolve) => {
    installShutdownHandlers({
      server,
      proc,
      signals: ['SIGTERM', 'SIGINT'],
      exit: () => {
        exits += 1;
        resolve();
      },
      log: () => {}
    });
  });

  proc.emit('SIGTERM');
  await closeStarted;
  proc.emit('SIGINT'); // should be a no-op
  await exitPromise;

  // cancelAll cleared the entry on first call; second handler invocation must
  // short-circuit via the shuttingDown flag and not re-iterate the registry.
  assert.equal(cancelCalls, 1);
  assert.equal(exits, 1);
});

test('installShutdownHandlers tolerates a server that throws on close', async () => {
  const proc = new EventEmitter();
  proc.once = proc.once.bind(proc);
  proc.stderr = { write: () => true };

  let exitCode;
  const server = {
    requestRegistry: createRequestRegistry(),
    close: () => { throw new Error('transport already gone'); }
  };

  const exitPromise = new Promise((resolve) => {
    installShutdownHandlers({
      server,
      proc,
      exit: (code) => {
        exitCode = code;
        resolve();
      },
      log: () => {}
    });
  });

  proc.emit('SIGTERM');
  await exitPromise;

  assert.equal(exitCode, 0);
});
