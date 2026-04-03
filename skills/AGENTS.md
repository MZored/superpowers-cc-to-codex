# Skills

Prompt-driven workflow definitions for forked Superpowers skills.

## Structure

Each skill directory contains:
- `SKILL.md` — Orchestration checklist for Claude (the controller)
- `prompts/*.md` — Detailed execution guidance sent to Codex agents
- Optional templates (`*-template.md`) and supporting methodology docs

## Conventions

- SKILL.md is for Claude: concise checklists, status handling, decision points
- prompts/ are for Codex: detailed task structure, self-review, escalation protocols
- Every SKILL.md carries an upstream sync header referencing the original Superpowers skill
- Hard gates prevent implementation without approved design (brainstorming skill)
- Systematic debugging enforces root cause investigation before any fix attempt

## Anti-Patterns

- Putting detailed execution guidance in SKILL.md instead of prompts/
- Creating skills without a Codex agent, schema, and prompt
- Skipping the design approval gate in brainstorming
- Fixing symptoms without root cause investigation (systematic-debugging)

## Key Files

| File | Role |
|------|------|
| `brainstorming/SKILL.md` | Design exploration with research delegation |
| `writing-plans/SKILL.md` | Plan creation with first-pass drafting |
| `subagent-driven-development/SKILL.md` | Task execution with two-stage review |
| `requesting-code-review/SKILL.md` | Structured and advisory diff review |
| `systematic-debugging/SKILL.md` | 4-phase debugging methodology |
| `test-driven-development/SKILL.md` | Strict TDD with red-green-refactor enforcement |
| `finishing-a-development-branch/SKILL.md` | Branch completion with readiness analysis |
