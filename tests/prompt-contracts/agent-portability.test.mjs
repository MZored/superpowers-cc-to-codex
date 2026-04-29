import test from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';

test('agents/ directory has been removed in favor of the MCP transport', async () => {
  const agentsDir = new URL('../../agents/', import.meta.url);
  await assert.rejects(
    () => stat(agentsDir),
    /ENOENT/,
    'agents/ directory should not exist; MCP server is the only transport'
  );
});
