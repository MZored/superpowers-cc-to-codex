---
name: requesting-code-review-codex
description: Request a high-signal Codex-backed review of a diff or task result. Use when completing tasks, implementing major features, or before merging. Codex-backed variant.
disable-model-invocation: true
---
<!--
Upstream source: obra/superpowers skills/requesting-code-review/SKILL.md
Last synced: 2026-04-03
Divergence: Codex-backed reviewer agent; adapter-managed review prompts; no upstream runtime dependency
-->

# Requesting Code Review

Call the `codex_review` MCP tool to catch issues before they cascade. The reviewer gets precisely crafted context for evaluation — never your session's history. This keeps the reviewer focused on the work product, not your thought process, and preserves your own context for continued work.

Pass a structured `prompt` with the `scope` and `reviewStyle` fields matching the review type needed.

<HARD-GATE>
You MUST call codex_review for ALL review work. You cannot review code yourself.
External review catches what self-review misses. No MCP call = review not complete.
</HARD-GATE>

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

**2. Call `codex_review`:**

Use one of these call shapes:

Structured review (base diff — requires `base` or `commit` scope; not available for uncommitted):
```json
{
  "tool": "codex_review",
  "arguments": {
    "taskId": "task-17-review",
    "reviewStyle": "structured",
    "scope": { "kind": "base", "base": "origin/main" },
    "prompt": "Review Task 4 from docs/superpowers/plans/2026-04-03-agent-forwarding.md for correctness, regressions, and missing tests.",
    "workspaceRoot": "/absolute/path/to/your/repo"
  }
}
```

Advisory review (base diff):
```json
{
  "tool": "codex_review",
  "arguments": {
    "taskId": "task-17-advisory",
    "reviewStyle": "advisory",
    "scope": { "kind": "base", "base": "origin/main" },
    "prompt": "Give concise advisory feedback on the diff since origin/main.",
    "workspaceRoot": "/absolute/path/to/your/repo"
  }
}
```

Commit review:
```json
{
  "tool": "codex_review",
  "arguments": {
    "taskId": "task-17-commit",
    "reviewStyle": "advisory",
    "scope": { "kind": "commit", "commit": "abc1234" },
    "prompt": "Review only commit abc1234 for correctness and risk.",
    "workspaceRoot": "/absolute/path/to/your/repo"
  }
}
```

Uncommitted changes — both `advisory` and `structured` review styles are supported. Structured review synthesizes `git status`, staged/unstaged diffs, and untracked file paths into the prompt:
```json
{
  "tool": "codex_review",
  "arguments": {
    "taskId": "task-17-uncommitted",
    "reviewStyle": "advisory",
    "scope": { "kind": "uncommitted" },
    "prompt": "Review only the uncommitted worktree changes.",
    "workspaceRoot": "/absolute/path/to/your/repo"
  }
}
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
```

```json
{
  "tool": "codex_review",
  "arguments": {
    "taskId": "task-2-review",
    "reviewStyle": "structured",
    "scope": { "kind": "base", "base": "a7981ec" },
    "prompt": "WHAT_WAS_IMPLEMENTED: Verification and repair functions for conversation index (verifyIndex() and repairIndex() with 4 issue types).\nPLAN_OR_REQUIREMENTS: Task 2 from docs/superpowers/plans/deployment-plan.md.\nBASE_SHA: a7981ec\nHEAD_SHA: 3df7661\nReview for correctness, regressions, and missing tests.",
    "workspaceRoot": "/absolute/path/to/your/repo"
  }
}
```

```
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
