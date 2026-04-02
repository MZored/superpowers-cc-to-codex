# Superpowers Codex Fork Plugin v2

**Date:** 2026-04-02  
**Status:** Proposed

## Overview

Build a separate Claude Code plugin that forks a small, selected part of `superpowers` and adapts it for a Codex-backed workflow.

This plugin does **not** patch the original `superpowers` plugin and does **not** attempt to replace it globally. Instead, it provides a parallel, namespaced workflow for:

- `brainstorming`
- `writing-plans`
- `subagent-driven-development`
- `requesting-code-review`

The main idea is:

- keep upstream `superpowers` installed and updateable
- build a new plugin with custom skills and agents for this workflow
- use Codex for bounded subagent work
- keep Claude as the user-facing orchestrator and context owner

## Problem Statement

The original `superpowers` workflow assumes Claude-native subagents and Claude-native review loops.

That creates two practical problems for this project:

1. We want different subagent behavior and different runtime controls than upstream `superpowers` provides.
2. We do not want to edit upstream `superpowers`, because that would make future updates harder and blur the boundary between vendor code and custom workflow code.

At the same time, we also do not want to overcomplicate the runtime boundary. The public `codex` CLI is enough for execution, while other Codex integrations can remain optional reference material rather than hard dependencies.

## Goals

- Create a standalone plugin with a `superpowers`-like workflow specialized for Codex-backed task execution.
- Reuse the shape of the original `superpowers` workflow where it is good.
- Preserve the original `superpowers` plugin and its update path.
- Make Codex-backed workers reliable enough for repeated daily use.
- Support fast/cheap Codex lanes for draft and research work.
- Support stronger Codex lanes for implementation and review work.
- Keep the orchestration logic understandable and testable.

## Non-Goals

- Do not replace or modify the upstream `superpowers` plugin in place.
- Do not depend on private cache paths like `~/.claude/plugins/cache/.../codex-companion.mjs`.
- Do not vendor the whole `superpowers` repository.
- Do not build a generic plugin-to-plugin RPC system.
- Do not make Codex own the entire user conversation.
- Do not turn the plugin into a hard fork of all `superpowers` behavior.

## Core Decisions

### 1. Fork only the needed workflow surface

This plugin forks only four workflow skills:

- `brainstorming`
- `writing-plans`
- `subagent-driven-development`
- `requesting-code-review`

This is intentionally narrow. The plugin should not copy unrelated `superpowers` skills unless they become necessary later.

To keep the fork standalone, any transitive workflow behavior that these four entrypoints rely on must be inlined into this plugin rather than delegated back to upstream `superpowers`.

That includes, at minimum:

- verification gates needed to claim task completion
- branch-finishing behavior needed at the end of plan execution
- any prompt templates or helper logic needed for those steps

### 2. Use namespaced parallel skills, with explicit routing

Claude Code plugin skills are namespaced by plugin name, so this plugin can coexist with the original `superpowers` at the naming level.

That means the user can choose explicitly between:

- upstream workflow
- custom Codex workflow

without name collisions.

However, namespacing alone is not enough to guarantee correct automatic activation when both plugins are installed.

So this fork should also:

- keep overlapping workflow descriptions narrowly scoped
- expose forked top-level workflow entrypoints as explicit, non-auto-invoked commands or skills
- route automatic delegation through one controller rather than letting multiple similar high-level skills compete
- set `disable-model-invocation: true` on those forked top-level workflow entrypoints by default

Automatic model invocation should be reserved for narrower helper components inside the plugin, not for the top-level workflow forks that overlap with upstream `superpowers`.

### 3. Treat Claude as orchestrator, not as the main implementer

Claude remains responsible for:

- understanding user intent
- interactive clarification
- deciding when to delegate
- curating context for workers
- deciding whether a task is complete
- managing git workflow and task progression

Codex-backed workers handle:

- bounded repo research
- draft plan generation
- implementation
- diff-based review

### 4. Treat `codex-plugin-cc` as optional reference material, not a dependency

`openai/codex-plugin-cc` is useful as:

- an example of the forwarder-agent pattern
- a source of ideas for prompts, review flows, and user-facing commands

But it should be treated as optional reference material, not as a required installed companion and not as an internal runtime dependency.

### 5. Use the public `codex` CLI as the stable execution boundary

The workflow should call the public Codex CLI:

- `codex exec`
- `codex exec resume`
- `codex review`

through a thin local adapter script owned by this plugin.

This gives a clear boundary:

- upstream Codex product evolves
- our plugin owns only prompt shaping, output contracts, and orchestration glue

### 6. “Codex as subagents” means Claude subagent forwarders

Claude Code plugin agents are still Claude subagents. They are not native Codex agents.

So the correct pattern is:

- create Claude plugin agents
- keep them thin
- each agent forwards one well-defined task to Codex
- the agent returns only the structured result needed by the controller

This follows a proven forwarder pattern and specializes it for this workflow.

## Why Not Depend Directly On `codex-plugin-cc`

Studying `codex-plugin-cc` is useful.

Depending on it for runtime execution is not necessary for this plugin.

Reasons:

- Claude Code plugins do not expose a stable plugin-to-plugin runtime API.
- Even public plugin commands are the wrong abstraction for our internal workflow runtime.
- Cache paths and helper scripts are implementation details, not supported contracts.
- Our workflow needs stricter contracts than generic user-facing Codex plugin commands expose.
- We need role-specific prompts, schemas, model routing, and service-tier choices.

So the design should reuse the **pattern** from `codex-plugin-cc` when helpful, but execute directly against the public `codex` CLI.

## Best-Practice Principles

### Claude-side workflow principles

- Keep interactive, back-and-forth design work in the main Claude thread.
- Use subagents only for bounded work that can return a summary.
- Keep context handoff explicit. Do not make workers rediscover plan context from scratch unless necessary.
- Use fresh worker context for independent tasks.
- Use persistent worker threads only where fix loops genuinely benefit from resume behavior.

### Codex-side workflow principles

- Give Codex structured prompts with clear scope and clear output contracts.
- Prefer prompts that read like a concrete GitHub issue or task brief.
- Keep tasks well scoped. Default unit size should be roughly “single task from a plan”, not “entire feature”.
- Use AGENTS-style repo instructions to improve consistency.
- Use explicit verification loops.
- Use resume for same-task fix loops instead of rewriting the whole prompt.
- Use machine-parseable output when the controller depends on status transitions.

## Architecture

### Layer 1: User-facing workflow plugin

This repository provides the custom workflow:

- custom skills
- custom forwarder agents
- custom orchestration logic
- custom output schemas

### Layer 2: Thin Codex adapter

This repository also provides a tiny adapter script that wraps the public `codex` CLI.

Its job is to:

- choose the right Codex command
- pass model and effort
- pass `service_tier` and Fast mode config when needed
- apply JSON output schemas
- normalize outputs to workflow contracts
- hide CLI details from skills and agents

### Layer 3: External Codex tooling

This design relies on external, updateable tooling:

- `@openai/codex`

The plugin should assume `@openai/codex` is the required external dependency.

Any Claude-side Codex plugin remains optional.

## Repository Structure

```text
superpowers-codex-fork/
├── .claude-plugin/
│   └── plugin.json
├── README.md
├── LICENSE
├── .github/
│   └── workflows/
│       └── validate.yml
├── commands/
│   └── doctor.md
├── docs/
│   ├── architecture.md
│   ├── distribution.md
│   ├── upstream-sync.md
│   └── prompts.md
├── skills/
│   ├── brainstorming/
│   │   ├── SKILL.md
│   │   ├── design-template.md
│   │   └── prompts/
│   │       └── research-brief.md
│   ├── writing-plans/
│   │   ├── SKILL.md
│   │   ├── plan-template.md
│   │   └── prompts/
│   │       └── planning-brief.md
│   ├── subagent-driven-development/
│   │   ├── SKILL.md
│   │   ├── implementer-template.md
│   │   ├── spec-review-template.md
│   │   ├── code-review-template.md
│   │   └── prompts/
│   │       ├── implement-task.md
│   │       ├── fix-task.md
│   │       └── final-review.md
│   └── requesting-code-review/
│       ├── SKILL.md
│       └── prompts/
│           └── review-brief.md
├── agents/
│   ├── codex-brainstorm-researcher.md
│   ├── codex-plan-drafter.md
│   ├── codex-implementer.md
│   └── codex-reviewer.md
├── scripts/
│   ├── codex-run.mjs
│   ├── detect-codex.mjs
│   ├── check-upstream-superpowers.mjs
│   └── check-codex-cli.mjs
├── schemas/
│   ├── brainstorm-research.schema.json
│   ├── plan-draft.schema.json
│   ├── implementer-result.schema.json
│   ├── spec-review.schema.json
│   └── code-review.schema.json
├── references/
│   ├── upstream-superpowers/
│   └── codex-patterns/
└── tests/
    ├── adapter/
    ├── prompt-contracts/
    └── fixtures/
```

## Distribution Strategy

The primary distributable artifact should be a single plugin repository on GitHub.

That repository should be installable directly as a plugin source and should not require a separate marketplace to be useful.

Optional later step:

- publish a separate marketplace repository that points to this plugin repository

This keeps the first public release simple:

- one repo
- one plugin
- one installation path

and avoids mixing marketplace concerns into the plugin root.

## Supported Runtime Contract

This plugin should declare and enforce a minimum supported `codex` CLI version.

The public release should not assume that any installed Codex CLI is good enough.

The adapter and doctor command should fail fast if the local CLI does not support the required contract, including:

- `codex exec`
- `codex exec resume`
- schema-capable non-interactive execution
- the sandbox and service-tier flags the plugin depends on

## Skill And Agent Mapping

## `brainstorming`

### Responsibility

- user interview
- constraint discovery
- approach comparison
- design proposal
- design approval
- design document output

### Claude vs Codex split

Claude main thread does:

- ask questions
- evaluate tradeoffs with the user
- decide when enough context exists
- present the design

Codex researcher does:

- targeted repo exploration
- pattern discovery
- generate 2-3 bounded implementation approaches
- summarize risks and unknowns

### Worker model

- default: `gpt-5.4-mini`
- optional speed lane: `gpt-5.4` with Fast mode on
- reasoning: `low` or `medium`

### Why

This work is exploration-heavy but usually not worth a full deep coding model. It benefits more from speed and breadth than maximal implementation depth.

## `writing-plans`

### Responsibility

- transform approved design into executable implementation plan
- preserve exact file paths and task sequence
- preserve testing expectations
- preserve commit boundaries

### Claude vs Codex split

Claude main thread does:

- ensure the plan matches the approved design
- enforce workflow conventions
- finalize the plan

Codex plan drafter does:

- produce the first draft of the task breakdown
- suggest file decomposition
- suggest test commands and checkpoints

### Worker model

- default: `gpt-5.4-mini`
- optional upgrade: `gpt-5.4`
- optional speed lane: `gpt-5.4` with Fast mode on
- reasoning: `medium`

### Why

Planning needs strong synthesis, but still benefits from fast iteration. Claude should retain the final editorial role.

## `subagent-driven-development`

### Responsibility

- read plan
- extract tasks
- manage task loop
- dispatch implementer
- run spec compliance gate
- run code quality gate
- manage fix loops
- commit task
- finish branch

### Controller

Claude main thread remains the controller for the whole workflow.

### Codex-backed workers

- `codex-implementer`
- `codex-reviewer`

### Per-task loop

1. Claude extracts task text and scene-setting context from the plan.
2. Claude dispatches `codex-implementer` with full task text.
3. The adapter captures and stores the Codex session ID for that task.
4. Codex returns structured status:
   - `DONE`
   - `DONE_WITH_CONCERNS`
   - `BLOCKED`
   - `NEEDS_CONTEXT`
5. Claude handles escalation if needed.
6. Claude performs spec-compliance review inline against actual code.
7. If spec issues are found, Claude resumes the same tracked Codex task session with a fix prompt.
8. Once spec-compliant, Claude dispatches `codex-reviewer` on the diff for quality review.
9. If material issues are found, Claude resumes the tracked implementer session with a focused fix prompt.
10. Once both gates pass, Claude commits the task.

### Worker models

Implementer:

- default: `gpt-5.4`
- code-specialist override: `gpt-5.3-codex`
- reasoning: `medium` or `high`
- service tier: normal by default

Reviewer:

- default: `gpt-5.4`
- alternative for code-heavy review: `gpt-5.3-codex`
- reasoning: `medium` or `high`
- service tier: normal by default

### Why Claude keeps spec review

Spec compliance is the most context-sensitive step in the loop.

The controller already holds:

- the user intent
- the approved design
- the plan
- the prior task history

So the cleanest version is:

- Codex handles implementation and code review
- Claude handles scope and compliance judgment

This avoids one more context rebuild step and keeps the most requirement-sensitive gate close to the orchestration context.

## `requesting-code-review`

### Responsibility

- produce a high-signal review of a diff or task completion
- find material correctness and maintainability issues
- return clear severity and merge readiness

### Worker

- `codex-reviewer`

### Command strategy

Use schema-driven `codex exec` through the adapter for controller-managed review loops that require machine-parseable output.

Use `codex review` only for ad-hoc or user-facing review flows where natural-language output is acceptable.

## Agent Design

## Safety boundary note

Within Claude plugin agents, “read-only” is a logical contract, not a hard sandbox boundary, because a Bash-capable agent inherits the parent session's permissions.

So review and research integrity should rely on:

- minimal tool access
- narrow forwarding instructions
- adapter-enforced Codex command selection
- controller skepticism and follow-up validation

not on assuming the Claude subagent itself is permission-isolated.

## `codex-brainstorm-researcher`

Role:

- thin research forwarder to Codex

Rules:

- one Codex call
- no independent repo reasoning beyond shaping the forwarded task
- return structured summary only

Tooling:

- `Bash`

Codex command:

- `codex exec`

Mode:

- logically read-only

## `codex-plan-drafter`

Role:

- thin forwarder for first-pass plan drafting

Rules:

- one Codex call
- no git commits
- return machine-parseable plan draft

Tooling:

- `Bash`

Codex command:

- `codex exec`

## `codex-implementer`

Role:

- thin forwarder for task implementation

Rules:

- one Codex execution thread per task
- supports resume for fix loops
- returns structured status JSON on the initial task run

Tooling:

- `Bash`

Codex command:

- `codex exec`
- `codex exec resume`

## `codex-reviewer`

Role:

- thin forwarder for diff review

Rules:

- logically read-only
- no fixes
- return severity, evidence, and assessment when used in controller-managed schema mode

Tooling:

- `Bash`

Codex command:

- `codex exec`
- `codex review`

## Adapter Design

The adapter script is intentionally small.

It should not contain business logic from the workflow.

It should only normalize runtime behavior.

### Responsibilities

- detect whether `codex` is installed and authenticated
- verify that the installed `codex` CLI version satisfies the plugin's minimum supported contract
- choose `codex exec`, `codex exec resume`, or `codex review`
- capture and persist the Codex session ID for each task that may enter a fix loop
- attach JSON schema where needed
- pass `--model`
- apply role-appropriate sandbox defaults
- pass `-c model_reasoning_effort=...` or equivalent effort settings as needed
- pass `-c service_tier="fast"` when a role uses Fast mode
- write final machine-parseable output to a file when needed
- return normalized success/failure shape to Claude

### Non-responsibilities

- no user conversation logic
- no task decomposition
- no git policy
- no interpretation of whether work is “good enough”
- no branching strategy

### Runtime state ownership

Fix-loop correctness depends on explicit session tracking.

So the adapter must persist, per task:

- Codex session ID or thread name
- associated task identifier
- workspace root
- current phase

This state must live outside the plugin installation cache, because Claude plugin updates replace cached plugin contents.

Recommended location:

- workspace-local metadata such as `.claude/state/` or a comparable project-scoped runtime directory

### Sandbox and approval policy

The adapter should set explicit runtime defaults instead of inheriting whatever happens to be in a user's local Codex config.

Recommended defaults:

- research and review roles: read-only sandbox
- planning role: read-only sandbox
- implementation role: writable workspace sandbox
- never use dangerous no-sandbox execution by default

If a repository genuinely requires broader write access, that should be an explicit opt-in configuration path, not the default public plugin behavior.

## Output Contracts

## Implementer result contract

The initial implementer run should return JSON shaped like:

```json
{
  "status": "DONE",
  "summary": "Implemented task requirements and added tests.",
  "files_changed": ["src/foo.ts", "tests/foo.test.ts"],
  "tests": [
    {
      "command": "pnpm test foo.test.ts",
      "result": "pass"
    }
  ],
  "concerns": []
}
```

Allowed `status` values:

- `DONE`
- `DONE_WITH_CONCERNS`
- `BLOCKED`
- `NEEDS_CONTEXT`

Important:

- This schema-enforced contract applies to fresh `codex exec` runs.
- Resume turns are primarily for continuing work, not for authoritative state transitions.
- After a resume turn, the controller should rely on code inspection plus spec and review gates, not only on the resumed turn's self-report.

## Spec review contract

Claude controller should normalize inline spec review to:

```json
{
  "status": "APPROVED",
  "issues": []
}
```

or:

```json
{
  "status": "ISSUES_FOUND",
  "issues": [
    {
      "file": "src/foo.ts",
      "line": 42,
      "issue": "Missing validation required by the task",
      "severity": "important"
    }
  ]
}
```

## Code review contract

The controller-managed reviewer should return:

```json
{
  "assessment": "with_fixes",
  "strengths": ["Clear decomposition", "Relevant tests"],
  "issues": [
    {
      "severity": "important",
      "file": "src/foo.ts",
      "line": 42,
      "title": "Missing timeout handling",
      "why": "Can hang under network stalls",
      "fix": "Add abort signal or timeout guard"
    }
  ]
}
```

Important:

- This structured contract should be produced via schema-driven `codex exec`.
- `codex review` is still useful, but its natural-language output should be treated as advisory text rather than as the primary machine-parseable controller contract.

## Model And Speed Strategy

## Default model matrix

| Role | Default model | Effort | Service tier |
|------|---------------|--------|--------------|
| Brainstorm research | `gpt-5.4-mini` | low | normal |
| Plan drafting | `gpt-5.4-mini` | medium | normal |
| Brainstorm/planning speed override | `gpt-5.4` | low/medium | fast |
| Implementation | `gpt-5.4` | medium/high | normal |
| Implementation code-specialist override | `gpt-5.3-codex` | medium/high | normal |
| Code review | `gpt-5.4` | medium/high | normal |
| Code review fallback | `gpt-5.3-codex` | medium | normal |

## Fast mode policy

Fast mode should be supported, but it should not become the central design assumption.

Rules:

- Use Fast mode only with `gpt-5.4`.
- Do not assume Fast mode applies to `gpt-5.4-mini`.
- Use Fast mode only on draft and research lanes by default.
- Do not default implementation to Fast mode.
- Allow per-role override in configuration.
- If Fast mode is unavailable, fall back to the default service tier without changing the workflow contract.
- If the user authenticates Codex with an API key rather than ChatGPT credits, treat Fast mode as unavailable.

## Why Fast mode is not the main abstraction

Fast mode is a runtime speed setting, not a workflow role.

So the plugin should model:

- role
- model
- effort
- service tier

instead of pretending that “Fast mode” is itself a separate worker type.

## Relationship To `codex-plugin-cc`

## What we may reuse conceptually

- the forwarder-agent pattern
- the idea of one-purpose Codex handoff agents
- the idea of letting Codex own the delegated task rather than mixing Claude-side analysis into the worker

## What we should not depend on

- plugin installation state
- plugin command availability
- private cache paths
- private script locations
- undocumented internal helper APIs

## Optional companion stance

Installing `codex-plugin-cc` may still be useful for some users.

Reasons:

- it gives them manual Codex commands outside our workflow
- it remains useful for ad-hoc rescue and review
- it provides a familiar fallback when our custom flow is not the right tool

But our workflow must not rely on it.

This plugin should work fully as long as the public `codex` CLI is installed and authenticated.

## Operational Preflight

Before any workflow that delegates to Codex, the plugin should provide a lightweight doctor/setup command that checks:

- `codex` is installed
- `codex login status` succeeds
- the installed `codex` CLI version is supported
- the current workspace is writable
- required local tools like `git` and `node` are available when needed
- plugin files validate cleanly with `claude plugin validate .`

This should be implemented as a user-facing command, not buried inside troubleshooting docs.

## Upstream Sync Strategy

## For `superpowers`

Maintain a documented fork surface.

For each forked skill:

- record the upstream source path
- record the upstream commit or version last synced
- record divergence notes

Recommended file header pattern inside each forked `SKILL.md`:

```md
<!--
Upstream source: obra/superpowers path/to/SKILL.md
Last synced: 2026-04-02
Divergence: Codex-backed workers, custom review loop, custom runtime adapter
-->
```

Add a script that checks whether upstream skill text changed and reports drift.

## For Codex ecosystem references

Track relevant external references as design input, not runtime dependencies.

Examples:

- `codex-plugin-cc` patterns
- Codex CLI docs
- model and service-tier docs

## Testing Strategy

## Contract tests

Test that prompt templates produce outputs parseable by the target schemas.

## Adapter tests

Mock Codex CLI invocations and verify:

- correct command chosen
- correct model chosen
- correct service tier chosen
- correct resume behavior chosen
- correct schema attachment chosen

## Packaging and release tests

The repository should be validated as a distributable Claude plugin, not only as a local design exercise.

Required checks:

- `claude plugin validate .`
- install from a clean local clone
- install from a GitHub repository source
- run a smoke test for the doctor command
- run a smoke test for one forwarder agent
- verify failure behavior on an unsupported `codex` CLI version

## Workflow tests

Fixture-based tests should verify:

- task loop transitions
- fix-loop resume behavior
- blocking and escalation behavior
- final review handling

## Acceptance Criteria

- The plugin can run a full custom brainstorming flow without touching upstream `superpowers`.
- The plugin can draft a plan with Codex assistance and save it.
- The plugin can execute one plan task through a Codex-backed implementer and parse the result.
- The plugin can run a Codex-backed review on a diff and normalize the result.
- The plugin can resume a Codex implementer thread for fix loops.
- The plugin persists and reuses the correct Codex session ID per task.
- The plugin can run without depending on `~/.claude/plugins/cache/...`.
- The plugin coexists predictably with upstream `superpowers` because overlapping top-level workflow entrypoints are explicit and non-auto-invoked by default.
- The plugin works with only `codex` CLI installed and authenticated.
- The plugin fails fast on unsupported `codex` CLI versions.

## Implementation Phases

### Phase 1

- bootstrap plugin structure
- add GitHub validation workflow
- add doctor/setup command
- add adapter
- add schemas
- add one forwarder agent
- prove one end-to-end Codex call

### Phase 2

- fork `brainstorming`
- fork `writing-plans`
- wire research and plan-draft workers

### Phase 3

- fork `subagent-driven-development`
- add implementer and reviewer workers
- add fix-loop resume logic

### Phase 4

- fork `requesting-code-review`
- add standalone review workflow
- add configuration for model and speed lanes

### Phase 5

- add upstream drift tooling
- add test fixtures
- harden documentation and examples

## Final Recommendation

Build a **custom, namespaced workflow plugin** that:

- forks only the needed `superpowers` workflow skills
- keeps Claude as orchestrator
- uses thin Claude forwarder agents to delegate bounded work to Codex
- uses the public `codex` CLI through a local adapter
- treats `codex-plugin-cc` as optional reference material only

This is the cleanest boundary between:

- upstream `superpowers`
- our custom workflow logic
- the public `codex` runtime

and it gives the best chance of staying maintainable as all three evolve.
