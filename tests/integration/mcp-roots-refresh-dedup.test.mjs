/**
 * mcp-roots-refresh-dedup.test.mjs
 *
 * Regression: when concurrent tool/call requests arrive on a fresh server
 * with an empty roots cache, the server used to call `roots/list` once per
 * request, racing duplicate handshakes against the client. After the fix,
 * the server dedupes a pending refresh and emits at most one `roots/list`
 * even when many tool calls land before the client has answered.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SERVER_SCRIPT = resolve(PLUGIN_ROOT, 'scripts/mcp-server.mjs');

function spawnServer() {
  const proc = spawn(process.execPath, [SERVER_SCRIPT], {
    cwd: PLUGIN_ROOT,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let buffer = '';
  const responses = [];
  const requestsFromServer = [];

  proc.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.method && msg.id !== undefined) {
          requestsFromServer.push(msg);
        } else {
          responses.push(msg);
        }
      } catch {
        /* ignore */
      }
    }
  });
  proc.stderr.on('data', () => {});

  return {
    proc,
    responses,
    requestsFromServer,
    send(payload) {
      proc.stdin.write(`${JSON.stringify(payload)}\n`);
    },
    async stop() {
      proc.kill('SIGTERM');
      await new Promise((r) => proc.once('close', r));
    }
  };
}

async function waitFor(predicate, deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

test(
  'concurrent tool/call requests dedupe roots/list to a single round-trip',
  { timeout: 15_000 },
  async () => {
    const h = spawnServer();
    try {
      h.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          // Advertise roots so the server WILL request roots/list.
          capabilities: { roots: { listChanged: true } },
          clientInfo: { name: 'roots-dedup-test', version: '0' }
        }
      });
      await waitFor(() => h.responses.find((m) => m.id === 1), 5_000);
      h.send({ jsonrpc: '2.0', method: 'notifications/initialized' });

      // Fire 5 tool calls in parallel before answering roots/list. With dedup
      // the server emits exactly one roots/list and waits on the same promise
      // for all 5 dispatches.
      for (let i = 0; i < 5; i += 1) {
        h.send({
          jsonrpc: '2.0',
          id: 100 + i,
          method: 'tools/call',
          params: {
            name: 'codex_research',
            arguments: { prompt: 'noop' }
          }
        });
      }

      // Allow time for the server to dispatch all 5 and (incorrectly) batch
      // multiple roots/list requests.
      const sawRoots = await waitFor(
        () => h.requestsFromServer.some((r) => r.method === 'roots/list'),
        4_000
      );
      assert.ok(sawRoots, 'server should have requested roots/list once');

      // Settle: give the server a small grace window to fire any duplicate
      // roots/list (which the bug used to cause).
      await new Promise((r) => setTimeout(r, 500));

      const rootsRequests = h.requestsFromServer.filter((r) => r.method === 'roots/list');
      assert.equal(
        rootsRequests.length,
        1,
        `server must dedupe roots/list across concurrent tool calls (got ${rootsRequests.length})`
      );

      // Reply with a single root for ALL pending listRoots ids.
      for (const req of rootsRequests) {
        h.send({
          jsonrpc: '2.0',
          id: req.id,
          result: { roots: [{ uri: `file://${PLUGIN_ROOT}`, name: 'pwd' }] }
        });
      }

      // The 5 tool calls should now resolve. We don't care about success — any
      // response (error or ok) demonstrates dispatch unblocked. Wait briefly.
      await waitFor(() => h.responses.filter((m) => m.id >= 100 && m.id <= 104).length === 5, 8_000);
    } finally {
      await h.stop();
    }
  }
);
