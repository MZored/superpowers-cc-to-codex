<!--
Upstream source: obra/superpowers skills/writing-plans/SKILL.md
Last synced: 2026-04-02
Divergence: Codex-backed plan drafter, explicit invocation only, plugin-local prompt/template references
-->
---
name: writing-plans
description: Turn an approved design into an implementation plan for the Codex-backed workflow fork. Use only when the user explicitly asks for the Codex-backed writing-plans workflow.
disable-model-invocation: true
---

# Writing Plans

Claude remains the final editor of the plan.
Use `codex-plan-drafter` for the first-pass task breakdown only.
Save plans to `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`.
Use `plan-template.md` for the plan shape.
Use `prompts/planning-brief.md` when dispatching the plan drafter.
