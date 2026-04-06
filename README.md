# Superpowers × Codex

> Claude orchestrates. Codex executes. One plugin, two models.

A Claude Code plugin that combines **Claude's orchestration and judgment** with **GPT's speed at bounded coding tasks**. Forked from [obra/superpowers](https://github.com/obra/superpowers), adapted for [Codex CLI](https://github.com/openai/codex) delegation.

## Why Two Models?

Claude and GPT have complementary strengths:

| | Claude | GPT (via Codex) |
| - | - | - |
| **Best at** | Orchestration, planning, user dialogue, subagent coordination | Fast code generation, debugging, diff review |
| **Role here** | Controller — owns the conversation thread | Worker — executes bounded tasks |
| **Speed** | Thoughtful, context-rich | Fast mode available (GPT-5.4 Fast) |

The plugin keeps Claude in the driver's seat for design decisions and workflow control, while delegating execution-heavy work to Codex — getting the best of both worlds.

```text
User ↔ Claude (controller)
         │
         ├─ skills/        SKILL.md workflows guide Claude's decisions
         │
         ├─ MCP Server     scripts/mcp-server.mjs (primary transport)
         │   ├─ codex_research      read-only repo exploration
         │   ├─ codex_plan          first-pass implementation plans
         │   ├─ codex_implement     bounded coding tasks
         │   ├─ codex_review        structured or advisory diff review
         │   ├─ codex_debug         root cause investigation
         │   ├─ codex_branch_analysis  branch readiness check
         │   └─ codex_resume        resume existing thread
         │
         └─ Codex CLI      GPT-5.4 / GPT-5.4-mini (configurable)
```

## Quick Start

```bash
# Add the marketplace
/plugin marketplace add mzored/superpowers-cc-to-codex

# Install the plugin
/plugin install superpowers-cc-to-codex@superpowers-cc-to-codex
```

Want the original Superpowers without Codex delegation? See [obra/superpowers](https://github.com/obra/superpowers).

## Configuration

`.claude/codex-defaults.json` is automatically created with sensible defaults on first use. Customize it:

```json
{
  "model": "gpt-5.4",
  "modelMini": "gpt-5.4-mini",
  "effort": "medium",
  "serviceTier": "fast"
}
```

| Key | Description | Default |
|-----|-------------|---------|
| `model` | Model for implementation, review, resume | `gpt-5.4` |
| `modelMini` | Model for research, planning, debug, branch analysis | `gpt-5.4-mini` |
| `effort` | Reasoning effort: `low`, `medium`, `high` | per-tool |
| `serviceTier` | Set to `"fast"` for GPT Fast mode (requires ChatGPT auth) | — |

Resolution: explicit MCP args → project config → tool defaults. Every parameter can be overridden per-call.

## Skills

| Skill | What it does | MCP Tool |
|-------|-------------|----------|
| `brainstorming-codex` | Design exploration with bounded repo research | `codex_research` |
| `writing-plans-codex` | Plan creation with Codex first-pass drafting | `codex_plan` |
| `subagent-driven-development-codex` | Task execution with implementer + reviewer | `codex_implement` + `codex_review` |
| `requesting-code-review-codex` | Structured or advisory diff review | `codex_review` |
| `receiving-code-review-codex` | External feedback reception with verification | `codex_review` |
| `systematic-debugging-codex` | 4-phase debugging with root cause investigation | `codex_debug` |
| `test-driven-development-codex` | Strict red-green-refactor TDD | `codex_implement` (TDD mode) |
| `finishing-a-development-branch-codex` | Branch completion with readiness analysis | `codex_branch_analysis` |
| `dispatching-parallel-agents-codex` | Parallel independent-domain dispatch | `codex_implement` (parallel) |
| `verification-before-completion-codex` | Evidence-before-claims safety gate | Claude-side only |
| `using-git-worktrees-codex` | Isolated worktree setup with safety checks | Claude-side only |

## Requirements

- **Claude Code** with plugin marketplace support
- **Codex CLI** installed and authenticated (`codex` ≥ 0.111.0)
- **Node.js** 22+
- **git**

## Development

```bash
npm test                    # Run all tests (node --test)
npm run doctor              # Validate plugin + CLI setup
npm run check:upstream      # Check upstream fork drift
npm run validate:plugin     # Validate plugin structure
```

## Links

- [obra/superpowers](https://github.com/obra/superpowers) — upstream skills framework
- [openai/codex](https://github.com/openai/codex) — Codex CLI (the bounded worker)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) — transport layer
- [Model Context Protocol](https://modelcontextprotocol.io/) — MCP specification

## License

MIT — see [LICENSE](LICENSE).
