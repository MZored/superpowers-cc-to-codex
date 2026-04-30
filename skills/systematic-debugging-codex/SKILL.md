---
name: systematic-debugging-codex
description: Systematic 4-phase debugging with Codex-backed root cause investigation. Use only when the user explicitly asks for the Codex-backed debugging workflow.
disable-model-invocation: true
---
<!--
Upstream source: obra/superpowers skills/systematic-debugging/SKILL.md
Last synced: 2026-04-03
Divergence: Codex-backed investigator agent; methodology moved to prompts/debugging-methodology.md;
SKILL.md is orchestration-only with HARD-GATEs; explicit invocation only
-->

# Systematic Debugging

Keep Claude in the main thread for user interaction and fix decisions.
Call `codex_debug` for bounded root cause investigation (Phases 1-3).
Call `codex_implement` / `codex_resume` for applying fixes (Phase 4).

**Core principle:** ALWAYS find root cause before attempting fixes. Symptom fixes are failure.

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

<HARD-GATE>
Do NOT propose or attempt ANY fix until codex_debug has returned root cause evidence.
No exceptions — no matter how obvious the bug seems. If you catch yourself about to
fix something without Codex investigation output, STOP.
</HARD-GATE>

## Checklist

You MUST complete these steps in order:

### Phases 1-3: Investigation (Codex)

1. **Gather context** — collect error messages, stack traces, reproduction steps, recent changes from the user or logs. This is Claude's job.

2. **Dispatch investigator** — call the `codex_debug` MCP tool.
   Pass a full `prompt` body with the reproduction steps, current evidence, recent changes, and the exact question Codex should answer.

```json
{
  "tool": "codex_debug",
  "arguments": {
    "prompt": "Investigate why Codex-backed agents are still doing repository work locally instead of forwarding through the adapter. Include the current failure mode, relevant files, and the strongest root-cause hypothesis supported by code evidence.",
    "workspaceRoot": "/absolute/path/to/your/repo"
  }
}
```

3. **Handle status:**

| Status | Action |
|--------|--------|
| DONE | Review root_cause, hypothesis, evidence, suggested_fix |
| DONE_WITH_CONCERNS | Review concerns, decide if additional investigation needed |
| NEEDS_CONTEXT | Gather requested context from user, re-dispatch with new prompt |
| BLOCKED | Report blocker to user, gather missing info, re-dispatch |

4. **Review investigation** — Claude validates root_cause and hypothesis are supported by evidence. If evidence is weak, re-dispatch with a more focused prompt.

<HARD-GATE>
Do NOT proceed to Phase 4 until codex_debug output is reviewed and the root cause
hypothesis is confirmed with supporting evidence. Weak evidence = re-investigate.
</HARD-GATE>

### Phase 4: Fix

5. **Decide fix approach:**
   - Simple fix (1-2 lines, obvious from root cause) → Claude implements directly
   - Complex fix → dispatch `codex_implement` with the root cause and suggested fix

6. **Implement single fix** — ONE change addressing the root cause. No "while I'm here" improvements. No bundled refactoring.

7. **Handle implementer status (when Step 5 dispatched `codex_implement`):**

| Status (from `result.status`) | Action |
|--------|--------|
| DONE | Proceed to verify (Step 8) |
| DONE_WITH_CONCERNS | Read `concerns`; verify regardless, then triage the concerns (resume via `codex_resume` if blocking) |
| NEEDS_CONTEXT | Provide the requested context and resume the same task with `codex_resume(taskId="…")` — do NOT re-dispatch as a new implement call |
| BLOCKED | Surface the blocker to the user; if it invalidates the root cause, return to Step 2 |

   On error (no `result`), inspect `stderrTail` and use the resume hint in the error message to continue via `codex_resume`.

8. **Verify fix** — run tests, confirm resolution, check no regressions.

9. **If fix fails:**
   - Count attempts. If < 3: return to Step 2, re-investigate with new information
   - **If >= 3: STOP and question the architecture** (see below)

## When 3+ Fixes Fail

Pattern indicating architectural problem:
- Each fix reveals new shared state/coupling in different places
- Fixes require "massive refactoring" to implement
- Each fix creates new symptoms elsewhere

**STOP and question fundamentals** — discuss with your human partner before attempting more fixes. This is NOT a failed hypothesis; this is a wrong architecture.

## Red Flags — STOP and Re-investigate

If you catch yourself thinking any of these, return to Step 2:
- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"
- Proposing solutions before reviewing Codex investigation output
- "One more fix attempt" (when already tried 2+)

## Supporting Techniques

Available in this directory:

- **`root-cause-tracing.md`** — Trace bugs backward through call stack
- **`defense-in-depth.md`** — Add validation at multiple layers after finding root cause
- **`condition-based-waiting.md`** — Replace arbitrary timeouts with condition polling
