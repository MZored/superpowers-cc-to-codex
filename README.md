# Superpowers CC to Codex

`superpowers-cc-to-codex` is a narrow Claude Code plugin fork of skills from [obra/superpowers](https://github.com/obra/superpowers). It is for people who want the Superpowers design, planning, implementation, review, debugging, TDD, and branch finishing workflows, with bounded work delegated to the public `codex` CLI while Claude stays in control of the main thread.

## Install in Claude Code

Add this repository as a plugin marketplace:

```bash
/plugin marketplace add mzored/superpowers-cc-to-codex
```

Then install the plugin from that marketplace:

```bash
/plugin install superpowers-cc-to-codex@superpowers-cc-to-codex
```

## Upstream Superpowers

If you want the original, broader Superpowers plugin instead of this Codex-backed fork, see [obra/superpowers](https://github.com/obra/superpowers) and install it in Claude Code with:

```bash
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

## What This Plugin Is For

- Keep Claude as the controller for user interaction, design judgment, and final acceptance.
- Delegate bounded research, first-pass planning, implementation, and diff review to the public `codex` CLI.
- Reuse the shape of Superpowers workflows without taking a runtime dependency on `codex-plugin-cc`.

## How It Works

Claude remains the controller. The plugin ships forked skills and thin forwarder agents under `agents/` that call `node scripts/codex-run.mjs` with structured prompts and JSON schemas. Codex performs the bounded task, Claude keeps spec review and workflow control, and task resume state is stored under `.claude/state/codex/` so plugin updates do not wipe active thread state.

This plugin is intentionally narrower than upstream Superpowers: it does not ship the full skills library, and its skills are meant to be invoked explicitly when you want the Codex-backed path.

## Included Skills

- `superpowers-cc-to-codex:brainstorming` - Claude-led brainstorming with bounded Codex repository research.
- `superpowers-cc-to-codex:writing-plans` - Claude-owned plan writing with Codex producing the first-pass task breakdown.
- `superpowers-cc-to-codex:subagent-driven-development` - Claude-controlled execution loop with Codex implementer and reviewer forwarders.
- `superpowers-cc-to-codex:requesting-code-review` - Codex-backed diff review, either structured or advisory.
- `superpowers-cc-to-codex:systematic-debugging` - Systematic 4-phase debugging with Codex-backed root cause investigation.
- `superpowers-cc-to-codex:test-driven-development` - Strict TDD via Codex implementer with red-green-refactor enforcement.
- `superpowers-cc-to-codex:finishing-a-development-branch` - Branch completion with Codex readiness analysis and structured finish options.

## Requirements

- Claude Code with plugin marketplace support
- `codex` CLI installed and authenticated
- `git`
- Node.js 22+

## Verify

For plugin users, start a new Claude Code session and explicitly ask Claude to use one of the forked skills.

For repository maintainers, run:

```bash
npm test
npm run doctor
```

## Example Workflow Invocations

Ask Claude Code to:

- `Use superpowers-cc-to-codex:brainstorming to research implementation approaches in this repository before we write a spec.`
- `Use superpowers-cc-to-codex:writing-plans to turn the approved design into an implementation plan.`
- `Use superpowers-cc-to-codex:subagent-driven-development to execute Task 1 from the saved plan.`
- `Use superpowers-cc-to-codex:requesting-code-review to review my branch against origin/main.`
- `Use superpowers-cc-to-codex:systematic-debugging to investigate this test failure before we attempt a fix.`
- `Use superpowers-cc-to-codex:test-driven-development to implement this feature with strict TDD discipline.`
- `Use superpowers-cc-to-codex:finishing-a-development-branch to complete this feature branch.`

If a task resume looks stuck inside Claude Code, run the plugin's `codex-state` command.
Repository maintainers can inspect the same state locally with:

```bash
node scripts/list-codex-state.mjs --cwd "$PWD"
```

## License

MIT License. See [LICENSE](LICENSE).
