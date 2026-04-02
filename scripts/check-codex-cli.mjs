import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const MINIMUM_CODEX_VERSION = '0.111.0';

export function parseCodexVersion(versionText) {
  const match = versionText.match(/codex-cli\s+(\d+\.\d+\.\d+)/);
  if (!match) {
    throw new Error(`Could not parse Codex version from: ${versionText}`);
  }

  const version = match[1];
  if (compareVersions(version, MINIMUM_CODEX_VERSION) < 0) {
    throw new Error(`minimum supported Codex CLI version is ${MINIMUM_CODEX_VERSION}`);
  }

  return version;
}

export function verifyCodexCliContract({ versionText, execHelp, resumeHelp, reviewHelp }) {
  const version = parseCodexVersion(versionText);
  const requiredChecks = [
    ['exec help exposes resume subcommand', /resume\s+Resume a previous session/i.test(execHelp)],
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

  for (let index = 0; index < Math.max(lhs.length, rhs.length); index += 1) {
    const diff = (lhs[index] ?? 0) - (rhs[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
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
