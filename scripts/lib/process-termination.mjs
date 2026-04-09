export function createProcessTerminator(
  child,
  {
    gracefulSignal = 'SIGTERM',
    forceSignal = 'SIGKILL',
    graceMs = 2_000,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout
  } = {}
) {
  let terminated = false;
  let forceTimer = null;

  function clearForceTimer() {
    if (forceTimer === null) return;
    clearTimeoutFn(forceTimer);
    forceTimer = null;
  }

  child.once?.('close', clearForceTimer);
  child.once?.('exit', clearForceTimer);

  return {
    terminate(reason = 'cancelled') {
      if (terminated) return;

      terminated = true;
      child.kill(gracefulSignal);
      forceTimer = setTimeoutFn(() => {
        forceTimer = null;
        child.kill(forceSignal);
      }, graceMs);
      return reason;
    }
  };
}
