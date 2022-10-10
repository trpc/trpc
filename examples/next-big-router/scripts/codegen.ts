import fs from 'fs';

// Modify this is if you want to try bigger routers
// Each router will have 5 procedures + a small sub-router with 2 procedures
const NUM_ROUTERS = 100;

const ROUTERS_DIR = __dirname + '/../src/server/routers';
if (fs.existsSync(ROUTERS_DIR)) {
  fs.rmSync(ROUTERS_DIR, { recursive: true });
}

fs.mkdirSync(ROUTERS_DIR, { recursive: true });

function router(routerName: string) {
  return `
  import { z } from 'zod';
  import { t } from '~/server/trpc';
  
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
      childRouter: t.router({
        hello: t.procedure.query(() => 'there'),
        doSomething: t.procedure.mutation(() => 'okay'),
      })
  })`.trim();
}

const indexBuf: string[] = [];
for (let i = 0; i < NUM_ROUTERS; i++) {
  const routerName = `router${i}`;
  indexBuf.push(routerName);
  fs.writeFileSync(`${ROUTERS_DIR}/${routerName}.ts`, router(routerName));
}

const trpcFile = `
import { initTRPC } from '@trpc/server';

export const t = initTRPC.create();
`.trim();
const indexFile = `
import { t } from '~/server/trpc';

${indexBuf.map((name) => `import { ${name} } from './${name}';`).join('\n')}

export const appRouter = t.router({
  ${indexBuf.join(',\n    ')}
})

// export only the type definition of the API
// None of the actual implementation is exposed to the client
export type AppRouter = typeof appRouter;
`.trim();

fs.writeFileSync(`${ROUTERS_DIR}/_app.ts`, indexFile);
