import fs from 'fs';
import path from 'path';

const NUM_PROCEDURES_TO_GENERATE = 200;

const TEST_DIR =
  __dirname + '/../packages/tests/server/__generated__/bigLegacyRouter';

// Big F̶u̶c̶ Fantastic Router
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

fs.mkdirSync(TEST_DIR, { recursive: true });
fs.writeFileSync(path.join(TEST_DIR, 'bigRouter.ts'), contents);
