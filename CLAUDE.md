<!-- Derived from AGENTS.md by /init-deep. Keep in sync. -->
# CLAUDE.md

## Overview

Claude Code plugin that forks Superpowers workflows for Codex-backed execution. Claude stays in control of the main thread; bounded work is delegated to the public `codex` CLI.

## Setup

```bash
# Plugin users
/plugin marketplace add mzored/superpowers-cc-to-codex
/plugin install superpowers-cc-to-codex@superpowers-cc-to-codex

# Development
git clone https://github.com/mzored/superpowers-cc-to-codex
npm test
npm run doctor
```

## Requirements

- Node.js 22+
- `codex` CLI installed and authenticated (minimum version 0.111.0)
- `git`
- Claude Code with plugin marketplace support

## Commands

```bash
npm test                    # Node.js native test runner (node --test)
npm run doctor              # Validate plugin installation and required CLIs
npm run check:upstream      # Check upstream Superpowers fork drift
npm run validate:plugin     # Validate Claude Code plugin structure
```

## Architecture

Claude is the controller. Codex is a bounded worker.

```
User ↔ Claude (controller)
         ├─ skills/         → SKILL.md workflow + prompts/ sent to Codex
         ├─ scripts/mcp-server.mjs → MCP server (primary transport, registered in plugin.json)
         ├─ agents/         → Deprecated compatibility shims (phase 1, not primary path)
         ├─ scripts/        → codex-run.mjs is the ONLY Codex CLI adapter
         ├─ schemas/        → JSON schemas for Codex I/O contracts
         └─ .claude/state/  → Task resume state (survives plugin updates)
```

### Key Files

| File | Role |
|------|------|
| `scripts/mcp-server.mjs` | MCP server — primary transport for Codex delegation |
| `scripts/codex-run.mjs` | Single adapter for all Codex CLI invocations |
| `scripts/lib/mcp-runtime.mjs` | Timeout, progress ticker, and cancellation for MCP requests |
| `scripts/lib/mcp-tool-definitions.mjs` | Typed schemas for the 7 MCP workflow tools |
| `scripts/lib/mcp-workspace.mjs` | Roots-aware workspace resolver |
| `scripts/lib/codex-jsonl.mjs` | Codex JSONL parser and implementer-result validators |
| `scripts/lib/codex-state.mjs` | Task state persistence (load/save) |
| `scripts/detect-codex.mjs` | Runtime detection of codex CLI binary |
| `.claude-plugin/plugin.json` | Plugin metadata, MCP server registration |
| `.claude-plugin/marketplace.json` | Marketplace configuration |

### Forked Skills

| Skill | Purpose | MCP Tool |
|-------|---------|----------|
| `brainstorming-codex` | Design exploration with bounded repo research | `codex_research` |
| `writing-plans-codex` | Plan creation with Codex first-pass drafting | `codex_plan` |
| `subagent-driven-development-codex` | Task execution with implementer + reviewer | `codex_implement` + `codex_review` |
| `requesting-code-review-codex` | Structured or advisory diff review | `codex_review` |
| `receiving-code-review-codex` | External feedback reception with verification | `codex_review` (as feedback source) |
| `systematic-debugging-codex` | 4-phase debugging with root cause investigation | `codex_debug` |
| `test-driven-development-codex` | Strict TDD via Codex implementer with red-green-refactor prompt | `codex_implement` (`promptTemplate: "tdd"`) |
| `finishing-a-development-branch-codex` | Branch completion with Codex readiness analysis | `codex_branch_analysis` |
| `dispatching-parallel-agents-codex` | Parallel independent-domain dispatch | `codex_implement` (parallel calls) |
| `verification-before-completion-codex` | Claude-side evidence-before-claims gate | N/A — Claude-side only |
| `using-git-worktrees-codex` | Isolated git worktree setup with safety checks | N/A — Claude-side only |

Skills resume existing Codex threads via `codex_resume`. The `agents/` directory
holds deprecated thin forwarders kept for phase-1 backward compatibility only —
new work should invoke the MCP tools directly.

## Conventions

### Project Structure

- ES modules exclusively (`.mjs` files, `"type": "module"`)
- Node.js built-in imports use `node:` prefix (`node:fs/promises`, `node:path`)
- No TypeScript, no bundler. External dependencies limited to the MCP SDK and Zod.
- Each skill: `skills/{name}/SKILL.md` + `skills/{name}/prompts/*.md`
- Each agent: `agents/codex-{role}.md` (thin forwarder)
- Each schema: `schemas/{workflow}.schema.json`

### Naming

- Files: kebab-case (`codex-run.mjs`, `check-upstream-superpowers.mjs`)
- Functions: camelCase (`loadOptionalTaskState`, `parseCodexVersion`)
- CLI args: kebab-case (`--cwd`, `--taskId`, `--schema`)
- Test files: `{feature}.test.mjs`

### Skill Authoring

- `SKILL.md` contains orchestration workflow (checklists for Claude)
- `prompts/*.md` contains detailed execution guidance (sent to Codex agents)
- Workflow skills must have a Codex agent, schema, and prompt — no behavioral-only skills
- **Exception:** pure Claude-side discipline/safety gates (no execution work to delegate) are exempt. The exemption must be declared in the skill's divergence header. Current exemptions: `verification-before-completion`, `using-git-worktrees`
- `SKILL.md` files carry upstream sync headers with fork date

### Testing

- Node.js native test runner (`node:test` + `node:assert/strict`)
- Two categories: `tests/adapter/` (CLI contracts) and `tests/prompt-contracts/` (workflow behavior)
- Fixtures in `tests/fixtures/` — real SKILL.md samples, JSONL event streams
- No external mocking library — dependency injection via function parameters

## Known Pitfalls

- `codex-run.mjs` is the ONLY place that invokes the Codex CLI — never call codex directly elsewhere
- Task state lives in `.claude/state/codex/` — do not store state in plugin directories
- Plugin updates must not destroy `.claude/state/` — state path is outside plugin root
- `import.meta.url === \`file://${process.argv[1]}\`` pattern used for CLI entry detection
- Upstream drift checker (`npm run check:upstream`) must pass in CI — fork must stay compatible

## Claude Code Specific

- Scoped module rules in `.claude/rules/` for skills, scripts, and testing guidance
- Read `.claude/rules/skills.md` when working on skill definitions or prompts
- Read `.claude/rules/scripts.md` when modifying the Codex adapter layer
- Read `.claude/rules/testing.md` when writing or updating tests
