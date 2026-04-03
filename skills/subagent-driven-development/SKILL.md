<!--
Upstream source: obra/superpowers skills/subagent-driven-development/SKILL.md
Last synced: 2026-04-03
Divergence: Codex-backed implementer/reviewer agents replace Claude subagents; adapter-managed resume flow
-->
---
name: subagent-driven-development
description: Execute an implementation plan by dispatching Codex-backed implementer and reviewer agents while Claude keeps spec-compliance control. Codex-backed variant.
disable-model-invocation: true
---

# Subagent-Driven Development

Execute plan by dispatching `codex-implementer` per task, with two-stage review after each: Claude-side spec compliance first, then `codex-reviewer` for code quality.

**Core principle:** Codex implementer per task + two-stage review (spec then quality) = high quality, fast iteration

## Checklist

You MUST create a task for each plan task and complete them in order.

**Setup:**

1. **Read plan** — read the plan file once, extract all tasks with full text and context
2. **Create TodoWrite** — one entry per plan task

**Per task:**

3. **Dispatch implementer** — send full task text + context to `codex-implementer` via `prompts/implement-task.md` (the brief contains TDD, self-review, escalation, and report format requirements)
4. **Handle status** — see Status Handling below
5. **Spec compliance review** — Claude reads the actual code and verifies against spec using `spec-review-template.md` (contains verification methodology); if issues: resume the Codex thread with `prompts/fix-task.md`
6. **Code quality review** — dispatch `codex-reviewer` only after spec compliance passes
7. **Mark complete** — only after both gates pass

**After all tasks:**

8. **Final review** — dispatch `codex-reviewer` for the entire implementation
9. **Finish branch** — wrap up the development branch

## Status Handling

Handle the implementer's reported status:

| Status | Action |
|---|---|
| **DONE** | Proceed to spec compliance review |
| **DONE_WITH_CONCERNS** | Read concerns; if correctness/scope — address before review; if observations — note and proceed |
| **NEEDS_CONTEXT** | Provide the missing context and re-dispatch |
| **BLOCKED** | Assess: context problem → re-dispatch with more context; too hard → escalate approach; too large → break down; plan wrong → escalate to human |

**Never** ignore an escalation or force the same agent to retry without changes.

## Red Flags

**Never:**

- Skip reviews (spec compliance OR code quality)
- Proceed with unfixed issues
- Dispatch multiple implementer agents in parallel (conflicts)
- Make the Codex agent read the plan file (provide full text instead)
- **Start code quality review before spec compliance passes** (wrong order)
- Move to next task while either review has open issues

**If reviewer finds issues:** resume the implementer thread to fix, reviewer reviews again, repeat until approved.

## Integration

- **superpowers-cc-to-codex:writing-plans** — creates the plan this skill executes
- **superpowers-cc-to-codex:requesting-code-review** — code review via `codex-reviewer`
