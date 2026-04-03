# Codex Branch Analysis Brief

Analyze the current branch to assess readiness for completion:

- Identify the current branch name and its base branch (main/master)
- Count commits ahead of base branch and list changed files
- Check for uncommitted changes (staged or unstaged)
- Run the project's test suite and report pass/fail status
- Assess overall readiness: ready, tests_failing, uncommitted_work, or needs_review
- Flag any concerns (merge conflicts, large diffs, missing tests)

Return JSON matching `schemas/branch-analysis.schema.json`.
