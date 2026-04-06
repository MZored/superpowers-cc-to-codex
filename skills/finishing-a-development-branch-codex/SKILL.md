---
name: finishing-a-development-branch-codex
description: Complete development work with Codex-backed branch analysis and structured finish options. Use only when the user explicitly asks for the Codex-backed branch finishing workflow.
disable-model-invocation: true
---
<!--
Upstream source: obra/superpowers skills/finishing-a-development-branch/SKILL.md
Last synced: 2026-04-03
Divergence: Codex-backed branch analysis via codex-branch-analyzer, explicit invocation only, plugin-local prompt/schema references
-->

# Finishing a Development Branch

Keep Claude in the main thread for user interaction and git operations.
Call the `codex_branch_analysis` MCP tool for bounded branch readiness analysis.
Pass a `prompt` body that includes the current branch name, base branch, and what kind of finish decision is needed.
Example:
```json
{
  "tool": "codex_branch_analysis",
  "arguments": {
    "prompt": "Assess whether branch codex/agent-forwarding is ready to merge back to main. Call out failing tests, uncommitted work, or review gaps that would block a clean finish.",
    "workspaceRoot": "/absolute/path/to/your/repo"
  }
}
```

<HARD-GATE>
You MUST call codex_branch_analysis before presenting finish options.
Branch readiness assessment requires Codex analysis. No analysis = no finish actions.
</HARD-GATE>

## Overview

Guide completion of development work by presenting clear options and handling the chosen workflow.

**Core principle:** Verify tests -> Present options -> Execute choice -> Clean up.

**Announce at start:** "I'm using the finishing-a-development-branch skill to complete this work."

## Workflow

### Step 1: Call Branch Analysis

Call the `codex_branch_analysis` MCP tool to assess branch state.
Pass a `prompt` body that includes the current branch name, base branch, and what kind of finish decision is needed.
Example:
```json
{
  "tool": "codex_branch_analysis",
  "arguments": {
    "prompt": "Assess whether branch codex/agent-forwarding is ready to merge back to main. Call out failing tests, uncommitted work, or review gaps that would block a clean finish.",
    "workspaceRoot": "/absolute/path/to/your/repo"
  }
}
```

### Step 2: Review Analysis Results

Check the `readiness` field:

| Readiness | Action |
|-----------|--------|
| `ready` | Proceed to Step 3 |
| `tests_failing` | Show failures to user. Must fix before finishing. Stop here. |
| `uncommitted_work` | Prompt user to commit or stash first. Stop here. |
| `needs_review` | Suggest code review before finishing. User may override. |

If `concerns` array is non-empty, present them to the user.

### Step 3: Present Options

Present exactly these 4 options:

```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)
4. Discard this work

Which option?
```

Do not add explanation — keep options concise.

### Step 4: Execute Choice

#### Option 1: Merge Locally

```bash
git checkout <base-branch>
git pull
git merge <feature-branch>
# Verify tests on merged result
<test command>
# If tests pass
git branch -d <feature-branch>
```

Then: Cleanup worktree (Step 5).

#### Option 2: Push and Create PR

```bash
git push -u origin <feature-branch>
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<2-3 bullets of what changed>

## Test Plan
- [ ] <verification steps>
EOF
)"
```

Then: Cleanup worktree (Step 5).

#### Option 3: Keep As-Is

Report: "Keeping branch `<name>`. Worktree preserved at `<path>`."

Do not cleanup worktree.

#### Option 4: Discard

Confirm first:
```
This will permanently delete:
- Branch <name>
- All commits: <commit-list>
- Worktree at <path>

Type 'discard' to confirm.
```

Wait for exact confirmation. If confirmed:
```bash
git checkout <base-branch>
git branch -D <feature-branch>
```

Then: Cleanup worktree (Step 5).

### Step 5: Cleanup Worktree

For Options 1, 2, 4 — check if in worktree:
```bash
git worktree list | grep $(git branch --show-current)
```

If yes:
```bash
git worktree remove <worktree-path>
```

For Option 3: Keep worktree.

## Red Flags

**Never:**
- Proceed with failing tests
- Merge without verifying tests on the result
- Delete work without typed confirmation
- Force-push without explicit user request

**Always:**
- Verify tests before offering options
- Present exactly 4 options
- Get typed confirmation for Option 4
- Clean up worktree for Options 1 and 4 only

## Integration

**Called by:**
- `subagent-driven-development` — After all tasks complete
- Can be invoked standalone for any feature branch

**Pairs with:**
- `requesting-code-review` — Review before finishing (Option 2 especially)
- `test-driven-development` — TDD ensures tests pass before this skill runs
