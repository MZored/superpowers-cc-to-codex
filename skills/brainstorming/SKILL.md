<!--
Upstream source: obra/superpowers skills/brainstorming/SKILL.md
Last synced: 2026-04-02
Divergence: Codex-backed researcher agent, explicit invocation only, plugin-local prompt/template references
-->
---
name: brainstorming
description: Interview the user, inspect the repo, compare approaches, and write a design doc for the Codex-backed workflow fork. Use only when the user explicitly asks for the Codex-backed brainstorming workflow.
disable-model-invocation: true
---

# Brainstorming

Keep Claude in the main thread for user interaction and design judgment.
Use `codex-brainstorm-researcher` only for bounded repository research.
Write approved specs to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.
Use `design-template.md` for the written output shape.
Use `prompts/research-brief.md` when dispatching the researcher.
