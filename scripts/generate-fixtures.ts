import fs from 'fs';
import path from 'path';
function getBigRouter() {
  const str = [`trpc.router()`];
  for (let num = 1; num <= 40; num++) {
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

export const bigRouter = ${getBigRouter()}
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
