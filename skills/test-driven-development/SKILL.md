---
name: test-driven-development
description: Enforce strict test-driven development via Codex-backed implementation. Use only when the user explicitly asks for the Codex-backed TDD workflow.
disable-model-invocation: true
---
<!--
Upstream source: obra/superpowers skills/test-driven-development/SKILL.md
Last synced: 2026-04-03
Divergence: Codex-backed implementation via codex-implementer with TDD-specific prompt, explicit invocation only, plugin-local prompt/schema references
-->

# Test-Driven Development

Keep Claude in the main thread for user interaction and task acceptance.
Call the `codex_implement` MCP tool with `promptTemplate: "tdd"` for TDD-disciplined implementation. Use `codex_resume` for fix loops if TDD discipline is violated.
Reference `testing-anti-patterns.md` when reviewing Codex output for testing quality.

## Overview

Tests written after code prove nothing — passing tests don't confirm they test the right thing.

**Core principle:** NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.

**Announce at start:** "I'm using the test-driven-development skill to implement this with strict red-green-refactor discipline."

## The Iron Law

```
If you didn't watch the test fail, you don't know if it tests the right thing.
```

If Codex returns implementation without red-green evidence, reject it and resume with TDD enforcement.

## When to Use

- Any implementation task where test coverage is critical
- New features, bug fixes, refactors where behavior must be verified
- When the user explicitly requests TDD methodology

## Workflow

### Step 1: Verify Task Readiness

- [ ] Task has clear acceptance criteria
- [ ] Test framework is identified (check existing test files)
- [ ] Codex CLI is available

If acceptance criteria are unclear, ask the user before dispatching.

### Step 2: Call `codex_implement` with TDD Prompt Template

Call the `codex_implement` MCP tool with `promptTemplate: "tdd"`:

```json
{
  "tool": "codex_implement",
  "arguments": {
    "taskId": "task-17",
    "promptTemplate": "tdd",
    "prompt": "Implement the requested behavior with strict red-green-refactor discipline. Write the failing test first, then the minimal production change, then refactor only if the tests still pass.",
    "workspaceRoot": "/absolute/path/to/your/repo"
  }
}
```

The `tdd` prompt template routes through `skills/test-driven-development/prompts/tdd-implement-task.md`.

### Step 3: Verify TDD Evidence in Results

When Codex returns, check:

- [ ] `tests` array is non-empty
- [ ] Tests were written before implementation (red-green-refactor order)
- [ ] Each test has a clear, descriptive name covering one behavior
- [ ] No testing anti-patterns (see `testing-anti-patterns.md`)

### Step 4: Handle Status

| Status | Action |
|--------|--------|
| `DONE` | Verify tests pass, accept implementation |
| `DONE_WITH_CONCERNS` | Review concerns, check if TDD was followed despite issues |
| `BLOCKED` | Surface blocker to user, do not attempt workarounds |
| `NEEDS_CONTEXT` | Answer Codex's questions, resume with fix prompt |

### Step 5: Resume if TDD Violated

If the `tests` array is empty or implementation lacks red-green evidence, call `codex_resume` with `promptTemplate: "tdd"`:

```json
{
  "tool": "codex_resume",
  "arguments": {
    "taskId": "task-17",
    "sessionId": "<sessionId-from-previous-run>",
    "promptTemplate": "tdd",
    "prompt": "Tests must be written BEFORE implementation. Delete any production code written without a failing test. Start the red-green-refactor cycle from scratch. Fix the failing test: <describe what needs fixing>",
    "workspaceRoot": "/absolute/path/to/your/repo"
  }
}
```

## Red Flags

**Never:**
- Accept implementation without corresponding tests
- Skip the red-green-refactor cycle "just this once"
- Allow mocks to replace real behavior verification
- Let Codex write tests after implementation

**Always:**
- Verify test failure evidence before accepting
- Check for anti-patterns from `testing-anti-patterns.md`
- Ensure minimal implementation matching test requirements
- Run the full test suite after accepting

## Integration

**Can be used standalone** or as a methodology enforcer within `subagent-driven-development` by swapping the prompt file from `implement-task.md` to `tdd-implement-task.md`.

**Pairs with:**
- `subagent-driven-development` — TDD prompt can replace the standard implement prompt
- `requesting-code-review` — Review should verify TDD discipline was followed
