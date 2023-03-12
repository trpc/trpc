import { Nodebox } from '@codesandbox/nodebox';
import {
  Sandpack,
  SandpackCodeEditor,
  SandpackConsole,
  SandpackFileExplorer,
  SandpackLayout,
  SandpackPreview,
  SandpackProvider,
} from '@codesandbox/sandpack-react';
import React, { useEffect, useRef, useState } from 'react';

const BACKEND_FILES = {
  '/package.json': {
    code: JSON.stringify({
      scripts: { start: 'node index.ts' },
      main: 'index.ts',
    }),
  },
  'index.ts': `
console.log("Starting trpc...")
import "./trpc.ts"
console.log("Imported trpc")
  `.trim(),
  'appRouter.ts': `console.log('It\'s dead')`,
  'trpc.ts': `
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

const router = t.router;
const publicProcedure = t.procedure;

interface User {
  id: string;
  name: string;
}

const userList: User[] = [
  {
    id: '1',
    name: 'KATT',
  },
];

const appRouter = router({
  userById: publicProcedure
    .input((val: unknown) => {
      if (typeof val === 'string') return val;
      throw new Error(\`Invalid input: \${typeof val}\`);
    })
    .query((req) => {
      const input = req.input;
      const user = userList.find((it) => it.id === input);

      return user;
    }),
  userCreate: publicProcedure
    .input(z.object({ name: z.string() }))
    .mutation((req) => {
      const id = \`\${Math.random()}\`;

      const user: User = {
        id,
        name: req.input.name,
      };

      userList.push(user);

      return user;
    }),
});

export type AppRouter = typeof appRouter;
  `.trim(),
};

const FRONTEND_FILES = {
  'index.tsx': `
import React from 'react';
import ReactDOM from 'react-dom/client';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
)

root.render(
  <React.StrictMode>
    <div>The Client is rendering!</div>
  </React.StrictMode>,
);
  `.trim(),
};

export function SandpackRoot() {
  const ref = useRef<HTMLIFrameElement>();
  // const [_loaded, setLoaded] = useState(false);

  // Probably don't need this stuff if the abstractions can do it
  // useEffect(() => {
  //   async function boot() {
  //     const el = ref.current;
  //     if (!el) {
  //       return;
  //     }

  //     const emulator = new Nodebox({
  //       iframe: el,
  //     });

  //     await emulator.connect();

  //     await emulator.fs.init(BACKEND_FILES);

  //     const shell = emulator.shell.create();

  //     await shell.runCommand('node', ['index.js']);
  //   }

  //   boot()
  //     .then(() => setLoaded(true))
  //     .catch((err) => {
  //       // TODO: handle this
  //       console.error(err);
  //     });
  // }, []);

  return (
    <>
      <iframe ref={ref as any} hidden />

      {/* Run a backend */}
      <SandpackProvider
        files={BACKEND_FILES}
        theme="dark"
        customSetup={{
          dependencies: {
            '@trpc/server': '*',
            '@trpc/client': '*',
            '@trpc/react-query': '*',
            '@tanstack/react-query': '*',
            zod: '*',
          },
          entry: 'index.ts',
          environment: 'node',
        }}
        options={{
          visibleFiles: ['package.json', 'index.ts', 'trpc.ts'],
          activeFile: 'index.ts',
          initMode: 'user-visible',
          autorun: true,
        }}
      >
        <SandpackLayout>
          <SandpackFileExplorer autoHiddenFiles />
          <SandpackCodeEditor showTabs={false} />
        </SandpackLayout>

        <SandpackLayout>
          <SandpackPreview />
          <SandpackConsole />
        </SandpackLayout>
      </SandpackProvider>

      {/* Run a frontend */}
      {/* <SandpackProvider
        files={FRONTEND_FILES}
        theme="dark"
        customSetup={{
          dependencies: {
            '@trpc/client': '*',
            '@trpc/react-query': '*',
            zod: '*',
            react: '*',
            'react-dom': '*',
          },
          entry: 'index.ts',
        }}
        options={{
          visibleFiles: ['package.json', 'index.ts', 'trpc.ts'],
          activeFile: 'index.ts',
          initMode: 'user-visible',
          autorun: true,
        }}
      >
        <SandpackLayout>
          <SandpackCodeEditor showTabs={false} />

          <SandpackPreview />
        </SandpackLayout>
      </SandpackProvider> */}
    </>
  );
}
