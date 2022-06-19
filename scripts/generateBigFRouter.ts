import fs from 'fs';

const NUM_ROUTERS = 20;
const NUM_PROCEDURES_PER_ROUTER = 100;

const TRPC_FILE = `
import { initTRPC } from '../../src';

export const t = initTRPC()();
`.trim();

const INDEX = `
import { t } from './_trpc';

__IMPORTS__

export const appRouter = t.mergeRouters(
  __CONTENT__
);

`.trim();

const ROUTER = `
import { t } from './_trpc';
import { z } from 'zod';

export const __ROUTER_NAME__ = t.router({
  queries: {
    __CONTENT__
  }
});

`.trim();

const SERVER_DIR = __dirname + '/../packages/server/test/__generated__';

fs.mkdirSync(SERVER_DIR, { recursive: true });

// first cleanup all routers
const files = fs.readdirSync(SERVER_DIR);
for (const file of files) {
  if (file.endsWith('.ts')) {
    fs.rmSync(SERVER_DIR + '/' + file);
  }
}

for (let routerIndex = 0; routerIndex < NUM_ROUTERS; routerIndex++) {
  // generate router files
  const routerFile = [];
  for (let procIndex = 0; procIndex < NUM_PROCEDURES_PER_ROUTER; procIndex++) {
    // generate procedures in each file
    routerFile.push(
      '\n' +
        `
  r${routerIndex}q${procIndex}: t.procedure
    .input(
      z.object({
        who: z.string(),
      })
    )
    .resolve((params) => {
      return 'hello ' + params.input.who;
    }),
`.trim(),
    );
  }
  // write router file
  const contents = ROUTER.replace('__CONTENT__', routerFile.join('\n'))
    .replace('__IMPORTS__', '')
    .replace('__ROUTER_NAME__', `router${routerIndex}`);
  fs.writeFileSync(SERVER_DIR + `/router${routerIndex}.ts`, contents);
}
// write `_app.ts` index file that combines all the routers
const imports = new Array(NUM_ROUTERS)
  .fill('')
  .map((_, index) => `import { router${index} } from './router${index}';`)
  .join('\n');
const content = new Array(NUM_ROUTERS)
  .fill('')
  .map((_, index) => `router${index},`)
  .join('\n');

const indexFile = INDEX.replace('__IMPORTS__', imports).replace(
  '__CONTENT__',
  content,
);

fs.writeFileSync(SERVER_DIR + '/_trpc.ts', TRPC_FILE);
fs.writeFileSync(SERVER_DIR + '/_app.ts', indexFile);
