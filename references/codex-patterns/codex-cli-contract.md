# Codex CLI Contract Notes

- Minimum supported version: `0.111.0`
- Required commands: `codex exec`, `codex exec resume`, `codex review`
- Required flags: `--sandbox`, `--output-schema`, `--json`, `--base`, `--commit`
- Session tracking in the adapter parses `thread.started.thread_id` from `codex exec --json` output
- `codex exec --json` may interleave plain-text diagnostic lines with JSON events; streaming parsers must ignore non-JSON lines and surface them separately.
- Observed stable JSON lifecycle events in a read-only run on 2026-04-09: `thread.started`, `turn.started`, `item.completed` for `agent_message`, `turn.completed`
- Structured controller-managed review uses `codex exec` with `--output-schema`. For uncommitted scope, the adapter synthesizes `git status`, staged/unstaged diffs, and untracked paths into the prompt instead of relying on `codex review --uncommitted`.
- Advisory review uses top-level `codex review`, which currently exposes `--base`, `--commit`, and `--uncommitted` but not an explicit model flag
- Requested Fast mode is honored only for ChatGPT-backed auth; if the CLI rejects the fast tier, the adapter retries once without `service_tier`
