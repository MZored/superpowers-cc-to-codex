# Architecture

- Claude remains the controller and spec-review owner.
- The primary transport from Claude to Codex is the MCP server (`scripts/mcp-server.mjs`), registered in `.claude-plugin/plugin.json` under `mcpServers.codex`.
- `scripts/codex-run.mjs` is the only place that knows how to invoke the Codex CLI; the MCP server delegates through it.
- The default execution path is synchronous `tools/call` with lifecycle-aware `notifications/progress` and structured `notifications/message`.
- Experimental task mode for `codex_implement` and `codex_resume` is server-global and off by default; enable it with `SUPERPOWERS_CODEX_EXPERIMENTAL_TASKS=implement-resume`.
- There is no runtime dependency on `codex-plugin-cc`; only the public `codex` CLI is required.
- Task session state lives under `.claude/state/codex/` so plugin updates do not destroy resume metadata.
- Experimental MCP task records live under `${CLAUDE_PLUGIN_DATA}/mcp-tasks/`, separate from repo-local resume state.
- The `agents/` directory contains deprecated compatibility shims retained for phase 1; they are not the primary dispatch path.
