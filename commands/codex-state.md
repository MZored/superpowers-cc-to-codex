---
description: List saved Codex task state for the current workspace so a controller can resume the right thread.
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/list-codex-state.mjs" --cwd "$PWD"
```

The command prints JSON with each saved workspace resume `taskId`, `phase`, `role`, `cwd`, and `sessionId`.

Experimental MCP task-mode records are stored separately under `${CLAUDE_PLUGIN_DATA}/mcp-tasks/` and are not included in this command.
