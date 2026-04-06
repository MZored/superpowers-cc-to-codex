import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertWritableStateDir } from '../../scripts/doctor.mjs';

test('assertWritableStateDir creates the state directory and cleans up the probe file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-doctor-'));
  const calls = { mkdir: [], writeFile: [], rm: [] };

  const fs = {
    mkdir: async (dir, opts) => {
      calls.mkdir.push(dir);
      return (await import('node:fs/promises')).mkdir(dir, opts);
    },
    writeFile: async (path, data, enc) => {
      calls.writeFile.push(path);
      return (await import('node:fs/promises')).writeFile(path, data, enc);
    },
    rm: async (path) => {
      calls.rm.push(path);
      return (await import('node:fs/promises')).rm(path);
    }
  };

  await assertWritableStateDir(root, { fs });

  assert.equal(calls.mkdir.length, 1);
  assert.ok(calls.mkdir[0].endsWith(join('.claude', 'state', 'codex')));
  assert.equal(calls.writeFile.length, 1);
  assert.ok(calls.writeFile[0].endsWith('.doctor-write-test'));
  assert.equal(calls.rm.length, 1, 'probe file must be cleaned up');
});

test('assertWritableStateDir throws when the directory is not writable', async () => {
  const fs = {
    mkdir: async () => {
      throw new Error('EACCES: permission denied');
    },
    writeFile: async () => {},
    rm: async () => {}
  };

  await assert.rejects(
    assertWritableStateDir('/nonexistent', { fs }),
    /permission denied/
  );
});
