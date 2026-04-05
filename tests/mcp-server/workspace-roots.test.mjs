import test from 'node:test';
import assert from 'node:assert/strict';
import { assertInsideRoot, selectWorkspaceRoot } from '../../scripts/lib/mcp-workspace.mjs';

test('selectWorkspaceRoot prefers the only advertised root', () => {
  const root = selectWorkspaceRoot({ roots: [{ uri: 'file:///repo' }] });
  assert.equal(root, '/repo');
});

test('selectWorkspaceRoot requires workspaceRoot when multiple roots exist', () => {
  assert.throws(
    () => selectWorkspaceRoot({ roots: [{ uri: 'file:///repo-a' }, { uri: 'file:///repo-b' }] }),
    /workspaceRoot/i
  );
});

test('selectWorkspaceRoot returns workspaceRoot when no roots are advertised', () => {
  const root = selectWorkspaceRoot({ workspaceRoot: '/explicit/repo', roots: [] });
  assert.equal(root, '/explicit/repo');
});

test('selectWorkspaceRoot requires workspaceRoot when no roots are advertised', () => {
  assert.throws(
    () => selectWorkspaceRoot({ roots: [] }),
    /workspaceRoot/i
  );
});

test('assertInsideRoot allows the exact root path', () => {
  assert.doesNotThrow(() => assertInsideRoot('/repo', '/repo'));
});

test('assertInsideRoot allows a child path under the root', () => {
  assert.doesNotThrow(() => assertInsideRoot('/repo', '/repo/src/file.mjs'));
});

test('assertInsideRoot rejects a parent-escape path', () => {
  assert.throws(
    () => assertInsideRoot('/repo', '/repo/../escape'),
    /outside workspace root/
  );
});

test('assertInsideRoot allows a directory whose name starts with ..', () => {
  assert.doesNotThrow(() => assertInsideRoot('/repo', '/repo/..hidden/file'));
});

test('assertInsideRoot rejects an absolute path outside the root', () => {
  assert.throws(
    () => assertInsideRoot('/repo', '/elsewhere/file'),
    /outside workspace root/
  );
});

test('selectWorkspaceRoot rejects relative paths with a helpful example', () => {
  assert.throws(
    () => selectWorkspaceRoot({ workspaceRoot: 'relative/path', roots: [] }),
    (error) => {
      assert.match(error.message, /workspaceRoot/);
      assert.match(error.message, /absolute path/i);
      assert.match(error.message, /file:\/\//);
      // Error should include a concrete example to copy-paste.
      assert.match(error.message, /file:\/\/\//);
      return true;
    }
  );
});

test('selectWorkspaceRoot error names the offending value', () => {
  assert.throws(
    () => selectWorkspaceRoot({ workspaceRoot: './relative', roots: [] }),
    (error) => {
      assert.match(error.message, /\.\/relative/);
      return true;
    }
  );
});
