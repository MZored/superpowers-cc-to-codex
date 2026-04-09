import test from 'node:test';
import assert from 'node:assert/strict';
import { createProcessTerminator } from '../../scripts/lib/process-termination.mjs';

test('createProcessTerminator sends SIGTERM first and SIGKILL after the grace period', () => {
  const signals = [];
  const scheduled = [];
  const listeners = new Map();

  const terminator = createProcessTerminator(
    {
      kill(signal) {
        signals.push(signal);
      },
      once(event, handler) {
        listeners.set(event, handler);
      }
    },
    {
      graceMs: 50,
      setTimeoutFn(callback, delay) {
        scheduled.push({ callback, delay });
        return { callback, delay };
      },
      clearTimeoutFn() {}
    }
  );

  assert.equal(terminator.terminate('timed out'), 'timed out');
  assert.deepEqual(signals, ['SIGTERM']);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 50);
  assert.equal(terminator.terminate('second attempt'), undefined);
  assert.deepEqual(signals, ['SIGTERM']);
  assert.equal(scheduled.length, 1);

  scheduled[0].callback();

  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(typeof listeners.get('close'), 'function');
  assert.equal(typeof listeners.get('exit'), 'function');
});
