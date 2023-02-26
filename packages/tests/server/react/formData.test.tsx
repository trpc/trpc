import { routerToServerAndClientNew } from '../___testHelpers';
import { createQueryClient } from '../__queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { waitFor } from '@testing-library/dom';
import { render } from '@testing-library/react';
import { createTRPCClientProxy, loggerLink } from '@trpc/client';
import { unstable_formDataLink } from '@trpc/client/links/formDataLink';
import { httpBatchLink } from '@trpc/client/links/httpBatchLink';
import { splitLink } from '@trpc/client/links/splitLink';
import { createTRPCReact } from '@trpc/react-query';
import { CreateTRPCReactBase } from '@trpc/react-query/createTRPCReact';
import { initTRPC } from '@trpc/server';
import { nodeHTTPFormDataContentTypeHandler } from '@trpc/server/adapters/node-http/content-type/form-data';
import { nodeHTTPJSONContentTypeHandler } from '@trpc/server/adapters/node-http/content-type/json';
import { konn } from 'konn';
import React, { ReactNode } from 'react';
import { Readable } from 'stream';
import { z } from 'zod';

const zodFileObject = z.object({
  file: z.instanceof(Readable),
  filename: z.string(),
  mimeType: z.string(),
});

const zodFile = zodFileObject.transform(
  async ({ file, filename, mimeType }) => {
    const chunks: Buffer[] = [];
    for await (const chunk of file) {
      chunks.push(chunk);
    }

    return new File(chunks, filename, {
      type: mimeType,
    });
  },
);

const createUserSchema = z.object({
  name: z.string(),
  age: z.string().transform(Number).pipe(z.number()),
  image: zodFile.optional(),
});
const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();

    const appRouter = t.router({
      createUser: t.procedure.input(createUserSchema).mutation(({ input }) => {
        return input;
      }),
      uploadFile: t.procedure
        .input(
          z.object({
            bobfile: zodFile,
            joefile: zodFileObject,
          }),
        )
        .mutation(async ({ input }) => {
          const [bobfileContents] = await Promise.all([input.bobfile.text()]);

          return {
            bob: bobfileContents,
            joeFilename: input.joefile.filename,
          };
        }),
    });

    type TRouter = typeof appRouter;

    const loggerLinkConsole = {
      log: vi.fn(),
      error: vi.fn(),
    };
    const opts = routerToServerAndClientNew(appRouter, {
      server: {
        unstable_contentTypeHandlers: [
          nodeHTTPFormDataContentTypeHandler(),
          nodeHTTPJSONContentTypeHandler(),
        ],
      },
      client: ({ httpUrl }) => ({
        links: [
          loggerLink({
            enabled: () => true,
            console: loggerLinkConsole,
          }),
          splitLink({
            condition: (op) => op.input instanceof FormData,
            true: unstable_formDataLink({
              url: httpUrl,
            }),
            false: httpBatchLink({
              url: httpUrl,
            }),
          }),
        ],
      }),
    });

    const queryClient = createQueryClient();
    const proxy = createTRPCReact<TRouter, unknown, 'ExperimentalSuspense'>();
    const baseProxy = proxy as CreateTRPCReactBase<TRouter, unknown>;

    const client = opts.client;

    function App(props: { children: ReactNode }) {
      return (
        <baseProxy.Provider {...{ queryClient, client }}>
          <QueryClientProvider client={queryClient}>
            {props.children}
          </QueryClientProvider>
        </baseProxy.Provider>
      );
    }

    return {
      close: opts.close,
      client,
      queryClient,
      proxy,
      App,
      appRouter,
      opts,
      loggerLinkConsole,
    };
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('react basic', async () => {
  const { proxy, App } = ctx;
  function MyComponent() {
    const createUserMutation = proxy.createUser.useMutation();

    return (
      <div>
        <form
          onSubmit={(e) => {
            const formData = new FormData(e.currentTarget);
            createUserMutation.mutate(formData as any);

            e.preventDefault();
          }}
        >
          <input name="name" defaultValue="bob" />
          <input name="age" defaultValue={42} />
          <button type="submit">Submit</button>
        </form>
        {createUserMutation.data && (
          <div>
            <p>Name: {createUserMutation.data.name}</p>
            <p>Age: {createUserMutation.data.age}</p>
          </div>
        )}
      </div>
    );
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  utils.getByText('Submit').click();
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('bob');
  });
});

test('upload file', async () => {
  const { client } = ctx;
  const proxyClient = createTRPCClientProxy(client);

  const { FormData, File } = await import('node-fetch');
  globalThis.FormData = FormData;
  globalThis.File = File;

  const form = new FormData();
  form.append(
    'bobfile',
    new File(['hi bob'], 'bob.txt', {
      type: 'text/plain',
    }),
  );
  form.append(
    'joefile',
    new File(['hi joe'], 'joe.txt', {
      type: 'text/plain',
    }),
  );

  const fileContents = await proxyClient.uploadFile.mutate(form as any);

  expect(fileContents).toStrictEqual({
    bob: 'hi bob',
    joeFilename: 'joe.txt',
  });
});
