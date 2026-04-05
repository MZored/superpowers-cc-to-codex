import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { detectCodexRuntime } from './detect-codex.mjs';

const PLUGIN_ROOT = fileURLToPath(new URL('..', import.meta.url));
const MCP_SERVER_PATH = join(PLUGIN_ROOT, 'scripts', 'mcp-server.mjs');

const execFileAsync = promisify(execFile);

async function assertWritableStateDir(root) {
  const dir = join(root, '.claude', 'state', 'codex');
  const probe = join(dir, '.doctor-write-test');
  await mkdir(dir, { recursive: true });
  await writeFile(probe, 'ok\n', 'utf8');
  await rm(probe);
}

async function assertCommand(name, args) {
  await execFileAsync(name, args);
}

const runtime = await detectCodexRuntime();
if (!runtime.installed) {
  throw new Error(runtime.loginStatus);
}

if (!runtime.authenticated) {
  throw new Error(`Codex is not authenticated: ${runtime.loginStatus}`);
}

const fastModeAvailable = runtime.authProvider === 'chatgpt';

await assertCommand('git', ['--version']);
await assertCommand('node', ['--version']);
await assertWritableStateDir(process.cwd());
await assertCommand('node', ['scripts/check-codex-cli.mjs']);
await assertCommand('node', [
  '-e',
  `import(${JSON.stringify(MCP_SERVER_PATH)}).then(({ createMcpServer }) => createMcpServer())`
]);
await assertCommand('claude', ['plugin', 'validate', '.claude-plugin/plugin.json']);

console.log(
  JSON.stringify(
    {
      ok: true,
      codexVersion: runtime.version,
      authProvider: runtime.authProvider,
      fastModeAvailable
    },
    null,
    2
  )
);
