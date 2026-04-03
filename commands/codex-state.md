---
description: List saved Codex task state for the current workspace so a controller can resume the right thread.
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/list-codex-state.mjs" --cwd "$PWD"
```

The command prints JSON with each saved `taskId`, `phase`, `role`, `cwd`, and `sessionId`.
