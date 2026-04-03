import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

test('plan template points at the local fork workflow names', async () => {
  const template = await read('skills/writing-plans/plan-template.md');
  assert.match(template, /superpowers-cc-to-codex:subagent-driven-development/);
  assert.doesNotMatch(template, /superpowers:executing-plans/);
});

test('prompt inventory lists only live prompt files', async () => {
  const prompts = await read('docs/prompts.md');
  assert.doesNotMatch(prompts, /final-review\.md/);
});
