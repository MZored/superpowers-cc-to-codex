# Architecture

- Claude remains the controller and spec-review owner.
- The primary transport from Claude to Codex is the MCP server (`scripts/mcp-server.mjs`), registered in `.claude-plugin/plugin.json` under `mcpServers.codex`.
- `scripts/codex-run.mjs` is the only place that knows how to invoke the Codex CLI; the MCP server delegates through it.
- There is no runtime dependency on `codex-plugin-cc`; only the public `codex` CLI is required.
- Task session state lives under `.claude/state/codex/` so plugin updates do not destroy resume metadata.
- The `agents/` directory contains deprecated compatibility shims retained for phase 1; they are not the primary dispatch path.
