import { spawn } from 'node:child_process';

export async function runCommand(command, args, { cwd, stdin, signal, onSpawn } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    onSpawn?.(child);

    function abort() {
      child.kill('SIGTERM');
    }

    if (signal?.aborted) {
      child.kill('SIGTERM');
    } else if (signal) {
      signal.addEventListener('abort', abort, { once: true });
    }

    child.on('error', (err) => {
      signal?.removeEventListener('abort', abort);
      reject(err);
    });

    child.on('close', (code, closeSignal) => {
      signal?.removeEventListener('abort', abort);

      if (signal?.aborted || closeSignal !== null) {
        const reason = signal?.reason;
        const message =
          reason instanceof Error
            ? reason.message
            : typeof reason === 'string'
              ? reason
              : closeSignal
                ? `process terminated by signal ${closeSignal}`
                : 'operation aborted';
        const error = new Error(message);
        error.signal = closeSignal ?? 'SIGTERM';
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }

      if (code === 0) {
        resolve({ stdout, stderr, code });
        return;
      }

      const error = new Error(`${command} ${args.join(' ')} exited with code ${code}`);
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });

    if (stdin) {
      child.stdin.end(stdin);
      return;
    }

    child.stdin.end();
  });
}
