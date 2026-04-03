# Tests

Test suite using Node.js native test runner (`node:test` + `node:assert/strict`).

## Structure

- `adapter/` — Integration tests for CLI adapter layer and plugin contracts
- `prompt-contracts/` — Behavioral tests for forked workflow compatibility
- `fixtures/` — Reference data (SKILL.md samples, JSONL events, prompt files)

## Key Test Files

| File | Tests |
|------|-------|
| `adapter/codex-run.test.mjs` | Codex adapter prompt building and execution |
| `adapter/codex-state.test.mjs` | Task state persistence and retrieval |
| `adapter/repo-layout.test.mjs` | Plugin manifest and directory structure |
| `adapter/upstream-drift.test.mjs` | Upstream compatibility checks |
| `prompt-contracts/operator-docs.test.mjs` | Validates all skills are registered |
| `prompt-contracts/docs-inventory.test.mjs` | Documentation consistency |

## Conventions

- No external test framework or mocking library
- Testability via dependency injection (pass `runner` functions)
- Fixtures use `import.meta.url` for module-relative path resolution
- Tests validate contracts, not implementation — check outputs and structures
