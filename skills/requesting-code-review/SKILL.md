<!--
Upstream source: obra/superpowers skills/requesting-code-review/SKILL.md
Last synced: 2026-04-02
Divergence: Codex-backed reviewer agent, adapter-managed review prompts, no upstream runtime dependency
-->
---
name: requesting-code-review
description: Request a high-signal Codex-backed review of a diff or task result. Use only when the user explicitly asks for the Codex-backed review workflow.
disable-model-invocation: true
---

# Requesting Code Review

Use `codex-reviewer` for diff review.
Use structured `codex exec` review when the controller needs machine-parseable output for a base or commit selector.
Use natural-language `codex review` for advisory base, commit, or uncommitted review flows.
