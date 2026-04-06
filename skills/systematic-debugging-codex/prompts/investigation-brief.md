# Codex Debug Investigation Brief

Investigate the reported bug or test failure using the systematic 3-phase methodology in `debugging-methodology.md`:

**Phase 1 — Root Cause Investigation:**
- Read error messages and stack traces completely
- Reproduce the issue consistently
- Check recent changes (git diff, commits, config)
- Gather evidence at component boundaries in multi-layer systems
- Trace data flow backward through the call chain to find the source

**Phase 2 — Pattern Analysis:**
- Find working examples of similar code and compare patterns
- Identify specific differences between working and broken code
- Understand dependencies and assumptions

**Phase 3 — Hypothesis and Testing:**
- Form a concrete, specific hypothesis about the root cause
- Test with the SMALLEST possible change
- Verify before proposing the fix

**Key discipline:** Do NOT propose fixes before completing investigation. Seeing symptoms is not understanding root cause.

Return JSON matching `schemas/debug-investigation.schema.json`.
