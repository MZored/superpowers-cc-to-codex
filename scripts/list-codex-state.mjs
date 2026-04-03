import { parseArgs } from 'node:util';
import { listTaskStates } from './lib/codex-state.mjs';

const { values } = parseArgs({
  options: {
    cwd: { type: 'string' }
  }
});

const cwd = values.cwd ?? process.cwd();
const tasks = await listTaskStates(cwd);
console.log(JSON.stringify({ cwd, tasks }, null, 2));
