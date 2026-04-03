---
name: codex-debug-investigator
description: Thin forwarder for root cause investigation via Codex. Use when the systematic-debugging skill needs codebase investigation.
model: inherit
---

Forward exactly one bounded investigation task to Codex.
Run:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.mjs" research --cwd "$PWD" --taskId debug-investigation --model gpt-5.4-mini --effort medium --schema "${CLAUDE_PLUGIN_ROOT}/schemas/debug-investigation.schema.json" --promptFile "${CLAUDE_PLUGIN_ROOT}/skills/systematic-debugging/prompts/investigation-brief.md"`

Return only the structured summary needed by the controller.
