# Codex Research Brief

Explore the repository and summarize the context needed to design the requested feature or change.
Cover these areas — skip any that are not relevant to the request:

## Repository Structure

- Identify the key directories and files involved in the area being changed
- Note existing patterns (naming, module organization, error handling, test structure)
- Flag any conventions that a design must follow (e.g. ES modules only, no TypeScript, specific test runner)

## Current Implementation

- Describe what currently exists in the relevant area
- Show concrete examples from the code (file paths + line ranges where helpful)
- Call out any coupling, shared state, or constraints that limit design choices

## Implementation Approaches

Propose 2–3 distinct approaches for implementing the requested change. For each:

- **What it does:** One sentence
- **Tradeoffs:** Complexity, coupling, test surface, backward compatibility
- **Fit:** How well does it match the existing codebase patterns?

## Risks and Unknowns

- What could go wrong?
- What information is missing that would change the design?
- Are there edge cases or integration points that need investigation before committing to an approach?

Return JSON matching `schemas/brainstorm-research.schema.json`.
