import test from 'node:test';
import assert from 'node:assert/strict';
import { runCommand } from '../../scripts/lib/run-command.mjs';

test('runCommand captures stdout larger than one mebibyte', async () => {
  const { stdout } = await runCommand(process.execPath, [
    '-e',
    "process.stdout.write('x'.repeat(1_200_000))"
  ]);

  assert.equal(stdout.length, 1_200_000);
});

test('runCommand forwards stdin to the child process', async () => {
  const { stdout } = await runCommand(
    process.execPath,
    ['-e', "process.stdin.setEncoding('utf8'); let data=''; process.stdin.on('data', chunk => data += chunk); process.stdin.on('end', () => process.stdout.write(data.toUpperCase()));"],
    { stdin: 'codex\n' }
  );

  assert.equal(stdout, 'CODEX\n');
});

test('runCommand streams stdout and stderr chunks while still returning combined output', async () => {
  let stdoutFromCallback = '';
  let stderrFromCallback = '';
  let stdoutChunks = 0;
  let stderrChunks = 0;

  const { stdout, stderr } = await runCommand(
    process.execPath,
    [
      '-e',
      [
        "process.stdout.write('alpha');",
        "setTimeout(() => process.stdout.write('beta'), 10);",
        "setTimeout(() => process.stderr.write('warn'), 5);"
      ].join(' ')
    ],
    {
      onStdout: (chunk) => {
        stdoutChunks += 1;
        stdoutFromCallback += chunk;
      },
      onStderr: (chunk) => {
        stderrChunks += 1;
        stderrFromCallback += chunk;
      }
    }
  );

  assert.ok(stdoutChunks > 0);
  assert.ok(stderrChunks > 0);
  assert.equal(stdoutFromCallback, stdout);
  assert.equal(stderrFromCallback, stderr);
  assert.equal(stdout, 'alphabeta');
  assert.equal(stderr, 'warn');
});

test('runCommand terminates the child when the abort signal fires', async () => {
  const controller = new AbortController();
  const promise = runCommand(process.execPath, ['-e', 'setTimeout(() => {}, 10_000)'], {
    signal: controller.signal
  });

  controller.abort();

  await assert.rejects(promise, /aborted|signal|terminated/i);
});

test('runCommand escalates to SIGKILL when the child ignores SIGTERM', async () => {
  const controller = new AbortController();
  const promise = runCommand(
    process.execPath,
    [
      '-e',
      [
        "process.on('SIGTERM', () => {});",
        'setInterval(() => {}, 1_000);'
      ].join(' ')
    ],
    {
      signal: controller.signal,
      termination: { graceMs: 25 }
    }
  );

  controller.abort('aborted');

  await assert.rejects(promise, /SIGKILL|aborted|terminated/i);
});
