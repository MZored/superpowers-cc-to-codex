---
paths:
  - "tests/**"
---

# Tests

Test suite using Node.js native test runner (`node:test` + `node:assert/strict`).

## Structure

- `adapter/` — Integration tests for CLI adapter layer and plugin contracts
- `prompt-contracts/` — Behavioral tests for forked workflow compatibility
- `fixtures/` — Reference data (SKILL.md samples, JSONL events, prompt files)

## Conventions

- No external test framework or mocking library
- Testability via dependency injection (pass `runner` functions)
- Fixtures use `import.meta.url` for module-relative path resolution
- Tests validate contracts, not implementation — check outputs and structures
