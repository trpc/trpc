import fs from 'fs';

const NUM_PROCEDURE_OBJECTS = 500;

function createProcedureObject(procedureObjectName: string) {
  return `
  import { z } from 'zod';
  import { t } from './_trpc';
  
  export const ${procedureObjectName} = t.router({
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
for (let i = 0; i < NUM_PROCEDURE_OBJECTS; i++) {
  const procedureObjectName = `r${i}`;
  indexBuf.push(procedureObjectName);
  fs.writeFileSync(
    `${SERVER_DIR}/${procedureObjectName}.ts`,
    createProcedureObject(procedureObjectName),
  );
}

const trpcFile = `
import { initTRPC } from '../../../src';

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
