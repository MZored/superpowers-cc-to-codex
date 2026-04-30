import { runCommand } from './run-command.mjs';

function section(title, body) {
  return [title, body?.trim() ? body.trim() : '(none)'].join('\n');
}

export async function buildStructuredReviewPrompt({ cwd, promptBody = '', base, commit, uncommitted = false }) {
  if (base) {
    const [stat, diff] = await Promise.all([
      runCommand('git', ['diff', '--stat', `${base}..HEAD`], { cwd }),
      runCommand('git', ['diff', `${base}..HEAD`], { cwd })
    ]);

    return [
      promptBody,
      '',
      '## Diff Scope',
      `Base: ${base}`,
      '',
      '### git diff --stat',
      stat.stdout.trim(),
      '',
      '### git diff',
      diff.stdout.trim()
    ].join('\n');
  }

  if (commit) {
    const commitView = await runCommand(
      'git',
      ['show', '--stat', '--patch', '--format=medium', commit],
      { cwd }
    );

    return [
      promptBody,
      '',
      '## Diff Scope',
      `Commit: ${commit}`,
      '',
      '### git show --stat --patch --format=medium',
      commitView.stdout.trim()
    ].join('\n');
  }

  if (uncommitted) {
    const [status, stagedStat, stagedDiff, unstagedStat, unstagedDiff, untracked] = await Promise.all([
      runCommand('git', ['status', '--short'], { cwd }),
      runCommand('git', ['diff', '--cached', '--stat'], { cwd }),
      runCommand('git', ['diff', '--cached'], { cwd }),
      runCommand('git', ['diff', '--stat'], { cwd }),
      runCommand('git', ['diff'], { cwd }),
      runCommand('git', ['ls-files', '--others', '--exclude-standard'], { cwd })
    ]);

    const untrackedBody = untracked.stdout.trim()
      ? `${untracked.stdout.trim()}\n\nInspect listed untracked paths directly in the repository if needed.`
      : '(no untracked files)';

    return [
      promptBody,
      '',
      '## Diff Scope',
      'Scope: uncommitted worktree changes',
      '',
      section('### git status --short', status.stdout),
      '',
      section('### git diff --cached --stat', stagedStat.stdout),
      '',
      section('### git diff --cached', stagedDiff.stdout),
      '',
      section('### git diff --stat', unstagedStat.stdout),
      '',
      section('### git diff', unstagedDiff.stdout),
      '',
      section('### Untracked Files', untrackedBody)
    ].join('\n');
  }

  throw new Error('Structured review requires --base, --commit, or --uncommitted.');
}
