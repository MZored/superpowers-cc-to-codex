# Architecture

- Claude remains the controller and spec-review owner.
- Codex-backed forwarders handle research, first-pass planning, implementation, and diff review.
- `scripts/codex-run.mjs` is the only place that knows how to invoke the Codex CLI.
- There is no runtime dependency on `codex-plugin-cc`; only the public `codex` CLI is required.
- Task session state lives under `.claude/state/codex/` so plugin updates do not destroy resume metadata.
