<!-- Derived from AGENTS.md by /init-deep. Keep in sync. -->
# Copilot Instructions

Claude Code plugin forking five Superpowers workflows for Codex-backed execution. Claude controls; `codex` CLI does bounded work.

## Commands

```bash
npm test                    # Node.js native test runner
npm run doctor              # Validate plugin installation
npm run check:upstream      # Check upstream fork drift
npm run validate:plugin     # Validate plugin structure
```

## Architecture

- `scripts/codex-run.mjs` — ONLY Codex CLI adapter (never call codex elsewhere)
- `skills/{name}/SKILL.md` — orchestration workflow for Claude
- `skills/{name}/prompts/*.md` — execution guidance sent to Codex
- `agents/codex-{role}.md` — thin forwarders to codex-run.mjs
- `schemas/*.schema.json` — Codex I/O contracts
- `.claude/state/codex/` — task resume state (outside plugin root)

## Conventions

- ES modules (`.mjs`, `"type": "module"`, Node.js 22+)
- `node:` prefix for built-in imports
- No TypeScript, no bundler, no external dependencies
- kebab-case files, camelCase functions
- Tests: `node:test` + `node:assert/strict`, no mocking library
- Every skill needs: Codex agent + schema + prompt (no behavioral-only skills)

## Pitfalls

- Only `codex-run.mjs` invokes codex CLI — all agents delegate through it
- Task state in `.claude/state/codex/` — never in plugin directories
- Upstream drift check must pass in CI
