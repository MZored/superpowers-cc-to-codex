import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureRuntimeDependencies } from '../../scripts/mcp-server-launcher.mjs';

test('ensureRuntimeDependencies skips installation when all runtime dependencies resolve', async () => {
  let installCalls = 0;

  await ensureRuntimeDependencies({
    pluginRoot: '/plugin',
    packages: ['@modelcontextprotocol/sdk', 'zod'],
    resolveDependency: async () => true,
    installDependencies: async () => {
      installCalls += 1;
    }
  });

  assert.equal(installCalls, 0);
});

test('ensureRuntimeDependencies installs runtime dependencies when the plugin root is missing them', async () => {
  let installCalls = 0;
  const attempts = [];

  await ensureRuntimeDependencies({
    pluginRoot: '/plugin',
    packages: ['@modelcontextprotocol/sdk', 'zod'],
    resolveDependency: async ({ packageName }) => {
      attempts.push(packageName);
      return installCalls > 0;
    },
    installDependencies: async () => {
      installCalls += 1;
    }
  });

  assert.equal(installCalls, 1);
  assert.deepEqual(attempts, ['@modelcontextprotocol/sdk', '@modelcontextprotocol/sdk', 'zod']);
});
