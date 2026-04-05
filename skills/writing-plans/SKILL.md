---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code. Codex-backed variant.
disable-model-invocation: true
---
<!--
Upstream source: obra/superpowers skills/writing-plans/SKILL.md
Last synced: 2026-04-03
Divergence: Codex-backed plan drafter for first pass; Claude reviews and finalizes; plugin-local template refs
-->

# Writing Plans

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Save plans to:** `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`
- (User preferences for plan location override this default)

## Checklist

You MUST create a task for each of these items and complete them in order:

1. **Scope check** — if the spec covers multiple independent subsystems, suggest breaking into separate plans (one per subsystem, each producing working testable software)
2. **Dispatch Codex plan drafter** — call the `codex_plan` MCP tool.
   Pass the approved spec verbatim as the `prompt` body; do not summarize it.
   Start the prompt with:

```json
{
  "tool": "codex_plan",
  "arguments": {
    "prompt": "Turn this approved spec into a detailed implementation plan.\n\nPaste the full approved spec below this line with no omissions or paraphrasing.\n\n<spec goes here>",
    "workspaceRoot": "/absolute/path/to/your/repo"
  }
}
```
3. **Review the draft** — Claude reviews the returned plan against the spec (see Self-Review below)
4. **Fix issues** — edit the plan inline to fix any gaps found in review
5. **Save plan** — write to `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md` using `plan-template.md` header; commit
6. **Offer execution** — present the plan to the user and offer to execute via superpowers-cc-to-codex:subagent-driven-development

## Self-Review (Claude's Job)

After receiving the Codex draft, review with fresh eyes:

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search the plan for red flags:
- "TBD", "TODO", "implement later"
- "Add appropriate error handling" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (code must be repeated)
- Steps without code blocks where code is needed

**3. Type consistency:** Do types, method signatures, and property names used in later tasks match what was defined in earlier tasks?

If you find issues, fix them inline. If you find a spec requirement with no task, add the task.

## Execution Handoff

After saving the plan:

> "Plan complete and saved to `<path>`. Execute using superpowers-cc-to-codex:subagent-driven-development — dispatches Codex implementer per task with two-stage review."
