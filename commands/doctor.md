---
description: Validate that the Codex-backed workflow fork is installed correctly and the required CLIs are ready.
---

Run these checks in order:

```bash
npm run doctor
```

The command must verify:
- Codex is installed and authenticated via `scripts/detect-codex.mjs`
- The installed Codex CLI satisfies the minimum contract via `scripts/check-codex-cli.mjs`
- `git` and `node` are available
- The MCP server boots cleanly via `scripts/mcp-server.mjs`
- Plugin manifests validate cleanly via `claude plugin validate .claude-plugin/plugin.json`
- The current workspace is suitable for adapter-managed state under `.claude/state/codex/`

If validation passes but a resume command still fails, inspect saved sessions with `commands/codex-state.md`.
