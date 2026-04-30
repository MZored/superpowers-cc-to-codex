import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const REPO_ROOT = new URL('../../', import.meta.url);

async function readJson(rel) {
  return JSON.parse(await readFile(new URL(rel, REPO_ROOT), 'utf8'));
}

test('npm test covers every non-smoke integration regression test', async () => {
  // Smoke tests run live Codex/MCP servers and are intentionally separate
  // (npm run smoke-test, npm run smoke-test:mcp). Every other integration
  // test is a deterministic regression test that MUST run in CI via npm test.
  const SMOKE_TESTS = new Set(['smoke.test.mjs', 'mcp-server-smoke.test.mjs']);
  const integrationDir = new URL('tests/integration/', REPO_ROOT);
  const entries = await readdir(integrationDir);
  const regressionTests = entries
    .filter((name) => name.endsWith('.test.mjs') && !SMOKE_TESTS.has(name))
    .sort();

  assert.ok(regressionTests.length > 0, 'expected at least one regression test in tests/integration/');

  const pkg = await readJson('package.json');
  const npmTest = pkg.scripts?.test ?? '';

  for (const file of regressionTests) {
    assert.ok(
      npmTest.includes('tests/integration/'),
      `npm test should include tests/integration/ glob (missing for ${file})\nnpm test = ${npmTest}`
    );
  }
});

test('CI workflow runs npm test (covers all regression tests)', async () => {
  const ciYaml = await readFile(new URL('.github/workflows/validate.yml', REPO_ROOT), 'utf8');
  assert.match(ciYaml, /npm test/, 'CI must invoke npm test');
});
