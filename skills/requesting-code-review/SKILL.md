<!--
Upstream source: obra/superpowers skills/requesting-code-review/SKILL.md
Last synced: 2026-04-03
Divergence: Codex-backed reviewer agent; adapter-managed review prompts; no upstream runtime dependency
-->
---
name: requesting-code-review
description: Request a high-signal Codex-backed review of a diff or task result. Use when completing tasks, implementing major features, or before merging. Codex-backed variant.
disable-model-invocation: true
---

# Requesting Code Review

Use the Agent tool with `subagent_type: "codex-reviewer"` to catch issues before they cascade. The reviewer gets precisely crafted context for evaluation — never your session's history. This keeps the reviewer focused on the work product, not your thought process, and preserves your own context for continued work.

When dispatching the reviewer, pass a structured `prompt` body with headers matching the review type needed.

**Core principle:** Review early, review often.

## When to Request Review

**Mandatory:**
- After each task in subagent-driven development
- After completing major feature
- Before merge to main

**Optional but valuable:**
- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## How to Request

**1. Get git SHAs:**
```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

**2. Dispatch `codex-reviewer`:**

Use the Agent tool with `subagent_type: "codex-reviewer"`.
Pass one of these `prompt` shapes:

```text
Task ID: task-17-review
REVIEW_TYPE: structured
BASE: origin/main

Review Task 4 from docs/superpowers/plans/2026-04-03-agent-forwarding.md for correctness, regressions, and missing tests.
```

```text
Task ID: task-17-advisory
REVIEW_TYPE: advisory
BASE: origin/main

Give concise advisory feedback on the diff since origin/main.
```

```text
Task ID: task-17-commit
REVIEW_TYPE: commit
COMMIT: abc1234

Review only commit abc1234 for correctness and risk.
```

```text
Task ID: task-17-uncommitted
REVIEW_TYPE: uncommitted

Review only the uncommitted worktree changes.
```

**Provide:**
- `{WHAT_WAS_IMPLEMENTED}` - What you just built
- `{PLAN_OR_REQUIREMENTS}` - What it should do
- `{BASE_SHA}` - Starting commit
- `{HEAD_SHA}` - Ending commit
- `{DESCRIPTION}` - Brief summary

**3. Act on feedback:**
- Fix Critical issues immediately
- Fix Important issues before proceeding
- Note Minor issues for later
- Push back if reviewer is wrong (with reasoning)

## Example

```
[Just completed Task 2: Add verification function]

You: Let me request code review before proceeding.

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[Dispatch codex-reviewer]
  WHAT_WAS_IMPLEMENTED: Verification and repair functions for conversation index
  PLAN_OR_REQUIREMENTS: Task 2 from docs/superpowers/plans/deployment-plan.md
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661
  DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types

[Reviewer returns]:
  Strengths: Clean architecture, real tests
  Issues:
    Important: Missing progress indicators
    Minor: Magic number (100) for reporting interval
  Assessment: Ready to proceed

You: [Fix progress indicators]
[Continue to Task 3]
```

## Integration with Workflows

**Subagent-Driven Development:**
- Review after EACH task
- Catch issues before they compound
- Fix before moving to next task

**Ad-Hoc Development:**
- Review before merge
- Review when stuck

## Red Flags

**Never:**
- Skip review because "it's simple"
- Ignore Critical issues
- Proceed with unfixed Important issues
- Argue with valid technical feedback

**If reviewer wrong:**
- Push back with technical reasoning
- Show code/tests that prove it works
- Request clarification
