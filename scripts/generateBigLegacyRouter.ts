import fs from 'fs';
import path from 'path';

const NUM_PROCEDURES_TO_GENERATE = 200;

// Fix Directory Traversal Vulnerability by using path.join to join the directories
const TEST_DIR = path.join(__dirname, '..', 'packages', 'tests', 'server', '__generated__', 'bigLegacyRouter');

// Big Fantastic Router
function getBFR() {
  const str = [`trpc.router()`];
  for (let num = 1; num <= NUM_PROCEDURES_TO_GENERATE; num++) {
    str.push(
      `.query('oldProc${num}', { resolve() { return '${num}' as const; } })`,
    );
  }
  return str.join('\n  ');
}

const contents = `
/* eslint-disable */
import * as trpc from '@trpc/server';
export const bigRouter = ${getBFR()}
  .flat();
`.trim();

// Ensure that the directory exists before trying to write to it
if (!fs.existsSync(TEST_DIR)) {
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

fs.writeFileSync(path.join(TEST_DIR, 'bigRouter.ts'), contents);
