import fs from 'fs';

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
