# Codex TDD Implement Task

You are implementing a single task using strict Test-Driven Development.

## Execution Contract

- **Expected outcome:** implement the requested behavior through red-green-refactor without changing unrelated behavior.
- **Allowed side effects:** modify only task-relevant source, test, documentation, and generated files; do not perform unrelated refactors or destructive git operations.
- **Verification evidence:** report the failing-then-passing test evidence for each behavior plus the final full-suite result; if verification cannot run, report DONE_WITH_CONCERNS and explain the blocker.

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.
```

If you write production code before its test fails, delete it and start over.

## Red-Green-Refactor Cycle

For each behavior to implement, follow this exact sequence:

### 1. RED — Write a Failing Test
- Write ONE minimal test that demonstrates the desired behavior
- Run it — it MUST fail
- If it passes, the test is wrong (it doesn't test new behavior) — fix or remove it
- Name the test clearly: what behavior it verifies, not implementation details

### 2. GREEN — Write Minimal Implementation
- Write the SIMPLEST code that makes the failing test pass
- No speculative features, no "while I'm here" additions
- Run the test — it MUST pass now
- Run the full suite — nothing else should break

### 3. REFACTOR — Clean Up
- Improve code structure while keeping all tests green
- Remove duplication, clarify names, simplify logic
- Run the full suite after each refactoring step
- If any test breaks, undo the refactor and try a smaller change

### 4. Repeat
- Move to the next behavior and start from RED again

## Testing Anti-Patterns to Avoid

- **Testing mock behavior:** Assert on real component functionality, not mock existence
- **Test-only methods in production:** Never add methods to production code solely for tests
- **Mocking without understanding:** Know the side effects before applying mocks
- **Incomplete mocks:** Mock responses must reflect complete real API structures
- **Mock setup exceeding 50% of test logic:** Indicates design problems, not test problems

Use real code in tests. Avoid mocks unless absolutely necessary (external APIs, network calls).

## Before You Begin

If requirements or acceptance criteria are unclear, report NEEDS_CONTEXT with your questions. Don't guess.

## While You Work

- If something unexpected comes up, stop and report NEEDS_CONTEXT
- If the task requires architectural decisions beyond your scope, report BLOCKED
- One behavior per test, one test at a time
- Commit after each green-refactor cycle if the project uses granular commits

## Before Reporting Back: Self-Review

- [ ] Every function has a corresponding test that failed first
- [ ] Implementation is minimal — matches test requirements, nothing extra
- [ ] All tests pass with no warnings
- [ ] Edge cases and error conditions are covered
- [ ] No testing anti-patterns (mocks replacing real verification, test-only production methods)
- [ ] Red-green-refactor order was followed for every behavior

## Report Format

When done, report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented and the red-green-refactor progression
- Tests written and their results (show the failing-then-passing evidence)
- `red_green_evidence`: one entry per behavior with the failing RED command/result and passing GREEN command/result
- Files changed
- Self-review findings (if any)
- Any concerns about test coverage or implementation

Return JSON matching `schemas/implementer-result.schema.json`.
