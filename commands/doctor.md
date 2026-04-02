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
- Plugin manifests validate cleanly via `claude plugin validate .`
- The current workspace is suitable for adapter-managed state under `.claude/state/codex/`
