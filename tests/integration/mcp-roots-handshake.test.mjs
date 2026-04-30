/**
 * mcp-roots-handshake.test.mjs
 *
 * Regression test for the "tool calls hang for 60s" bug: the MCP server used
 * to send `roots/list` to every client unconditionally, then wait the SDK's
 * 60s default timeout when the client did not advertise the roots capability.
 *
 * After the fix, the server skips `roots/list` entirely when the client did
 * not advertise `roots` in its capabilities, so a tool call must complete
 * quickly with a workspace-root validation error (no Codex spawn, no hang).
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
        if (msg.id !== undefined && msg.method) {
          requestsFromServer.push(msg);
        } else {
          responses.push(msg);
        }
      } catch {
        // ignore non-JSON diagnostic noise
      }
    }
  });

  proc.stderr.on('data', () => {
    // suppress; server may log Codex diagnostics
  });

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

async function waitForResponse(harness, id, deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const r = harness.responses.find((m) => m.id === id);
    if (r) return r;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

test(
  'tools/call with no roots capability does not send roots/list and fails fast on missing workspaceRoot',
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
          capabilities: {},
          clientInfo: { name: 'roots-handshake-test', version: '0' }
        }
      });
      const init = await waitForResponse(h, 1, 5000);
      assert.ok(init, 'initialize should respond within 5s');

      h.send({ jsonrpc: '2.0', method: 'notifications/initialized' });

      // Call a tool without supplying workspaceRoot. With the fix, this fails
      // fast with the workspace validation error from selectWorkspaceRoot.
      // Without the fix, the server hangs ~60s waiting for roots/list.
      h.send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'codex_research',
          arguments: { prompt: 'noop' }
        }
      });

      const t0 = Date.now();
      const resp = await waitForResponse(h, 2, 10_000);
      const elapsedMs = Date.now() - t0;

      assert.ok(resp, 'tools/call must return within 10s');
      assert.ok(elapsedMs < 5_000, `tools/call should not hang on roots/list (took ${elapsedMs}ms)`);

      // The server must not have sent a roots/list request — the client did
      // not advertise the roots capability.
      const rootsRequests = h.requestsFromServer.filter((r) => r.method === 'roots/list');
      assert.equal(rootsRequests.length, 0, 'server must not call roots/list when client lacks roots capability');

      // Response should signal the workspace-root validation error.
      assert.equal(resp.result?.isError, true, 'expected an isError response');
      assert.match(
        resp.result?.content?.[0]?.text ?? '',
        /workspaceRoot/i,
        'error message should reference workspaceRoot validation'
      );
    } finally {
      await h.stop();
    }
  }
);
