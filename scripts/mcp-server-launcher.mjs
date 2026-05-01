import { access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runCommand } from './lib/run-command.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = resolve(__dirname, '..');
const RUNTIME_PACKAGES = ['@modelcontextprotocol/sdk', 'zod'];

export async function resolveDependencyFromRoot({ pluginRoot, packageName }) {
  try {
    await access(join(pluginRoot, 'node_modules', ...packageName.split('/'), 'package.json'));
    return true;
  } catch {
    return false;
  }
}

export async function installRuntimeDependencies({ pluginRoot }) {
  try {
    await runCommand('npm', ['install', '--omit=dev'], { cwd: pluginRoot });
  } catch (error) {
    const details = [error.stderr, error.stdout].filter(Boolean).join('\n').trim();
    const suffix = details ? `\n${details}` : '';
    throw new Error(`Failed to install plugin runtime dependencies in ${pluginRoot}.${suffix}`);
  }
}

export async function ensureRuntimeDependencies({
  pluginRoot,
  packages = RUNTIME_PACKAGES,
  resolveDependency = resolveDependencyFromRoot,
  installDependencies = installRuntimeDependencies
}) {
  let missingDependency = null;

  for (const packageName of packages) {
    const installed = await resolveDependency({ pluginRoot, packageName });
    if (!installed) {
      missingDependency = packageName;
      break;
    }
  }

  if (!missingDependency) {
    return;
  }

  await installDependencies({ pluginRoot });

  for (const packageName of packages) {
    const installed = await resolveDependency({ pluginRoot, packageName });
    if (!installed) {
      throw new Error(`Runtime dependency ${packageName} is still unavailable after installation.`);
    }
  }
}

async function loadServerModule(pluginRoot) {
  const serverModuleUrl = pathToFileURL(join(pluginRoot, 'scripts', 'mcp-server.mjs')).href;
  return import(serverModuleUrl);
}

async function loadStdioTransport() {
  return import('@modelcontextprotocol/sdk/server/stdio.js');
}

export async function startMcpServer({
  pluginRoot = PLUGIN_ROOT,
  ensureDependencies = ensureRuntimeDependencies,
  importServerModule = loadServerModule,
  importTransportModule = loadStdioTransport
} = {}) {
  await ensureDependencies({ pluginRoot });

  const [{ createMcpServer }, { StdioServerTransport }] = await Promise.all([
    importServerModule(pluginRoot),
    importTransportModule()
  ]);

  const server = await createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = await startMcpServer();
  // Lazy-import to keep the launcher's static import surface unchanged for
  // downstream consumers that monkeypatch loadServerModule in tests.
  const { installShutdownHandlers } = await loadServerModule(PLUGIN_ROOT);
  installShutdownHandlers({ server });
}
