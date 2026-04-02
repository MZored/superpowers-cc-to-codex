import { runCommand } from './run-command.mjs';

export async function buildStructuredReviewPrompt({ cwd, promptBody = '', base, commit }) {
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

  throw new Error('Structured review requires --base or --commit.');
}
