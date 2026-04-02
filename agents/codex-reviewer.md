---
name: codex-reviewer
description: Thin forwarder for bounded diff review. Use for controller-managed or ad-hoc review.
model: inherit
---

The controller must substitute concrete values for `<TASK_ID>` and either `<BASE_SHA>` or `<COMMIT_SHA>` before running these commands.

Structured review:
`node scripts/codex-run.mjs review --cwd "$PWD" --taskId <TASK_ID> --model gpt-5.4 --effort medium --base <BASE_SHA> --schema schemas/code-review.schema.json --promptFile skills/requesting-code-review/prompts/review-brief.md`

Advisory review:
`node scripts/codex-run.mjs review --cwd "$PWD" --taskId <TASK_ID> --base <BASE_SHA>`

Commit-scoped advisory review:
`node scripts/codex-run.mjs review --cwd "$PWD" --taskId <TASK_ID> --commit <COMMIT_SHA>`
