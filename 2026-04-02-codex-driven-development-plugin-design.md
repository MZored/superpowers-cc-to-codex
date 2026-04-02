# Codex-Driven Development Plugin

**Date:** 2026-04-02
**Status:** Approved

## Overview

A standalone Claude Code plugin that executes implementation plans using Codex (GPT-5.4) as the implementer and code quality reviewer, with Claude handling spec compliance review and orchestration. Published as a GitHub repository, installable via `/plugin marketplace add`.

## Motivation

The superpowers `subagent-driven-development` skill dispatches all work to Claude subagents. This plugin replaces the implementer and code quality reviewer roles with Codex, leveraging GPT-5.4's coding capabilities while keeping Claude as the orchestrator and spec compliance reviewer (where plan context knowledge matters most).

## Plugin Structure

```
codex-driven-development/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── package.json
├── README.md
├── LICENSE
└── skills/
    └── codex-driven-development/
        ├── SKILL.md                         # Main workflow
        ├── implementer-prompt.md            # Codex implementer template
        ├── implementer-fix-prompt.md        # Codex fix template (resume)
        ├── spec-reviewer-prompt.md          # Claude spec reviewer template
        └── code-quality-reviewer-focus.md   # Codex adversarial-review focus
```

## Roles and Engines

| Role | Engine | Mode | Invocation |
|------|--------|------|------------|
| Orchestrator | Claude (main session) | — | Controls workflow, git, tasks |
| Implementer | Codex | `task --write` | `node codex-companion.mjs task --write "prompt"` |
| Spec Reviewer | Claude | Agent tool | `Agent(general-purpose, prompt)` |
| Code Quality Reviewer | Codex | adversarial-review | `node codex-companion.mjs adversarial-review --base BASE_SHA "focus"` |

## Workflow

### Initialization

1. Verify Codex is ready: `node codex-companion.mjs setup --json` — abort if `ready: false`
2. Locate `codex-companion.mjs` dynamically via glob (resilient to version updates)
3. Read the implementation plan
4. Extract all tasks, create TodoWrite for tracking
5. Create a feature branch for the work

### Per-Task Execution Loop

```
For each task:

  Step 1: Codex Implementer
    codex task --write "<xml-structured prompt>"
    - Receives: full task text + scene-setting context
    - Does: writes code, tests in workspace
    - Returns: stdout with implementation report

  Step 2: Claude Spec Reviewer (Agent tool)
    - Reads actual code (does NOT trust Codex report)
    - Checks: all requirements implemented? extra work? misunderstandings?
    - Returns: APPROVED or ISSUES_FOUND with file:line references

    If ISSUES_FOUND:
      codex task --write --resume-last "<fix prompt with issues>"
      Re-run Step 2 (max 3 iterations, then escalate)

  Step 3: Codex Code Quality Reviewer
    codex adversarial-review --base BASE_SHA "<quality focus>"
    - Reviews: clean code, tests, single responsibility, error handling
    - Returns: structured findings by severity

    If Critical issues found:
      codex task --write --resume-last "<fix prompt with critical issues>"
      Re-run Step 3 (max 3 iterations, then escalate)

  Step 4: Orchestrator commits
    One task = one commit, on the feature branch
```

### Finishing

After all tasks complete:

1. Run final `codex adversarial-review --base <branch-start>` on entire branch diff
2. Present 4 options:
   - Merge to base branch locally
   - Push + create PR via `gh`
   - Keep branch as-is
   - Discard (requires typed confirmation)

## Prompt Templates

### Implementer Prompt (Codex task --write)

```xml
<task>
{TASK_NAME}: {FULL_TASK_DESCRIPTION}
</task>

<context>
{SCENE_SETTING — architectural context, dependencies, prior tasks}
</context>

<structured_output_contract>
Report:
1. What was implemented (files changed, key decisions)
2. Tests written and their results
3. Any concerns or uncertainties
</structured_output_contract>

<completeness_contract>
Resolve the task fully before stopping.
Do not stop at the first plausible implementation — check edge cases.
</completeness_contract>

<verification_loop>
Before finalizing:
- Run existing tests to verify nothing broken
- Verify implementation matches all task requirements
- Check for missing edge cases
</verification_loop>

<action_safety>
Keep changes tightly scoped to the stated task.
Avoid unrelated refactors, renames, or cleanup.
Do not modify files outside the task scope.
</action_safety>
```

### Implementer Fix Prompt (Codex task --write --resume-last)

```xml
<task>
Fix issues found by reviewer in the previous implementation.
</task>

<issues>
{REVIEWER_FINDINGS — specific issues with file:line references}
</issues>

<action_safety>
Fix ONLY the listed issues. Do not refactor or improve other code.
</action_safety>

<verification_loop>
Verify each issue is resolved before finalizing.
</verification_loop>
```

### Spec Reviewer Prompt (Claude Agent)

Provided as inline text to the Agent tool:

- Full text of task requirements (pasted, not file reference)
- Instruction: "Do NOT trust the implementer's report. Read the actual code."
- Checklist:
  - Missing requirements (skipped, incomplete, claimed but not implemented)
  - Extra work (over-engineered, not requested)
  - Misunderstandings (wrong interpretation, right feature wrong way)
- Output format: `APPROVED` or `ISSUES_FOUND: [list with file:line]`

### Code Quality Reviewer Focus (Codex adversarial-review)

```
Focus on: code quality, test coverage, clean architecture,
single responsibility, naming clarity, error handling.
Flag only material issues — not style or naming preferences.
Each finding must answer: What? Why problematic? Impact? How to fix?
```

## Edge Cases

### Fix-Loop Limits

- Max 3 iterations per review stage (spec compliance / code quality)
- After 3 failures: escalate to user with diagnosis
- Prevents infinite loops

### Codex Failures

| Situation | Action |
|-----------|--------|
| Codex timeout / crash | Retry once. If repeated — escalate |
| Empty output | Check auth via `setup --json`, retry |
| Cannot complete task | Show output, offer: split task / add context / switch to Claude Agent |
| `codex-companion.mjs` not found | Stop workflow, ask to install codex plugin |

### Git Workflow

- Codex does NOT commit — only writes files via `--write`
- Orchestrator commits after both reviews pass
- One task = one commit
- All work on a dedicated feature branch

### Task Ordering

- Strictly sequential — no parallel Codex implementers (file conflicts)
- Each task completes fully before the next begins

## Configuration

### plugin.json

```json
{
  "name": "codex-driven-development",
  "version": "1.0.0",
  "description": "Execute implementation plans using Codex for coding and review, Claude for spec compliance",
  "author": { "name": "mzored" },
  "license": "MIT",
  "skills": ["./skills/"]
}
```

### marketplace.json

```json
{
  "name": "codex-driven-dev",
  "description": "Codex-powered subagent development workflow",
  "plugins": [{
    "name": "codex-driven-development",
    "description": "Execute implementation plans using Codex for coding and review",
    "version": "1.0.0",
    "source": "./"
  }]
}
```

### SKILL.md Frontmatter

```yaml
---
name: codex-driven-development
description: Use when executing implementation plans with Codex as implementer and reviewer — dispatches coding tasks to Codex CLI with two-stage review per task
---
```

## Runtime Dependencies

- **Codex plugin** (`openai/codex-plugin-cc`) must be installed and authenticated
- Path to `codex-companion.mjs` resolved dynamically via glob at startup
- `gh` CLI required for PR creation option in finishing workflow

## Design Decisions

1. **Codex for implementation + quality review, Claude for spec review** — Codex excels at coding and code analysis; Claude excels at understanding plan context and requirements compliance.
2. **Thread resumption for fix loops** — `--resume-last` keeps Codex's context of prior work, more efficient than re-explaining the full task.
3. **Adversarial review for code quality** — purpose-built Codex feature with structured output and `--base` targeting, better than generic `task` mode for reviews.
4. **XML-structured prompts** — follows Codex best practices for clear task framing, output contracts, and verification.
5. **Autonomous from superpowers** — no dependency on superpowers plugin; finishing workflow and all templates are self-contained.
6. **Dynamic companion path** — resolved via `ls ~/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs | sort -V | tail -1`, picking the latest installed version.
