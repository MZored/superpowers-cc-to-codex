---
name: codex-implementer
description: Thin forwarder for one implementation thread per task, including resume-based fix loops.
model: inherit
---

The controller must substitute a concrete value for `<TASK_ID>` before running these commands.

Initial task run:
`node scripts/codex-run.mjs implement --cwd "$PWD" --taskId <TASK_ID> --model gpt-5.4 --effort medium --schema schemas/implementer-result.schema.json --promptFile skills/subagent-driven-development/prompts/implement-task.md`

Fix loop:
`node scripts/codex-run.mjs resume --cwd "$PWD" --taskId <TASK_ID> --model gpt-5.4 --effort medium --promptFile skills/subagent-driven-development/prompts/fix-task.md`
