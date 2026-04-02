# Superpowers Codex Fork Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Claude Code plugin that forks four `superpowers` workflows and routes bounded research, planning, implementation, and review work through the public `codex` CLI with explicit contracts, state tracking, and validation.

**Architecture:** Keep the repo shaped like a normal Claude plugin and a normal marketplace checkout so it can be installed directly from GitHub with `claude plugin marketplace add`. Fork only the four workflow entrypoints, keep them explicit via `disable-model-invocation: true`, and push all Codex execution details into a thin Node-based adapter that owns CLI probing, schema wiring, role defaults, and per-task session state under `.claude/state/codex/`. Preserve upstream `superpowers` prompt structure where it still works, but move every transitive dependency needed by the fork into this repo so runtime behavior stays independent from upstream.

**Tech Stack:** Claude Code plugin manifests, Markdown skills/agents/commands, Node.js 22+ ESM scripts, JSON Schema, Node built-in test runner, GitHub Actions, public `codex` CLI, `claude` CLI.

---

## File Map

| Path | Responsibility |
|---|---|
| `.claude-plugin/plugin.json` | Plugin metadata for Claude Code validation and installation |
| `.claude-plugin/marketplace.json` | Lets the repo itself act as a one-plugin marketplace source |
| `package.json` | Maintainer scripts for tests, validation, doctor, and drift checks |
| `.gitignore` | Ignore `node_modules`, `.claude/state`, and test artifacts |
| `commands/doctor.md` | User-facing preflight command for CLI/runtime validation |
| `skills/brainstorming/SKILL.md` | Forked Codex-backed brainstorming workflow, explicitly invoked |
| `skills/brainstorming/design-template.md` | Output template for written design docs |
| `skills/brainstorming/prompts/research-brief.md` | Prompt body passed to the researcher agent |
| `skills/writing-plans/SKILL.md` | Forked plan-writing workflow, explicitly invoked |
| `skills/writing-plans/plan-template.md` | Canonical implementation-plan template for the fork |
| `skills/writing-plans/prompts/planning-brief.md` | Prompt body passed to the plan-drafter agent |
| `skills/subagent-driven-development/SKILL.md` | Main controller workflow for task execution and fix loops |
| `skills/subagent-driven-development/implementer-template.md` | Prompt template for initial implementation runs |
| `skills/subagent-driven-development/spec-review-template.md` | Claude-side spec compliance review template |
| `skills/subagent-driven-development/code-review-template.md` | Prompt template for controller-managed review |
| `skills/subagent-driven-development/prompts/implement-task.md` | Codex implementer prompt brief |
| `skills/subagent-driven-development/prompts/fix-task.md` | Codex resume/fix-loop prompt brief |
| `skills/subagent-driven-development/prompts/final-review.md` | Branch-wide review prompt brief |
| `skills/requesting-code-review/SKILL.md` | Ad-hoc review workflow using the shared reviewer agent |
| `skills/requesting-code-review/prompts/review-brief.md` | Review focus prompt for ad-hoc review |
| `agents/codex-brainstorm-researcher.md` | Thin forwarder agent for Codex research |
| `agents/codex-plan-drafter.md` | Thin forwarder agent for Codex plan drafting |
| `agents/codex-implementer.md` | Thin forwarder agent for Codex implementation |
| `agents/codex-reviewer.md` | Thin forwarder agent for Codex diff review |
| `scripts/detect-codex.mjs` | Detects whether Codex is installed, which version is available, and whether the user is authenticated |
| `scripts/check-codex-cli.mjs` | Verifies the minimum supported CLI contract |
| `scripts/doctor.mjs` | Runs the full local preflight: Node, git, workspace writability, Codex auth/contract, and plugin validation |
| `scripts/codex-run.mjs` | Main adapter that maps roles to `codex exec`, `codex exec resume`, or `codex review` |
| `scripts/check-upstream-superpowers.mjs` | Reports drift between forked skill files and upstream references |
| `scripts/lib/codex-state.mjs` | Reads/writes per-task session metadata under `.claude/state/codex/` |
| `schemas/brainstorm-research.schema.json` | Structured output contract for research runs |
| `schemas/plan-draft.schema.json` | Structured output contract for first-pass plan drafting |
| `schemas/implementer-result.schema.json` | Structured output contract for initial implementation runs |
| `schemas/spec-review.schema.json` | Structured contract for normalized Claude spec review output |
| `schemas/code-review.schema.json` | Structured output contract for controller-managed code review |
| `references/upstream-superpowers/manifest.json` | Declares the fork surface and the upstream files used for drift checks |
| `references/codex-patterns/codex-cli-contract.md` | Human-readable notes about the supported Codex CLI surface and runtime expectations |
| `docs/architecture.md` | Runtime architecture and controller/worker split |
| `docs/distribution.md` | Installation, release, and marketplace/source packaging |
| `docs/upstream-sync.md` | Fork-surface policy and sync procedure |
| `docs/prompts.md` | Prompt inventory and rationale |
| `.github/workflows/validate.yml` | CI for tests, drift checks, and `claude plugin validate` |
| `tests/adapter/*.test.mjs` | Unit tests for runtime detection, state, adapter command-building, and drift checks |
| `tests/prompt-contracts/*.test.mjs` | Contract tests for skill frontmatter, agent prompts, schema linkage, and docs references |
| `tests/fixtures/` | Stable CLI/help/output fixtures for deterministic tests |

### Task 1: Bootstrap The Plugin Repository

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`
- Create: `package.json`
- Create: `.gitignore`
- Test: `tests/adapter/repo-layout.test.mjs`

- [ ] **Step 1: Write the failing repository-layout test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function readJson(relativePath) {
  const url = new URL(`../../${relativePath}`, import.meta.url);
  return JSON.parse(await readFile(url, 'utf8'));
}

test('plugin manifest exists and declares the fork metadata', async () => {
  const plugin = await readJson('.claude-plugin/plugin.json');
  assert.equal(plugin.name, 'superpowers-codex-fork');
  assert.match(plugin.description, /Codex-backed workflow/i);
});

test('marketplace manifest exposes exactly one plugin from this repo', async () => {
  const marketplace = await readJson('.claude-plugin/marketplace.json');
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, 'superpowers-codex-fork');
  assert.equal(marketplace.plugins[0].source, './');
});

test('package.json wires the maintainer scripts', async () => {
  const pkg = await readJson('package.json');
  assert.equal(pkg.type, 'module');
  assert.ok(pkg.scripts.test);
  assert.ok(pkg.scripts['validate:plugin']);
  assert.ok(pkg.scripts.doctor);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/adapter/repo-layout.test.mjs`
Expected: FAIL with `ENOENT` for `.claude-plugin/plugin.json`

- [ ] **Step 3: Write the minimal repository metadata**

```json
// package.json
{
  "name": "superpowers-codex-fork",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "description": "Standalone Claude Code plugin that forks selected superpowers workflows for Codex-backed execution.",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "test": "node --test",
    "validate:plugin": "claude plugin validate .",
    "doctor": "node scripts/detect-codex.mjs && node scripts/check-codex-cli.mjs && npm run validate:plugin",
    "check:upstream": "node scripts/check-upstream-superpowers.mjs"
  }
}
```

```json
// .claude-plugin/plugin.json
{
  "name": "superpowers-codex-fork",
  "version": "0.1.0",
  "description": "Codex-backed fork of four superpowers workflows for research, planning, implementation, and review.",
  "author": {
    "name": "mzored"
  },
  "license": "MIT",
  "homepage": "https://github.com/mzored/superpowers-codex-fork",
  "repository": "https://github.com/mzored/superpowers-codex-fork",
  "keywords": [
    "claude-code",
    "codex",
    "skills",
    "workflow",
    "superpowers"
  ]
}
```

```json
// .claude-plugin/marketplace.json
{
  "name": "superpowers-codex-fork",
  "description": "Single-plugin marketplace source for the Codex-backed superpowers fork.",
  "owner": {
    "name": "mzored"
  },
  "plugins": [
    {
      "name": "superpowers-codex-fork",
      "description": "Codex-backed fork of four superpowers workflows for Claude Code.",
      "version": "0.1.0",
      "source": "./",
      "author": {
        "name": "mzored"
      }
    }
  ]
}
```

```gitignore
# dependencies
node_modules/

# runtime state
.claude/state/

# test output
coverage/
.tmp/
```

- [ ] **Step 4: Run the repository-layout test to verify it passes**

Run: `node --test tests/adapter/repo-layout.test.mjs`
Expected: PASS with `3 tests` passing

- [ ] **Step 5: Validate both manifests with Claude**

Run: `npm run validate:plugin`
Expected: PASS with no validation errors

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore .claude-plugin/plugin.json .claude-plugin/marketplace.json tests/adapter/repo-layout.test.mjs
git commit -m "chore: bootstrap plugin repository"
```

### Task 2: Detect Codex And Enforce The Minimum CLI Contract

**Files:**
- Create: `scripts/detect-codex.mjs`
- Create: `scripts/check-codex-cli.mjs`
- Test: `tests/adapter/codex-cli-contract.test.mjs`

- [ ] **Step 1: Write the failing Codex contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCodexVersion, verifyCodexCliContract } from '../../scripts/check-codex-cli.mjs';

test('verifyCodexCliContract accepts the required exec, resume, and review surface', () => {
  const result = verifyCodexCliContract({
    versionText: 'codex-cli 0.111.0',
    execHelp: 'Run Codex non-interactively\nresume  Resume a previous session by id or pick the most recent with --last\n-s, --sandbox <SANDBOX_MODE>\n--output-schema <FILE>\n--json',
    resumeHelp: 'Resume a previous session by id or pick the most recent with --last\n--last',
    reviewHelp: 'Run a code review non-interactively\n--base <BRANCH>\n--commit <SHA>'
  });

  assert.equal(result.version, '0.111.0');
  assert.deepEqual(result.missing, []);
});

test('parseCodexVersion rejects versions lower than the supported floor', () => {
  assert.throws(() => parseCodexVersion('codex-cli 0.110.9'), /minimum supported Codex CLI version is 0.111.0/);
});
```

- [ ] **Step 2: Run the Codex contract test to verify it fails**

Run: `node --test tests/adapter/codex-cli-contract.test.mjs`
Expected: FAIL with `Cannot find module '../../scripts/check-codex-cli.mjs'`

- [ ] **Step 3: Implement runtime detection and contract verification**

```js
// scripts/detect-codex.mjs
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function detectCodexRuntime({ runner = execFileAsync } = {}) {
  const version = await runner('codex', ['--version']).catch((error) => {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  });

  if (!version) {
    return {
      installed: false,
      version: null,
      authenticated: false,
      loginStatus: 'codex binary not found in PATH'
    };
  }

  const login = await runner('codex', ['login', 'status']).catch((error) => ({
    stdout: '',
    stderr: error.stderr ?? error.message,
    code: error.code ?? 1
  }));
  const loginStatus = (login.stdout || login.stderr).trim();
  const authProvider = /ChatGPT/i.test(loginStatus)
    ? 'chatgpt'
    : /API key/i.test(loginStatus)
      ? 'api_key'
      : 'unknown';

  return {
    installed: true,
    version: version.stdout.trim(),
    authenticated: login.code === 0,
    loginStatus,
    authProvider
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runtime = await detectCodexRuntime();
  console.log(JSON.stringify(runtime, null, 2));
}
```

```js
// scripts/check-codex-cli.mjs
const MINIMUM_CODEX_VERSION = '0.111.0';

export function parseCodexVersion(versionText) {
  const match = versionText.match(/codex-cli\\s+(\\d+\\.\\d+\\.\\d+)/);
  if (!match) throw new Error(`Could not parse Codex version from: ${versionText}`);
  const version = match[1];
  if (compareVersions(version, MINIMUM_CODEX_VERSION) < 0) {
    throw new Error(`minimum supported Codex CLI version is ${MINIMUM_CODEX_VERSION}`);
  }
  return version;
}

export function verifyCodexCliContract({ versionText, execHelp, resumeHelp, reviewHelp }) {
  const version = parseCodexVersion(versionText);
  const requiredChecks = [
    ['exec help exposes resume subcommand', /resume\\s+Resume a previous session/i.test(execHelp)],
    ['exec help exposes sandbox selection', /--sandbox/i.test(execHelp)],
    ['exec help exposes output-schema', /--output-schema/i.test(execHelp)],
    ['exec help exposes json mode', /--json/i.test(execHelp)],
    ['review help documents code review mode', /Run a code review non-interactively/i.test(reviewHelp)],
    ['resume help exposes --last', /--last/i.test(resumeHelp)],
    ['review help exposes --base', /--base/i.test(reviewHelp)],
    ['review help exposes --commit', /--commit/i.test(reviewHelp)]
  ];

  return {
    version,
    minimumVersion: MINIMUM_CODEX_VERSION,
    missing: requiredChecks.filter(([, ok]) => !ok).map(([label]) => label)
  };
}

function compareVersions(left, right) {
  const lhs = left.split('.').map(Number);
  const rhs = right.split('.').map(Number);
  for (let i = 0; i < Math.max(lhs.length, rhs.length); i += 1) {
    const diff = (lhs[i] ?? 0) - (rhs[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
```

- [ ] **Step 4: Replace `scripts/check-codex-cli.mjs` with the full executable version**

```js
// scripts/check-codex-cli.mjs
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const MINIMUM_CODEX_VERSION = '0.111.0';

export function parseCodexVersion(versionText) {
  const match = versionText.match(/codex-cli\\s+(\\d+\\.\\d+\\.\\d+)/);
  if (!match) throw new Error(`Could not parse Codex version from: ${versionText}`);
  const version = match[1];
  if (compareVersions(version, MINIMUM_CODEX_VERSION) < 0) {
    throw new Error(`minimum supported Codex CLI version is ${MINIMUM_CODEX_VERSION}`);
  }
  return version;
}

export function verifyCodexCliContract({ versionText, execHelp, resumeHelp, reviewHelp }) {
  const version = parseCodexVersion(versionText);
  const requiredChecks = [
    ['exec help exposes resume subcommand', /resume\\s+Resume a previous session/i.test(execHelp)],
    ['exec help exposes sandbox selection', /--sandbox/i.test(execHelp)],
    ['exec help exposes output-schema', /--output-schema/i.test(execHelp)],
    ['exec help exposes json mode', /--json/i.test(execHelp)],
    ['review help documents code review mode', /Run a code review non-interactively/i.test(reviewHelp)],
    ['resume help exposes --last', /--last/i.test(resumeHelp)],
    ['review help exposes --base', /--base/i.test(reviewHelp)],
    ['review help exposes --commit', /--commit/i.test(reviewHelp)]
  ];

  return {
    version,
    minimumVersion: MINIMUM_CODEX_VERSION,
    missing: requiredChecks.filter(([, ok]) => !ok).map(([label]) => label)
  };
}

function compareVersions(left, right) {
  const lhs = left.split('.').map(Number);
  const rhs = right.split('.').map(Number);
  for (let i = 0; i < Math.max(lhs.length, rhs.length); i += 1) {
    const diff = (lhs[i] ?? 0) - (rhs[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [version, execHelp, resumeHelp, reviewHelp] = await Promise.all([
    execFileAsync('codex', ['--version']),
    execFileAsync('codex', ['exec', '--help']),
    execFileAsync('codex', ['exec', 'resume', '--help']),
    execFileAsync('codex', ['review', '--help'])
  ]);

  const result = verifyCodexCliContract({
    versionText: version.stdout,
    execHelp: execHelp.stdout,
    resumeHelp: resumeHelp.stdout,
    reviewHelp: reviewHelp.stdout
  });

  if (result.missing.length > 0) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}
```

- [ ] **Step 5: Run the test and both scripts**

Run: `node --test tests/adapter/codex-cli-contract.test.mjs`
Expected: PASS with `2 tests` passing

Run: `node scripts/check-codex-cli.mjs`
Expected: JSON output with `"version": "0.111.0"` and an empty `"missing"` array

Run: `node scripts/detect-codex.mjs`
Expected: JSON output with `installed`, `version`, and `authenticated` fields

- [ ] **Step 6: Commit**

```bash
git add scripts/detect-codex.mjs scripts/check-codex-cli.mjs tests/adapter/codex-cli-contract.test.mjs
git commit -m "feat: add codex runtime detection"
```

### Task 3: Persist Task Session State And Add Runtime Schemas

**Files:**
- Create: `scripts/lib/codex-state.mjs`
- Create: `schemas/implementer-result.schema.json`
- Create: `schemas/spec-review.schema.json`
- Create: `schemas/code-review.schema.json`
- Test: `tests/adapter/codex-state.test.mjs`

- [ ] **Step 1: Write the failing state-and-schema test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTaskState, saveTaskState } from '../../scripts/lib/codex-state.mjs';

test('saveTaskState round-trips task metadata under .claude/state/codex', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sp-codex-'));
  await saveTaskState(root, 'task-3', {
    taskId: 'task-3',
    role: 'implementer',
    phase: 'implement',
    cwd: '/repo',
    sessionId: '019d4f82-58b8-72d3-9212-2e3d3fc69bcb'
  });

  const loaded = await loadTaskState(root, 'task-3');
  assert.equal(loaded.phase, 'implement');
  assert.equal(loaded.sessionId, '019d4f82-58b8-72d3-9212-2e3d3fc69bcb');
});

test('implementer schema requires the full controller contract', async () => {
  const schema = JSON.parse(
    await readFile(new URL('../../schemas/implementer-result.schema.json', import.meta.url), 'utf8')
  );

  assert.deepEqual(schema.required, ['status', 'summary', 'files_changed', 'tests', 'concerns']);
  assert.deepEqual(schema.properties.status.enum, ['DONE', 'DONE_WITH_CONCERNS', 'BLOCKED', 'NEEDS_CONTEXT']);
});
```

- [ ] **Step 2: Run the state-and-schema test to verify it fails**

Run: `node --test tests/adapter/codex-state.test.mjs`
Expected: FAIL with `Cannot find module '../../scripts/lib/codex-state.mjs'`

- [ ] **Step 3: Implement the task-state store**

```js
// scripts/lib/codex-state.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

function stateDir(workspaceRoot) {
  return join(workspaceRoot, '.claude', 'state', 'codex');
}

function stateFile(workspaceRoot, taskId) {
  return join(stateDir(workspaceRoot), `${taskId}.json`);
}

export async function saveTaskState(workspaceRoot, taskId, state) {
  await mkdir(stateDir(workspaceRoot), { recursive: true });
  await writeFile(stateFile(workspaceRoot, taskId), JSON.stringify(state, null, 2) + '\n', 'utf8');
}

export async function loadTaskState(workspaceRoot, taskId) {
  const raw = await readFile(stateFile(workspaceRoot, taskId), 'utf8');
  return JSON.parse(raw);
}
```

- [ ] **Step 4: Add the three schema files**

```json
// schemas/implementer-result.schema.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["status", "summary", "files_changed", "tests", "concerns"],
  "properties": {
    "status": {
      "type": "string",
      "enum": ["DONE", "DONE_WITH_CONCERNS", "BLOCKED", "NEEDS_CONTEXT"]
    },
    "summary": { "type": "string" },
    "files_changed": {
      "type": "array",
      "items": { "type": "string" }
    },
    "tests": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["command", "result"],
        "properties": {
          "command": { "type": "string" },
          "result": { "type": "string" }
        }
      }
    },
    "concerns": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

```json
// schemas/spec-review.schema.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["status", "issues"],
  "properties": {
    "status": {
      "type": "string",
      "enum": ["APPROVED", "ISSUES_FOUND"]
    },
    "issues": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["file", "line", "issue", "severity"],
        "properties": {
          "file": { "type": "string" },
          "line": { "type": "integer" },
          "issue": { "type": "string" },
          "severity": { "type": "string", "enum": ["important", "critical"] }
        }
      }
    }
  }
}
```

```json
// schemas/code-review.schema.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["assessment", "strengths", "issues"],
  "properties": {
    "assessment": {
      "type": "string",
      "enum": ["approved", "with_fixes", "blocked"]
    },
    "strengths": {
      "type": "array",
      "items": { "type": "string" }
    },
    "issues": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["severity", "file", "line", "title", "why", "fix"],
        "properties": {
          "severity": { "type": "string", "enum": ["critical", "important", "minor"] },
          "file": { "type": "string" },
          "line": { "type": "integer" },
          "title": { "type": "string" },
          "why": { "type": "string" },
          "fix": { "type": "string" }
        }
      }
    }
  }
}
```

- [ ] **Step 5: Run the state-and-schema test to verify it passes**

Run: `node --test tests/adapter/codex-state.test.mjs`
Expected: PASS with `2 tests` passing

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/codex-state.mjs schemas/implementer-result.schema.json schemas/spec-review.schema.json schemas/code-review.schema.json tests/adapter/codex-state.test.mjs
git commit -m "feat: add adapter state and schemas"
```

### Task 4: Build The Thin Codex Adapter

**Files:**
- Create: `scripts/codex-run.mjs`
- Test: `tests/adapter/codex-run.test.mjs`
- Create: `tests/fixtures/codex/exec-events.jsonl`
- Create: `tests/fixtures/codex/implement-prompt.md`

- [ ] **Step 1: Write the failing adapter test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvocation, extractThreadId } from '../../scripts/codex-run.mjs';

test('implement runs use codex exec with workspace-write and an output schema', () => {
  const invocation = buildInvocation({
    mode: 'implement',
    cwd: '/repo',
    taskId: 'task-4',
    model: 'gpt-5.4',
    effort: 'medium',
    schemaPath: 'schemas/implementer-result.schema.json',
    promptFile: 'skills/subagent-driven-development/prompts/implement-task.md'
  });

  assert.deepEqual(invocation.command.slice(0, 4), ['codex', 'exec', '--json', '--sandbox']);
  assert.ok(invocation.command.includes('workspace-write'));
  assert.ok(invocation.command.includes('--output-schema'));
});

test('extractThreadId reads the thread.started event from jsonl output', () => {
  const threadId = extractThreadId([
    '{"type":"thread.started","thread_id":"019d4f82-58b8-72d3-9212-2e3d3fc69bcb"}',
    '{"type":"turn.started"}'
  ].join('\\n'));

  assert.equal(threadId, '019d4f82-58b8-72d3-9212-2e3d3fc69bcb');
});

test('structured review runs stay on codex exec so the controller can enforce a schema', () => {
  const invocation = buildInvocation({
    mode: 'review',
    cwd: '/repo',
    taskId: 'task-4-review',
    model: 'gpt-5.4',
    effort: 'medium',
    base: 'origin/main',
    schemaPath: 'schemas/code-review.schema.json',
    promptFile: 'tests/fixtures/codex/implement-prompt.md'
  });

  assert.deepEqual(invocation.command.slice(0, 2), ['codex', 'exec']);
  assert.ok(invocation.command.includes('--output-schema'));
  assert.equal(invocation.base, 'origin/main');
});

test('advisory review can target a specific commit on the top-level review command', () => {
  const invocation = buildInvocation({
    mode: 'review',
    cwd: '/repo',
    taskId: 'task-4-review-commit',
    commit: 'abc1234',
    model: 'gpt-5.4'
  });

  assert.deepEqual(invocation.command, ['codex', 'review', '--commit', 'abc1234']);
});
```

- [ ] **Step 2: Run the adapter test to verify it fails**

Run: `node --test tests/adapter/codex-run.test.mjs`
Expected: FAIL with `Cannot find module '../../scripts/codex-run.mjs'`

- [ ] **Step 3: Add the JSONL fixture and implement the adapter**

```text
# tests/fixtures/codex/exec-events.jsonl
{"type":"thread.started","thread_id":"019d4f82-58b8-72d3-9212-2e3d3fc69bcb"}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"OK"}}
{"type":"turn.completed","usage":{"input_tokens":1,"cached_input_tokens":0,"output_tokens":1}}
```

```md
<!-- tests/fixtures/codex/implement-prompt.md -->
# Fixture Prompt

Return a valid structured response.
```

```js
// scripts/codex-run.mjs
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { saveTaskState, loadTaskState } from './lib/codex-state.mjs';
import { detectCodexRuntime } from './detect-codex.mjs';

const execFileAsync = promisify(execFile);

const SANDBOX_BY_MODE = {
  research: 'read-only',
  plan: 'read-only',
  implement: 'workspace-write',
  review: 'read-only',
  resume: 'workspace-write'
};

function normalizeServiceTier(requestedServiceTier, authProvider) {
  if (requestedServiceTier !== 'fast') return requestedServiceTier ?? null;
  return authProvider === 'chatgpt' ? 'fast' : null;
}

export function buildInvocation({ mode, cwd, taskId, model, effort, serviceTier, authProvider, schemaPath, promptFile, base, commit, sessionId, dryRun = false }) {
  const command = [];
  const common = ['-m', model];
  if (effort) common.push('-c', `model_reasoning_effort="${effort}"`);
  const effectiveServiceTier = normalizeServiceTier(serviceTier, authProvider);
  if (effectiveServiceTier) common.push('-c', `service_tier="${effectiveServiceTier}"`);

  if (mode === 'review' && !schemaPath && (base || commit)) {
    return {
      command: commit
        ? ['codex', 'review', '--commit', commit]
        : ['codex', 'review', '--base', base],
      cwd,
      dryRun,
      mode,
      base,
      commit
    };
  }

  if (mode === 'resume') {
    command.push('codex', 'exec', 'resume', sessionId);
  } else {
    command.push('codex', 'exec');
  }

  command.push('--json', '--sandbox', SANDBOX_BY_MODE[mode], '-C', cwd, ...common);
  if (schemaPath && mode !== 'resume') command.push('--output-schema', schemaPath);

  return { command, cwd, dryRun, promptFile, mode, base, commit, serviceTier: effectiveServiceTier };
}

export function extractThreadId(jsonl) {
  for (const line of jsonl.split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    const event = JSON.parse(line);
    if (event.type === 'thread.started') return event.thread_id;
  }
  return null;
}

async function runInvocation(invocation) {
  if (invocation.dryRun) {
    console.log(JSON.stringify(invocation, null, 2));
    return { stdout: JSON.stringify(invocation), stderr: '' };
  }

  const promptBody = invocation.promptFile
    ? await readFile(invocation.promptFile, 'utf8')
    : undefined;
  let prompt = promptBody;

  if (invocation.mode === 'review' && (invocation.base || invocation.commit)) {
    if (invocation.base) {
      const [stat, diff] = await Promise.all([
        execFileAsync('git', ['diff', '--stat', `${invocation.base}..HEAD`], { cwd: invocation.cwd }),
        execFileAsync('git', ['diff', `${invocation.base}..HEAD`], { cwd: invocation.cwd })
      ]);

      prompt = [
        promptBody ?? '',
        '',
        '## Diff Scope',
        `Base: ${invocation.base}`,
        '',
        '### git diff --stat',
        stat.stdout.trim(),
        '',
        '### git diff',
        diff.stdout.trim()
      ].join('\n');
    } else {
      const commitView = await execFileAsync('git', ['show', '--stat', '--format=medium', invocation.commit], { cwd: invocation.cwd });
      prompt = [
        promptBody ?? '',
        '',
        '## Diff Scope',
        `Commit: ${invocation.commit}`,
        '',
        '### git show --stat --format=medium',
        commitView.stdout.trim()
      ].join('\n');
    }
  }

  const run = async (command) => {
    const args = prompt ? [...command.slice(1), prompt] : command.slice(1);
    return execFileAsync(command[0], args, { cwd: invocation.cwd });
  };

  try {
    return await run(invocation.command);
  } catch (error) {
    if (invocation.serviceTier === 'fast' && /service_tier|fast/i.test(`${error.stderr ?? ''}\n${error.stdout ?? ''}`)) {
      const downgraded = invocation.command.filter((part) => part !== '-c' && part !== 'service_tier="fast"');
      return run(downgraded);
    }
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      cwd: { type: 'string' },
      taskId: { type: 'string' },
      model: { type: 'string' },
      effort: { type: 'string' },
      serviceTier: { type: 'string' },
      schema: { type: 'string' },
      promptFile: { type: 'string' },
      base: { type: 'string' },
      commit: { type: 'string' },
      sessionId: { type: 'string' },
      dryRun: { type: 'boolean' }
    }
  });

  const mode = positionals[0];
  const runtime = await detectCodexRuntime();
  const savedState = mode === 'resume' && values.taskId && !values.sessionId
    ? await loadTaskState(values.cwd, values.taskId)
    : null;
  const invocation = buildInvocation({
    mode,
    cwd: values.cwd,
    taskId: values.taskId,
    model: values.model,
    effort: values.effort,
    serviceTier: values.serviceTier,
    authProvider: runtime.authProvider,
    schemaPath: values.schema,
    promptFile: values.promptFile,
    base: values.base,
    commit: values.commit,
    sessionId: values.sessionId ?? savedState?.sessionId,
    dryRun: values.dryRun
  });

  const result = await runInvocation(invocation);
  const threadId = extractThreadId(result.stdout);

  if (threadId && values.taskId) {
    await saveTaskState(values.cwd, values.taskId, {
      taskId: values.taskId,
      role: mode,
      phase: mode,
      cwd: values.cwd,
      sessionId: threadId
    });
  }

  process.stdout.write(result.stdout);
}
```

- [ ] **Step 4: Run the adapter test to verify it passes**

Run: `node --test tests/adapter/codex-run.test.mjs`
Expected: PASS with `4 tests` passing

- [ ] **Step 5: Smoke-test the adapter in dry-run mode**

Run: `node scripts/codex-run.mjs implement --cwd "$PWD" --taskId task-4 --model gpt-5.4 --effort medium --schema schemas/implementer-result.schema.json --promptFile tests/fixtures/codex/implement-prompt.md --dryRun`
Expected: JSON output that shows `codex exec`, `--json`, `--sandbox workspace-write`, and `--output-schema`

- [ ] **Step 6: Commit**

```bash
git add scripts/codex-run.mjs tests/adapter/codex-run.test.mjs tests/fixtures/codex/exec-events.jsonl tests/fixtures/codex/implement-prompt.md
git commit -m "feat: add codex adapter"
```

### Task 5: Fork Brainstorming And Writing-Plans

**Files:**
- Create: `skills/brainstorming/SKILL.md`
- Create: `skills/brainstorming/design-template.md`
- Create: `skills/brainstorming/prompts/research-brief.md`
- Create: `skills/writing-plans/SKILL.md`
- Create: `skills/writing-plans/plan-template.md`
- Create: `skills/writing-plans/prompts/planning-brief.md`
- Create: `agents/codex-brainstorm-researcher.md`
- Create: `agents/codex-plan-drafter.md`
- Create: `schemas/brainstorm-research.schema.json`
- Create: `schemas/plan-draft.schema.json`
- Test: `tests/prompt-contracts/brainstorming-and-planning.test.mjs`

- [ ] **Step 1: Write the failing prompt-contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

test('forked workflow entrypoints require explicit invocation', async () => {
  for (const relativePath of [
    'skills/brainstorming/SKILL.md',
    'skills/writing-plans/SKILL.md'
  ]) {
    const body = await read(relativePath);
    assert.match(body, /disable-model-invocation:\\s*true/);
    assert.match(body, /Upstream source: obra\\/superpowers/);
  }
});

test('brainstorm and plan agents are thin codex forwarders', async () => {
  const researchAgent = await read('agents/codex-brainstorm-researcher.md');
  const planAgent = await read('agents/codex-plan-drafter.md');
  assert.match(researchAgent, /node scripts\\/codex-run\\.mjs research/);
  assert.match(planAgent, /node scripts\\/codex-run\\.mjs plan/);
  assert.doesNotMatch(researchAgent, /git commit/);
  assert.doesNotMatch(planAgent, /git commit/);
});
```

- [ ] **Step 2: Run the prompt-contract test to verify it fails**

Run: `node --test tests/prompt-contracts/brainstorming-and-planning.test.mjs`
Expected: FAIL with `ENOENT` for `skills/brainstorming/SKILL.md`

- [ ] **Step 3: Add the forked brainstorming and writing-plans skills**

```md
<!-- skills/brainstorming/SKILL.md -->
<!--
Upstream source: obra/superpowers skills/brainstorming/SKILL.md
Last synced: 2026-04-02
Divergence: Codex-backed researcher agent, explicit invocation only, plugin-local prompt/template references
-->
---
name: brainstorming
description: Interview the user, inspect the repo, compare approaches, and write a design doc for the Codex-backed workflow fork. Use only when the user explicitly asks for the Codex-backed brainstorming workflow.
disable-model-invocation: true
---

# Brainstorming

Keep Claude in the main thread for user interaction and design judgment.
Use `codex-brainstorm-researcher` only for bounded repository research.
Write approved specs to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.
Use `design-template.md` for the written output shape.
Use `prompts/research-brief.md` when dispatching the researcher.
```

```md
<!-- skills/writing-plans/SKILL.md -->
<!--
Upstream source: obra/superpowers skills/writing-plans/SKILL.md
Last synced: 2026-04-02
Divergence: Codex-backed plan drafter, explicit invocation only, plugin-local prompt/template references
-->
---
name: writing-plans
description: Turn an approved design into an implementation plan for the Codex-backed workflow fork. Use only when the user explicitly asks for the Codex-backed writing-plans workflow.
disable-model-invocation: true
---

# Writing Plans

Claude remains the final editor of the plan.
Use `codex-plan-drafter` for the first-pass task breakdown only.
Save plans to `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`.
Use `plan-template.md` for the plan shape.
Use `prompts/planning-brief.md` when dispatching the plan drafter.
```

```md
<!-- skills/brainstorming/prompts/research-brief.md -->
# Codex Research Brief

Summarize:
- Current repository structure and relevant existing patterns
- Two or three implementation approaches with tradeoffs
- Risks, unknowns, and missing constraints

Return JSON matching `schemas/brainstorm-research.schema.json`.
```

```md
<!-- skills/writing-plans/prompts/planning-brief.md -->
# Codex Planning Brief

Transform the approved design into:
- exact files to create or modify
- task order
- test commands
- commit boundaries

Return JSON matching `schemas/plan-draft.schema.json`.
```

- [ ] **Step 4: Add the templates, agents, and two schema files**

```md
<!-- skills/brainstorming/design-template.md -->
# Design Title

## Goal
## Constraints
## Recommended Approach
## Alternatives Considered
## File/Component Impact
## Risks
## Validation Plan
```

```md
<!-- skills/writing-plans/plan-template.md -->
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** [one sentence]
**Architecture:** [2-3 sentences]
**Tech Stack:** [key technologies]
```

```md
<!-- agents/codex-brainstorm-researcher.md -->
---
name: codex-brainstorm-researcher
description: Thin forwarder for bounded repo research via Codex. Use when the brainstorming skill needs repo research or implementation approaches.
model: inherit
---

Forward exactly one bounded research task to Codex.
Run:
`node scripts/codex-run.mjs research --cwd "$PWD" --taskId brainstorm-research --model gpt-5.4-mini --effort low --schema schemas/brainstorm-research.schema.json --promptFile skills/brainstorming/prompts/research-brief.md`

Return only the structured summary needed by the controller.
```

```md
<!-- agents/codex-plan-drafter.md -->
---
name: codex-plan-drafter
description: Thin forwarder for first-pass implementation plan drafting via Codex.
model: inherit
---

Forward exactly one bounded planning task to Codex.
Run:
`node scripts/codex-run.mjs plan --cwd "$PWD" --taskId plan-draft --model gpt-5.4-mini --effort medium --schema schemas/plan-draft.schema.json --promptFile skills/writing-plans/prompts/planning-brief.md`

Return only the structured draft and noted risks.
```

```json
// schemas/brainstorm-research.schema.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["current_patterns", "approaches", "risks"],
  "properties": {
    "current_patterns": { "type": "array", "items": { "type": "string" } },
    "approaches": { "type": "array", "items": { "type": "string" } },
    "risks": { "type": "array", "items": { "type": "string" } }
  }
}
```

```json
// schemas/plan-draft.schema.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["files", "tasks", "test_commands", "commit_boundaries"],
  "properties": {
    "files": { "type": "array", "items": { "type": "string" } },
    "tasks": { "type": "array", "items": { "type": "string" } },
    "test_commands": { "type": "array", "items": { "type": "string" } },
    "commit_boundaries": { "type": "array", "items": { "type": "string" } }
  }
}
```

- [ ] **Step 5: Run the prompt-contract test to verify it passes**

Run: `node --test tests/prompt-contracts/brainstorming-and-planning.test.mjs`
Expected: PASS with `2 tests` passing

- [ ] **Step 6: Commit**

```bash
git add skills/brainstorming skills/writing-plans agents/codex-brainstorm-researcher.md agents/codex-plan-drafter.md schemas/brainstorm-research.schema.json schemas/plan-draft.schema.json tests/prompt-contracts/brainstorming-and-planning.test.mjs
git commit -m "feat: fork brainstorming and planning workflows"
```

### Task 6: Fork Subagent-Driven Development And Requesting-Code-Review

**Files:**
- Create: `skills/subagent-driven-development/SKILL.md`
- Create: `skills/subagent-driven-development/implementer-template.md`
- Create: `skills/subagent-driven-development/spec-review-template.md`
- Create: `skills/subagent-driven-development/code-review-template.md`
- Create: `skills/subagent-driven-development/prompts/implement-task.md`
- Create: `skills/subagent-driven-development/prompts/fix-task.md`
- Create: `skills/subagent-driven-development/prompts/final-review.md`
- Create: `skills/requesting-code-review/SKILL.md`
- Create: `skills/requesting-code-review/prompts/review-brief.md`
- Create: `agents/codex-implementer.md`
- Create: `agents/codex-reviewer.md`
- Test: `tests/prompt-contracts/execution-workflows.test.mjs`

- [ ] **Step 1: Write the failing execution-workflow contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

test('execution workflow preserves review order and explicit status handling', async () => {
  const skill = await read('skills/subagent-driven-development/SKILL.md');
  assert.match(skill, /spec compliance/i);
  assert.match(skill, /code quality/i);
  assert.match(skill, /DONE_WITH_CONCERNS/);
  assert.match(skill, /NEEDS_CONTEXT/);
});

test('implementer and reviewer agents forward to the adapter without doing git work themselves', async () => {
  const implementer = await read('agents/codex-implementer.md');
  const reviewer = await read('agents/codex-reviewer.md');
  assert.match(implementer, /node scripts\\/codex-run\\.mjs implement/);
  assert.match(reviewer, /node scripts\\/codex-run\\.mjs review/);
  assert.doesNotMatch(implementer, /git commit/);
  assert.doesNotMatch(reviewer, /git commit/);
});
```

- [ ] **Step 2: Run the execution-workflow contract test to verify it fails**

Run: `node --test tests/prompt-contracts/execution-workflows.test.mjs`
Expected: FAIL with `ENOENT` for `skills/subagent-driven-development/SKILL.md`

- [ ] **Step 3: Add the forked execution skills**

```md
<!-- skills/subagent-driven-development/SKILL.md -->
<!--
Upstream source: obra/superpowers skills/subagent-driven-development/SKILL.md
Last synced: 2026-04-02
Divergence: Codex-backed implementer/reviewer agents, adapter-managed resume flow, Claude-kept spec review
-->
---
name: subagent-driven-development
description: Execute an implementation plan by dispatching Codex-backed implementer and reviewer forwarders while Claude keeps spec-compliance control. Use only when the user explicitly asks for the Codex-backed execution workflow.
disable-model-invocation: true
---

# Subagent-Driven Development

Per task:
1. Dispatch `codex-implementer` with the full task text.
2. Handle `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`.
3. Run Claude-side spec compliance review using `spec-review-template.md`.
4. Resume the same Codex thread with `prompts/fix-task.md` when spec issues exist.
5. Dispatch `codex-reviewer` only after spec compliance passes.
6. Resume the same implementer thread if the reviewer finds material issues.
7. Commit only after both gates pass.
```

```md
<!-- skills/requesting-code-review/SKILL.md -->
<!--
Upstream source: obra/superpowers skills/requesting-code-review/SKILL.md
Last synced: 2026-04-02
Divergence: Codex-backed reviewer agent, adapter-managed review prompts, no upstream runtime dependency
-->
---
name: requesting-code-review
description: Request a high-signal Codex-backed review of a diff or task result. Use only when the user explicitly asks for the Codex-backed review workflow.
disable-model-invocation: true
---

# Requesting Code Review

Use `codex-reviewer` for diff review.
Use structured `codex exec` review when the controller needs machine-parseable output.
Use natural-language `codex review` only for advisory, ad-hoc review flows.
```

```md
<!-- skills/subagent-driven-development/prompts/implement-task.md -->
# Codex Implement Task

Implement exactly the provided task.
Return JSON matching `schemas/implementer-result.schema.json`.
Verify the task before finalizing.
```

```md
<!-- skills/subagent-driven-development/prompts/fix-task.md -->
# Codex Fix Task

Resume the previous Codex thread and fix only the listed issues.
Do not refactor unrelated code.
Verify each listed issue before finishing.
```

```md
<!-- skills/subagent-driven-development/prompts/final-review.md -->
# Codex Final Review

Review the full branch diff for material correctness, maintainability, and test gaps.
Flag only issues that should block merge or require deliberate follow-up.
```

- [ ] **Step 4: Add the templates and forwarder agents**

```md
<!-- skills/subagent-driven-development/implementer-template.md -->
## Task
[full task text]

## Context
[scene-setting context]

## Status Contract
Return one of: DONE, DONE_WITH_CONCERNS, BLOCKED, NEEDS_CONTEXT.
```

```md
<!-- skills/subagent-driven-development/spec-review-template.md -->
## Spec Review Contract

Read the actual code, not the implementer report.
Return JSON matching `schemas/spec-review.schema.json`.
Only emit `APPROVED` or `ISSUES_FOUND`.
```

```md
<!-- skills/subagent-driven-development/code-review-template.md -->
## Code Review Contract

Review the diff after spec compliance passes.
The adapter will append the authoritative diff scope for the requested base or commit selector.
Return JSON matching `schemas/code-review.schema.json`.
Focus on correctness, maintainability, testing, and clean boundaries.
```

```md
<!-- skills/requesting-code-review/prompts/review-brief.md -->
# Review Brief

Review the requested diff or task result.
Expect the adapter to append the actual diff scope for the requested base or commit selector.
Find material correctness or maintainability issues.
Avoid stylistic nits.
```

```md
<!-- agents/codex-implementer.md -->
---
name: codex-implementer
description: Thin forwarder for one implementation thread per task, including resume-based fix loops.
model: inherit
---

The controller must substitute a concrete value for `<TASK_ID>` before running these commands.

Initial task run:
`node scripts/codex-run.mjs implement --cwd "$PWD" --taskId <TASK_ID> --model gpt-5.4 --effort medium --schema schemas/implementer-result.schema.json --promptFile skills/subagent-driven-development/prompts/implement-task.md`

Fix loop:
`node scripts/codex-run.mjs resume --cwd "$PWD" --taskId <TASK_ID> --model gpt-5.4 --effort medium --promptFile skills/subagent-driven-development/prompts/fix-task.md`
```

```md
<!-- agents/codex-reviewer.md -->
---
name: codex-reviewer
description: Thin forwarder for bounded diff review. Use for controller-managed or ad-hoc review.
model: inherit
---

The controller must substitute concrete values for `<TASK_ID>` and either `<BASE_SHA>` or `<COMMIT_SHA>` before running these commands.

Structured review:
`node scripts/codex-run.mjs review --cwd "$PWD" --taskId <TASK_ID> --model gpt-5.4 --effort medium --base <BASE_SHA> --schema schemas/code-review.schema.json --promptFile skills/requesting-code-review/prompts/review-brief.md`

Advisory review:
`node scripts/codex-run.mjs review --cwd "$PWD" --taskId <TASK_ID> --base <BASE_SHA>`

Commit-scoped advisory review:
`node scripts/codex-run.mjs review --cwd "$PWD" --taskId <TASK_ID> --commit <COMMIT_SHA>`
```

- [ ] **Step 5: Run the execution-workflow contract test to verify it passes**

Run: `node --test tests/prompt-contracts/execution-workflows.test.mjs`
Expected: PASS with `2 tests` passing

- [ ] **Step 6: Commit**

```bash
git add skills/subagent-driven-development skills/requesting-code-review agents/codex-implementer.md agents/codex-reviewer.md tests/prompt-contracts/execution-workflows.test.mjs
git commit -m "feat: fork codex execution workflows"
```

### Task 7: Add Operator Docs, Doctor Command, And Release-Facing Guidance

**Files:**
- Create: `commands/doctor.md`
- Create: `scripts/doctor.mjs`
- Create: `README.md`
- Modify: `package.json`
- Create: `docs/architecture.md`
- Create: `docs/distribution.md`
- Create: `docs/upstream-sync.md`
- Create: `docs/prompts.md`
- Create: `references/codex-patterns/codex-cli-contract.md`
- Create: `LICENSE`
- Test: `tests/prompt-contracts/operator-docs.test.mjs`

- [ ] **Step 1: Write the failing operator-docs test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

test('doctor command points to the maintained preflight checks', async () => {
  const doctor = await read('commands/doctor.md');
  assert.match(doctor, /detect-codex\\.mjs/);
  assert.match(doctor, /check-codex-cli\\.mjs/);
  assert.match(doctor, /claude plugin validate/);
});

test('README documents direct GitHub installation and the four forked skills', async () => {
  const readme = await read('README.md');
  assert.match(readme, /claude plugin marketplace add/);
  assert.match(readme, /brainstorming/);
  assert.match(readme, /writing-plans/);
  assert.match(readme, /subagent-driven-development/);
  assert.match(readme, /requesting-code-review/);
});
```

- [ ] **Step 2: Run the operator-docs test to verify it fails**

Run: `node --test tests/prompt-contracts/operator-docs.test.mjs`
Expected: FAIL with `ENOENT` for `commands/doctor.md`

- [ ] **Step 3: Write the doctor script, update `package.json`, and add the command doc**

```js
// scripts/doctor.mjs
import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { detectCodexRuntime } from './detect-codex.mjs';

const execFileAsync = promisify(execFile);

async function assertWritableStateDir(root) {
  const dir = join(root, '.claude', 'state', 'codex');
  const probe = join(dir, '.doctor-write-test');
  await mkdir(dir, { recursive: true });
  await writeFile(probe, 'ok\n', 'utf8');
  await rm(probe);
}

async function assertCommand(name, args) {
  await execFileAsync(name, args);
}

const runtime = await detectCodexRuntime();
if (!runtime.installed) {
  throw new Error(runtime.loginStatus);
}
if (!runtime.authenticated) {
  throw new Error(`Codex is not authenticated: ${runtime.loginStatus}`);
}
const fastModeAvailable = runtime.authProvider === 'chatgpt';

await assertCommand('git', ['--version']);
await assertCommand('node', ['--version']);
await assertWritableStateDir(process.cwd());
await assertCommand('node', ['scripts/check-codex-cli.mjs']);
await assertCommand('claude', ['plugin', 'validate', '.']);

console.log(JSON.stringify({
  ok: true,
  codexVersion: runtime.version,
  authProvider: runtime.authProvider,
  fastModeAvailable
}, null, 2));
```

```json
// package.json
{
  "name": "superpowers-codex-fork",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "description": "Standalone Claude Code plugin that forks selected superpowers workflows for Codex-backed execution.",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "test": "node --test",
    "validate:plugin": "claude plugin validate .",
    "doctor": "node scripts/doctor.mjs",
    "check:upstream": "node scripts/check-upstream-superpowers.mjs"
  }
}
```

````md
<!-- commands/doctor.md -->
---
description: Validate that the Codex-backed workflow fork is installed correctly and the required CLIs are ready.
---

Run these checks in order:

~~~bash
npm run doctor
~~~

The command must verify:
- Codex is installed and authenticated
- The installed Codex CLI satisfies the minimum contract
- `git` and `node` are available
- Plugin manifests validate cleanly
- The current workspace is suitable for adapter-managed state under `.claude/state/codex/`
````

- [ ] **Step 4: Add the architecture/docs set and the MIT license**

````md
<!-- README.md -->
# Superpowers Codex Fork

Standalone Claude Code plugin that forks four `superpowers` workflows and delegates bounded work to the public `codex` CLI.

## Install

~~~bash
claude plugin marketplace add mzored/superpowers-codex-fork
claude plugin install superpowers-codex-fork@superpowers-codex-fork
~~~

## Included workflows

- `superpowers-codex-fork:brainstorming`
- `superpowers-codex-fork:writing-plans`
- `superpowers-codex-fork:subagent-driven-development`
- `superpowers-codex-fork:requesting-code-review`

## Prerequisites

- `claude` CLI installed
- `codex` CLI installed and logged in
- Node.js 22+
````

```md
<!-- docs/architecture.md -->
# Architecture

- Claude remains the controller and spec-review owner.
- Codex-backed forwarders handle research, first-pass planning, implementation, and diff review.
- `scripts/codex-run.mjs` is the only place that knows how to invoke the Codex CLI.
- There is no runtime dependency on `codex-plugin-cc`; only the public `codex` CLI is required.
- Task session state lives under `.claude/state/codex/` so plugin updates do not destroy resume metadata.
```

```md
<!-- docs/distribution.md -->
# Distribution

- The GitHub repository is both the source repository and the marketplace source.
- Keep `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` in the same repo.
- Validate from the repository root with `claude plugin validate .`.
```

```md
<!-- docs/upstream-sync.md -->
# Upstream Sync

- Fork surface is limited to four workflow skills and their prompt assets.
- Every forked `SKILL.md` starts with an upstream header comment.
- Run `npm run check:upstream` before releases and when syncing from `obra/superpowers`.
```

```md
<!-- docs/prompts.md -->
# Prompt Inventory

- `skills/brainstorming/prompts/research-brief.md`
- `skills/writing-plans/prompts/planning-brief.md`
- `skills/subagent-driven-development/prompts/implement-task.md`
- `skills/subagent-driven-development/prompts/fix-task.md`
- `skills/subagent-driven-development/prompts/final-review.md`
- `skills/requesting-code-review/prompts/review-brief.md`
```

```md
<!-- references/codex-patterns/codex-cli-contract.md -->
# Codex CLI Contract Notes

- Minimum supported version: `0.111.0`
- Required commands: `codex exec`, `codex exec resume`, `codex review`
- Required flags: `--sandbox`, `--output-schema`, `--json`, `--base`, `--commit`
- Session tracking in the adapter parses `thread.started.thread_id` from `codex exec --json` output
- Structured controller-managed review uses `codex exec` with `--output-schema`
- Advisory review uses top-level `codex review`, which currently exposes diff selectors but not an explicit model flag
- Requested Fast mode is honored only for ChatGPT-backed auth; if the CLI rejects the fast tier, the adapter retries once without `service_tier`
```

```text
// LICENSE
MIT License

Copyright (c) 2026 mzored

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 5: Run the operator-docs test and the doctor preflight**

Run: `node --test tests/prompt-contracts/operator-docs.test.mjs`
Expected: PASS with `2 tests` passing

Run: `npm run doctor`
Expected: JSON output with `"ok": true`, plus successful Codex and plugin validation checks

- [ ] **Step 6: Commit**

```bash
git add scripts/doctor.mjs package.json commands/doctor.md README.md docs/architecture.md docs/distribution.md docs/upstream-sync.md docs/prompts.md references/codex-patterns/codex-cli-contract.md LICENSE tests/prompt-contracts/operator-docs.test.mjs
git commit -m "docs: add operator guidance"
```

### Task 8: Add Upstream Drift Checks And CI Validation

**Files:**
- Create: `scripts/check-upstream-superpowers.mjs`
- Create: `references/upstream-superpowers/manifest.json`
- Create: `.github/workflows/validate.yml`
- Create: `tests/adapter/upstream-drift.test.mjs`
- Create: `tests/fixtures/upstream-superpowers/skills/brainstorming/SKILL.md`
- Create: `tests/fixtures/upstream-superpowers/skills/writing-plans/SKILL.md`
- Create: `tests/fixtures/upstream-superpowers/skills/subagent-driven-development/SKILL.md`
- Create: `tests/fixtures/upstream-superpowers/skills/requesting-code-review/SKILL.md`

- [ ] **Step 1: Write the failing drift-check test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { compareForkToUpstream } from '../../scripts/check-upstream-superpowers.mjs';

test('compareForkToUpstream reports drift against the upstream fixture', async () => {
  const report = await compareForkToUpstream({
    forkPath: 'skills/brainstorming/SKILL.md',
    upstreamPath: 'skills/brainstorming/SKILL.md',
    sourceDir: 'tests/fixtures/upstream-superpowers'
  });

  assert.equal(report.source, 'obra/superpowers skills/brainstorming/SKILL.md');
  assert.equal(report.status, 'drifted');
});
```

- [ ] **Step 2: Run the drift-check test to verify it fails**

Run: `node --test tests/adapter/upstream-drift.test.mjs`
Expected: FAIL with `Cannot find module '../../scripts/check-upstream-superpowers.mjs'`

- [ ] **Step 3: Implement the drift checker, manifest, and fixtures**

```text
# tests/fixtures/upstream-superpowers/skills/brainstorming/SKILL.md
---
name: brainstorming
description: Upstream fixture
---
```

```text
# tests/fixtures/upstream-superpowers/skills/writing-plans/SKILL.md
---
name: writing-plans
description: Upstream fixture
---
```

```text
# tests/fixtures/upstream-superpowers/skills/subagent-driven-development/SKILL.md
---
name: subagent-driven-development
description: Upstream fixture
---
```

```text
# tests/fixtures/upstream-superpowers/skills/requesting-code-review/SKILL.md
---
name: requesting-code-review
description: Upstream fixture
---
```

```json
// references/upstream-superpowers/manifest.json
{
  "repo": "obra/superpowers",
  "ref": "main",
  "skills": [
    { "forkPath": "skills/brainstorming/SKILL.md", "upstreamPath": "skills/brainstorming/SKILL.md" },
    { "forkPath": "skills/writing-plans/SKILL.md", "upstreamPath": "skills/writing-plans/SKILL.md" },
    { "forkPath": "skills/subagent-driven-development/SKILL.md", "upstreamPath": "skills/subagent-driven-development/SKILL.md" },
    { "forkPath": "skills/requesting-code-review/SKILL.md", "upstreamPath": "skills/requesting-code-review/SKILL.md" }
  ]
}
```

```js
// scripts/check-upstream-superpowers.mjs
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

export async function detectUpstreamMetadata(relativePath) {
  const body = await readFile(relativePath, 'utf8');
  const source = body.match(/Upstream source:\\s*(.+)/)?.[1];
  const lastSynced = body.match(/Last synced:\\s*(.+)/)?.[1];
  if (!source || !lastSynced) {
    throw new Error(`Missing upstream metadata in ${relativePath}`);
  }
  return { source, lastSynced };
}

function normalizeSkillBody(body) {
  return body
    .replace(/<!--[\\s\\S]*?-->/, '')
    .trim()
    .replace(/\\s+/g, ' ');
}

async function loadUpstreamBody(upstreamPath, sourceDir) {
  if (sourceDir) {
    return readFile(join(sourceDir, upstreamPath), 'utf8');
  }

  const url = `https://raw.githubusercontent.com/obra/superpowers/main/${upstreamPath}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
}

export async function compareForkToUpstream({ forkPath, upstreamPath, sourceDir }) {
  const [forkBody, upstreamBody, metadata] = await Promise.all([
    readFile(forkPath, 'utf8'),
    loadUpstreamBody(upstreamPath, sourceDir),
    detectUpstreamMetadata(forkPath)
  ]);

  return {
    forkPath,
    upstreamPath,
    source: metadata.source,
    lastSynced: metadata.lastSynced,
    status: normalizeSkillBody(forkBody) === normalizeSkillBody(upstreamBody) ? 'in_sync' : 'drifted'
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      sourceDir: { type: 'string' }
    }
  });

  const manifest = JSON.parse(await readFile('references/upstream-superpowers/manifest.json', 'utf8'));
  const reports = [];

  for (const entry of manifest.skills) {
    reports.push(await compareForkToUpstream({
      forkPath: entry.forkPath,
      upstreamPath: entry.upstreamPath,
      sourceDir: values.sourceDir
    }));
  }

  const drifted = reports.filter((report) => report.status === 'drifted').length;
  console.log(JSON.stringify({ checked: reports.length, drifted, reports }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
```

- [ ] **Step 4: Add CI validation**

```yaml
# .github/workflows/validate.yml
name: validate

on:
  pull_request:
  push:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install -g @anthropic-ai/claude-code
      - run: npm test
      - run: node scripts/check-upstream-superpowers.mjs
      - run: claude plugin validate .
```

- [ ] **Step 5: Run the drift-check test and the full local validation**

Run: `node --test tests/adapter/upstream-drift.test.mjs`
Expected: PASS with `1 test` passing

Run: `npm test`
Expected: PASS with adapter and prompt-contract suites passing

Run: `node scripts/check-upstream-superpowers.mjs --sourceDir tests/fixtures/upstream-superpowers`
Expected: JSON output listing the four forked skills with `status` fields, and at least the forked workflow skills should report `drifted`

- [ ] **Step 6: Commit**

```bash
git add scripts/check-upstream-superpowers.mjs references/upstream-superpowers/manifest.json .github/workflows/validate.yml tests/adapter/upstream-drift.test.mjs tests/fixtures/upstream-superpowers/skills/brainstorming/SKILL.md tests/fixtures/upstream-superpowers/skills/writing-plans/SKILL.md tests/fixtures/upstream-superpowers/skills/subagent-driven-development/SKILL.md tests/fixtures/upstream-superpowers/skills/requesting-code-review/SKILL.md
git commit -m "chore: add drift checks and ci validation"
```

## Self-Review

### Spec Coverage

- Standalone plugin and direct GitHub installation: covered by Task 1 and Task 7 via `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, README, and distribution docs.
- Fork only four workflows: covered by Task 5 and Task 6; no unrelated skill forks are planned.
- Thin Codex adapter around public CLI: covered by Task 2, Task 3, and Task 4.
- Session tracking outside plugin cache: covered by Task 3 and Task 4 via `.claude/state/codex/`.
- Output schemas for research, planning, implementation, spec review, and code review: covered by Task 3, Task 5, and Task 6.
- Explicit routing and `disable-model-invocation: true`: covered by Task 5 and Task 6 prompt-contract tests.
- Doctor/preflight command: covered by Task 7.
- Upstream sync/drift management: covered by Task 8 and `docs/upstream-sync.md`.
- Validation workflow and repeatable tests: covered by Task 1, Task 2, Task 4, Task 7, and Task 8.

### Placeholder Scan

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Every task includes exact file paths, concrete commands, and code/doc snippets.
- No step references undefined status names or undefined schema files.

### Type Consistency

- Runtime statuses are consistent across the plan: `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, `NEEDS_CONTEXT`.
- Review status names are consistent: `APPROVED`, `ISSUES_FOUND`, `approved`, `with_fixes`, `blocked`.
- Adapter state directory is consistently `.claude/state/codex/`.
- Plugin name is consistently `superpowers-codex-fork`.
