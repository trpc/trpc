import fs from 'fs';
import path from 'path';
// Big F̶u̶c̶ Fantastic Router
function getBFR() {
  const str = [`trpc.router()`];
  for (let num = 1; num <= 550; num++) {
    str.push(`.query('${num}', { resolve() { return '${num}' as const; } })`);
    // str.push(
    //   `.mutation('${index}', { resolve() { return '${index}' as const; } })`,
    // );
  }
  return str.join('\n  ');
}

const contents = `
/* eslint-disable */
import * as trpc from '../../src';

export const bigRouter = ${getBFR()}
`.trim();

const dir = path.join(
  __dirname,
  '..',
  'packages',
  'server',
  'test',
  '__generated__',
);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'bigRouter.ts'), contents);
