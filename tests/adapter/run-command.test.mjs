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
