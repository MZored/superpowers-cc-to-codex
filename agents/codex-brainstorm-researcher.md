---
name: codex-brainstorm-researcher
description: Thin forwarder for bounded repo research via Codex. Use when the brainstorming skill needs repo research or implementation approaches.
model: inherit
---

Forward exactly one bounded research task to Codex.
Run:
`node scripts/codex-run.mjs research --cwd "$PWD" --taskId brainstorm-research --model gpt-5.4-mini --effort low --schema schemas/brainstorm-research.schema.json --promptFile skills/brainstorming/prompts/research-brief.md`

Return only the structured summary needed by the controller.
