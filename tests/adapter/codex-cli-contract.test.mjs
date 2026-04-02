import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCodexVersion, verifyCodexCliContract } from '../../scripts/check-codex-cli.mjs';
import { detectCodexRuntime } from '../../scripts/detect-codex.mjs';

test('verifyCodexCliContract accepts the required exec, resume, and review surface', () => {
  const result = verifyCodexCliContract({
    versionText: 'codex-cli 0.111.0',
    execHelp:
      'Run Codex non-interactively\nresume  Resume a previous session by id or pick the most recent with --last\n-s, --sandbox <SANDBOX_MODE>\n--output-schema <FILE>\n--json',
    resumeHelp: 'Resume a previous session by id or pick the most recent with --last\n--last',
    reviewHelp: 'Run a code review non-interactively\n--base <BRANCH>\n--commit <SHA>'
  });

  assert.equal(result.version, '0.111.0');
  assert.deepEqual(result.missing, []);
});

test('parseCodexVersion rejects versions lower than the supported floor', () => {
  assert.throws(
    () => parseCodexVersion('codex-cli 0.110.9'),
    /minimum supported Codex CLI version is 0.111.0/
  );
});

test('detectCodexRuntime treats a successful login status call as authenticated', async () => {
  const calls = [];
  const runner = async (command, args) => {
    calls.push([command, args]);

    if (args[0] === '--version') {
      return { stdout: 'codex-cli 0.111.0\n' };
    }

    if (args[0] === 'login') {
      return { stdout: 'Logged in using ChatGPT\n' };
    }

    throw new Error(`Unexpected invocation: ${command} ${args.join(' ')}`);
  };

  const runtime = await detectCodexRuntime({ runner });

  assert.equal(runtime.installed, true);
  assert.equal(runtime.authenticated, true);
  assert.equal(runtime.authProvider, 'chatgpt');
  assert.equal(runtime.version, 'codex-cli 0.111.0');
  assert.deepEqual(calls, [
    ['codex', ['--version']],
    ['codex', ['login', 'status']]
  ]);
});
