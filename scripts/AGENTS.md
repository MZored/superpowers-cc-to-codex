# Scripts

Core runtime adapter and utilities for Codex CLI integration.

## Key Files

| File | Role |
|------|------|
| `codex-run.mjs` | Single adapter for ALL Codex CLI invocations |
| `detect-codex.mjs` | Locates codex binary at runtime |
| `doctor.mjs` | Plugin health check and CLI validation |
| `check-upstream-superpowers.mjs` | Detects upstream fork drift |
| `list-codex-state.mjs` | Lists saved task state for debugging |
| `lib/codex-state.mjs` | Task state load/save with optional/required variants |
| `lib/codex-cli-contract.mjs` | CLI version and capability checks |
| `lib/review-scope.mjs` | Git diff scope extraction for reviews |

## Conventions

- `codex-run.mjs` is the ONLY file that spawns the codex process — all skills delegate through it via the MCP server
- CLI entry detection: `import.meta.url === \`file://${process.argv[1]}\``
- Functions accept `runner` parameter for testability (dependency injection, no mocking library)
- State files stored as `.claude/state/codex/{taskId}.json` — outside plugin root

## Anti-Patterns

- Calling codex CLI directly from skills or scripts — always go through codex-run.mjs
- Storing state inside the plugin directory tree
