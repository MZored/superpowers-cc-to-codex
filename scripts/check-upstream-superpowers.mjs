import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

export async function detectUpstreamMetadata(relativePath) {
  const body = await readFile(relativePath, 'utf8');
  const source = body.match(/Upstream source:\s*(.+)/)?.[1];
  const lastSynced = body.match(/Last synced:\s*(.+)/)?.[1];

  if (!source || !lastSynced) {
    throw new Error(`Missing upstream metadata in ${relativePath}`);
  }

  return { source, lastSynced };
}

function normalizeSkillBody(body) {
  return body.replace(/<!--[\s\S]*?-->/, '').trim().replace(/\s+/g, ' ');
}

async function loadUpstreamBody(upstreamPath, sourceDir) {
  if (sourceDir) {
    return readFile(join(sourceDir, upstreamPath), 'utf8');
  }

  const url = `https://raw.githubusercontent.com/obra/superpowers/main/${upstreamPath}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

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
    reports.push(
      await compareForkToUpstream({
        forkPath: entry.forkPath,
        upstreamPath: entry.upstreamPath,
        sourceDir: values.sourceDir
      })
    );
  }

  const drifted = reports.filter((report) => report.status === 'drifted').length;
  console.log(JSON.stringify({ checked: reports.length, drifted, reports }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
