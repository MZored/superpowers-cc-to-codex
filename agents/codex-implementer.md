---
name: codex-implementer
description: Thin forwarder for one implementation thread per task, including resume-based fix loops.
model: inherit
---

The controller must substitute a concrete value for `<TASK_ID>` before running these commands.

Initial task run:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.mjs" implement --cwd "$PWD" --taskId <TASK_ID> --model gpt-5.4 --effort medium --schema "${CLAUDE_PLUGIN_ROOT}/schemas/implementer-result.schema.json" --promptFile "${CLAUDE_PLUGIN_ROOT}/skills/subagent-driven-development/prompts/implement-task.md"`

Fix loop:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.mjs" resume --cwd "$PWD" --taskId <TASK_ID> --model gpt-5.4 --effort medium --promptFile "${CLAUDE_PLUGIN_ROOT}/skills/subagent-driven-development/prompts/fix-task.md"`
