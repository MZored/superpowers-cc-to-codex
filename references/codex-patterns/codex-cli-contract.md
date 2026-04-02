# Codex CLI Contract Notes

- Minimum supported version: `0.111.0`
- Required commands: `codex exec`, `codex exec resume`, `codex review`
- Required flags: `--sandbox`, `--output-schema`, `--json`, `--base`, `--commit`
- Session tracking in the adapter parses `thread.started.thread_id` from `codex exec --json` output
- Structured controller-managed review uses `codex exec` with `--output-schema`
- Advisory review uses top-level `codex review`, which currently exposes `--base`, `--commit`, and `--uncommitted` but not an explicit model flag
- Requested Fast mode is honored only for ChatGPT-backed auth; if the CLI rejects the fast tier, the adapter retries once without `service_tier`
