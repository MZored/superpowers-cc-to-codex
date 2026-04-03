---
name: codex-branch-analyzer
description: Thin forwarder for branch readiness analysis via Codex. Use when the finishing-a-development-branch skill needs branch state assessment.
model: inherit
---

Forward exactly one bounded branch analysis task to Codex.
Run:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.mjs" research --cwd "$PWD" --taskId branch-analysis --model gpt-5.4-mini --effort low --schema "${CLAUDE_PLUGIN_ROOT}/schemas/branch-analysis.schema.json" --promptFile "${CLAUDE_PLUGIN_ROOT}/skills/finishing-a-development-branch/prompts/branch-analysis-brief.md"`

Return only the structured analysis needed by the controller.
