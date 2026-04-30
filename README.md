# Superpowers × Codex

> Claude orchestrates. Codex executes. One plugin, two models.

A Claude Code plugin that combines **Claude's orchestration and judgment** with **GPT's speed at bounded coding tasks**. Forked from [obra/superpowers](https://github.com/obra/superpowers), adapted for [Codex CLI](https://github.com/openai/codex) delegation.

## Why Two Models?

Claude and GPT have complementary strengths:

| | Claude | GPT (via Codex) |
| - | - | - |
| **Best at** | Orchestration, planning, user dialogue, subagent coordination | Fast code generation, debugging, diff review |
| **Role here** | Controller — owns the conversation thread | Worker — executes bounded tasks |
| **Speed** | Thoughtful, context-rich | Fast mode available for supported Codex models |

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
         └─ Codex CLI      respects ~/.codex/config.toml (model + effort) by default
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

`.claude/codex-defaults.json` is automatically created on first use. By default it defers every model/effort decision to your `~/.codex/config.toml` and only opts into the ChatGPT-account `fast` service tier:

```json
{
  "model": "auto",
  "modelMini": "auto",
  "effort": "auto",
  "serviceTier": "fast"
}
```

| Key | Description | Default |
|-----|-------------|---------|
| `model` | Model for implementation, review, resume. `auto` defers to `~/.codex/config.toml`. | `auto` |
| `modelMini` | Model for research, planning, debug, branch analysis. Falls back to `model` if not set. `auto` defers to `~/.codex/config.toml`. | `auto` |
| `effort` | Reasoning effort: `auto`, `minimal`, `low`, `medium`, `high`, `xhigh`. `auto` defers to `~/.codex/config.toml`. | `auto` |
| `serviceTier` | Set to `"fast"` for GPT Fast mode (requires ChatGPT auth). | `fast` |

Resolution: explicit MCP args → project config → tool defaults. `auto` is a sentinel that means "do not pass `-m` / `-c model_reasoning_effort` to Codex CLI", so your global Codex configuration wins. Per-call overrides always trump these defaults.

Example — pin reasoning effort to `xhigh` for this project regardless of your global Codex config:

```json
{ "effort": "xhigh", "serviceTier": "fast" }
```

### Observability

| Environment variable | Effect |
|----------------------|--------|
| `SUPERPOWERS_CODEX_LOG_FILE` | Appends sanitized Codex and MCP lifecycle events as JSON Lines. Prompt text is redacted. |
| `SUPERPOWERS_CODEX_LOG=1` | Mirrors sanitized lifecycle events to stderr as JSON for local debugging. |

Run `npm run doctor -- --verbose` with `SUPERPOWERS_CODEX_LOG_FILE` set to summarize the last 100 events by mode, retry count, recent errors, and p50/p95 invocation duration.

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
npm run validate:schemas       # Validate schema metadata and prompt/schema references
```

## Transport Behavior

- The MCP server is the primary transport and emits lifecycle-aware `notifications/progress` plus structured `notifications/message`.
- Experimental task mode for `codex_implement` and `codex_resume` is off by default. Enable it with `SUPERPOWERS_CODEX_EXPERIMENTAL_TASKS=implement-resume`.
- Workspace resume state stays under `.claude/state/codex/`. Experimental task-mode records live under `${CLAUDE_PLUGIN_DATA}/mcp-tasks/`.

## Troubleshooting

### ETIMEDOUT / connection reset

Transient network failures are retried once. If the response includes `taskId` and `sessionId`, run `codex_resume` with that `taskId` to continue the saved Codex thread.

### Authentication failure

Run `codex login`, then rerun `npm run doctor`. In CI, prefer `CODEX_API_KEY` for `codex exec` automation.

### Model not available

Pin a supported model in `~/.codex/config.toml` or set `"model": "auto"` in `.claude/codex-defaults.json` so Codex CLI chooses from the authenticated account.

### Status: ok, partial, error

`ok` means Codex completed and returned parseable output. `partial` means the MCP runtime salvaged a session, assistant text, or result from a failed run. `error` means no parseable output was available, or the failure happened before Codex produced recoverable JSONL.

### Where logs live

Set `SUPERPOWERS_CODEX_LOG_FILE=/absolute/path/codex-events.jsonl` to append sanitized lifecycle events. Run `npm run doctor -- --verbose` to summarize recent events.

### Schema validation error

Run `npm run validate:schemas`. Update the matching `schemas/*.schema.json` file, `schemas/INDEX.json`, and any prompt `## Output Requirements` section that lists required schema keys.

## Links

- [obra/superpowers](https://github.com/obra/superpowers) — upstream skills framework
- [openai/codex](https://github.com/openai/codex) — Codex CLI (the bounded worker)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) — transport layer
- [Model Context Protocol](https://modelcontextprotocol.io/) — MCP specification

## License

MIT — see [LICENSE](LICENSE).
