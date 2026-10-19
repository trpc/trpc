import fs from 'fs';

// Modify this is if you want to try bigger routers
// Each router will have 5 procedures + a small sub-router with 2 procedures
const NUM_ROUTERS = 100;

const ROUTERS_DIR = __dirname + '/../src/server/routers';
if (fs.existsSync(ROUTERS_DIR)) {
  fs.rmSync(ROUTERS_DIR, { recursive: true });
}

fs.mkdirSync(ROUTERS_DIR, { recursive: true });

// read file codege-base.ts in the same dir as this script
const codegenBase = fs.readFileSync(__dirname + '/codegen-base.ts', 'utf-8');

function createRouter(routerName: string) {
  return codegenBase.replace('__ROUTER__NAME__', routerName);
}

const indexBuf: string[] = [];
for (let i = 0; i < NUM_ROUTERS; i++) {
  const routerName = `router${i}`;
  indexBuf.push(routerName);
  fs.writeFileSync(`${ROUTERS_DIR}/${routerName}.ts`, createRouter(routerName));
}

const indexFile = `
import { router } from '~/server/trpc';

${indexBuf.map((name) => `import { ${name} } from './${name}';`).join('\n')}

export const appRouter = router({
  ${indexBuf.join(',\n    ')}
})

// export only the type definition of the API
// None of the actual implementation is exposed to the client
export type AppRouter = typeof appRouter;
`.trim();

fs.writeFileSync(`${ROUTERS_DIR}/_app.ts`, indexFile);
