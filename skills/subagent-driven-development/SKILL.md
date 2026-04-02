<!--
Upstream source: obra/superpowers skills/subagent-driven-development/SKILL.md
Last synced: 2026-04-02
Divergence: Codex-backed implementer/reviewer agents, adapter-managed resume flow, Claude-kept spec review
-->
---
name: subagent-driven-development
description: Execute an implementation plan by dispatching Codex-backed implementer and reviewer forwarders while Claude keeps spec-compliance control. Use only when the user explicitly asks for the Codex-backed execution workflow.
disable-model-invocation: true
---

# Subagent-Driven Development

Per task:
1. Dispatch `codex-implementer` with the full task text.
2. Handle `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`.
3. Run Claude-side spec compliance review using `spec-review-template.md`.
4. Resume the same Codex thread with `prompts/fix-task.md` when spec issues exist.
5. Dispatch `codex-reviewer` only after spec compliance passes.
6. Resume the same implementer thread if the reviewer finds material issues.
7. Commit only after both spec compliance and code quality gates pass.
