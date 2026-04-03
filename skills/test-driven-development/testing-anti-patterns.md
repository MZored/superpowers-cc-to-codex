<!--
Upstream source: obra/superpowers skills/test-driven-development/testing-anti-patterns.md
Last synced: 2026-04-03
Divergence: None — ported directly from upstream
-->

# Testing Anti-Patterns

**Core principle:** Test what the code does, not what the mocks do.

Verify actual behavior rather than confirming mocks function correctly.

## The Five Major Anti-Patterns

### 1. Testing Mock Behavior

Asserting on mock existence rather than real component functionality.

**Symptom:** Tests pass but production breaks because mocks don't reflect real behavior.

**Fix:** Test actual behavior or remove the mock entirely. If you're asserting that a mock was called, ask: does this verify the code works, or does it verify the mock works?

### 2. Test-Only Methods in Production

Adding cleanup or helper methods to production classes solely for test purposes.

**Symptom:** Methods in production code that are only called from test files.

**Fix:** Move test utilities to dedicated test helper files. Production code should not know it's being tested.

### 3. Mocking Without Understanding

Mocking methods without grasping their side effects.

**Symptom:** Tests break when mocked methods are updated because the mock didn't account for side effects that downstream code depends on.

**Fix:** Understand dependencies before applying mocks. Mock at the appropriate level — prefer higher-level integration over low-level method mocking.

### 4. Incomplete Mocks

Partial mock objects missing fields that downstream code consumes.

**Symptom:** Tests pass with partial mocks but production fails because real responses include fields the mock omitted.

**Fix:** Mock responses must reflect complete real API structures. If you can't mock the full shape, use a real instance instead.

### 5. Integration Tests as Afterthought

Treating integration testing as optional follow-up work.

**Symptom:** Unit tests pass but the system doesn't work end-to-end. Integration failures discovered late.

**Fix:** Write integration tests as part of the TDD cycle, not after. The red-green-refactor loop applies at all test levels.

## Warning Signs

Watch for these indicators that tests are not testing real behavior:

- Mock-specific test IDs or assertions (`expect(mock).toHaveBeenCalled()` without behavior check)
- Methods called only in test files (search for usage — if only tests use it, it's test-only)
- Mock setup exceeding 50% of test logic (the test is mostly about configuring fakes)
- Inability to explain why mocking is necessary ("because the tutorial did it" is not a reason)

## Prevention

TDD prevents these anti-patterns by forcing you to:
1. Write a test first — against real code, not mocks
2. Watch it fail — confirming the test exercises real behavior
3. Implement minimally — preventing test-only code from accumulating
4. Refactor — cleaning up without breaking the red-green contract
