import fs from 'fs';
import path from 'path';

const NUM_ROUTERS = 500;

function createRouter(routerName: string) {
  return `
  import { z } from 'zod';
  import { t } from './_trpc';
  
  export const ${routerName} = t.router({
    greeting: t
      .procedure
      .input(
        z.object({
          who: z.string()
        })
      )
      .query(({input}) => \`hello \${input.who}\`),
    greeting2: t
      .procedure
      .input(
        z.object({
          who: z.string()
        })
      )
      .query(({input}) => \`hello \${input.who}\`),
      greeting3: t
        .procedure
        .input(
          z.object({
            who: z.string()
          })
        )
        .query(({input}) => \`hello \${input.who}\`),
      greeting4: t
        .procedure
        .input(
          z.object({
            who: z.string()
          })
        )
        .query(({input}) => \`hello \${input.who}\`),
      greeting5: t
        .procedure
        .input(
          z.object({
            who: z.string()
          })
        )
        .query(({input}) => \`hello \${input.who}\`),
      grandchild: t.router({
        grandChildQuery: t.procedure.query(() => 'grandChildQuery'),
        grandChildMutation: t.procedure.mutation(() => 'grandChildMutation'),
      })
  })`.trim();
}

const SERVER_DIR = __dirname + '/../packages/server/test/__generated__/bigBoi';
fs.mkdirSync(SERVER_DIR, { recursive: true });

const indexBuf: string[] = [];
for (let i = 0; i < NUM_ROUTERS; i++) {
  const routerName = `r${i}`;
  indexBuf.push(routerName);
  fs.writeFileSync(`${SERVER_DIR}/${routerName}.ts`, createRouter(routerName));
}

const trpcFile = `
import { initTRPC } from '@trpc/server';

export const t = initTRPC.create();
`.trim();
const indexFile = `
import { t } from './_trpc';

${indexBuf.map((name) => `import { ${name} } from './${name}';`).join('\n')}

export const appRouter = t.router({
  ${indexBuf.join(',\n    ')}
})

`.trim();

fs.writeFileSync(`${SERVER_DIR}/_app.ts`, indexFile);
fs.writeFileSync(`${SERVER_DIR}/_trpc.ts`, trpcFile);

// cleanup
const EXAMPLE_PERF_DIR =
  __dirname + '/../examples/.perf/next-big/src/__generated__';

function copyFolderSync(from: string, to: string) {
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from).forEach((element) => {
    if (fs.lstatSync(path.join(from, element)).isFile()) {
      fs.copyFileSync(path.join(from, element), path.join(to, element));
    } else {
      copyFolderSync(path.join(from, element), path.join(to, element));
    }
  });
}

if (fs.existsSync(EXAMPLE_PERF_DIR)) {
  fs.rmdirSync(EXAMPLE_PERF_DIR, { recursive: true });
}

fs.mkdirSync(EXAMPLE_PERF_DIR, { recursive: true });
copyFolderSync(SERVER_DIR, EXAMPLE_PERF_DIR);
