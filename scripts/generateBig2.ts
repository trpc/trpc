import fs from 'fs';

const NUM_ROUTERS = 2_000;

function createRouter(routerName: string) {
  return `
  import {createRouter, createProcedure} from '../../wippy'
  
  
  export const ${routerName} = createRouter({
    procedures: {
      childFoo: createProcedure('query', () => 'childFoo' as const),
    },
    children: {
      grandchild: createRouter({
        procedures: {
          grandChildFoo: createProcedure(
            'query',
            () => 'grandChildFoo' as const,
          ),
          grandChildMut: createProcedure(
            'mutation',
            () => 'grandChildFoo' as const,
          ),
        },
      }),
    },
  })`.trim();
}

const SERVER_DIR = __dirname + '/../packages/server/test/__generated__/bigBoi2';
fs.mkdirSync(SERVER_DIR, { recursive: true });

const indexBuf: string[] = [];
for (let i = 0; i < NUM_ROUTERS; i++) {
  const routerName = `r${i}`;
  indexBuf.push(routerName);
  fs.writeFileSync(`${SERVER_DIR}/${routerName}.ts`, createRouter(routerName));
}

const indexFile = `
import {createRouter} from '../../wippy';

${indexBuf.map((name) => `import {${name}} from './${name}';`).join('\n')}

export const appRouter = createRouter({
  children: {
    ${indexBuf.join(',\n')}
  }
})

`.trim();

fs.writeFileSync(`${SERVER_DIR}/_app.ts`, indexFile);
