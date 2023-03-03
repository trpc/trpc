import { routerToServerAndClientNew } from '../___testHelpers';
import { createQueryClient } from '../__queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { waitFor } from '@testing-library/dom';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createTRPCClientProxy,
  httpBatchLink,
  loggerLink,
  splitLink,
  unstable_formDataLink,
} from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { CreateTRPCReactBase } from '@trpc/react-query/createTRPCReact';
import { initTRPC } from '@trpc/server';
import { nodeHTTPFormDataContentTypeHandler } from '@trpc/server/adapters/node-http/content-type/form-data';
import { nodeHTTPJSONContentTypeHandler } from '@trpc/server/adapters/node-http/content-type/json';
import { konn } from 'konn';
import React, { ReactNode } from 'react';
import { z } from 'zod';
import {
  zodFile,
  zodFileStream,
} from '../../../../examples/next-formdata/src/server/zodFile';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();

    const appRouter = t.router({
      createUser: t.procedure
        .input(
          z.object({
            name: z.string(),
            age: z.coerce.number(),
            image: zodFile.optional(),
          }),
        )
        .mutation(({ input }) => {
          return {
            ...input,
            image: input.image && {
              //          ^?
              filename: input.image.name,
              size: input.image.size,
              type: input.image.type,
            },
          };
        }),
      uploadFile: t.procedure
        .use(async (opts) => {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          return opts.next();
        })
        .input(
          z.object({
            bobfile: zodFile,
            joefile: zodFileStream,
          }),
        )
        .mutation(async ({ input }) => {
          return {
            bob: {
              name: input.bobfile.name,
              type: input.bobfile.type,
              file: await input.bobfile.text(),
            },
            joeFilename: {
              ...input.joefile,
              file: '[redacted-stream]',
            },
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

test('react', async () => {
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
          <input name="image" type="file" data-testid="image-input" />
          <button type="submit">Submit</button>
        </form>
        {createUserMutation.data && (
          <pre data-testid={'result'}>
            {JSON.stringify(createUserMutation.data, null, 4)}
          </pre>
        )}
      </div>
    );
  }

  {
    //upload w/o file
    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    utils.getByText('Submit').click();

    await waitFor(() => {
      utils.getByTestId('result');
    });

    expect(utils.getByTestId('result').textContent).toMatchInlineSnapshot(`
      "{
          \\"name\\": \\"bob\\",
          \\"age\\": 42
      }"
    `);
    utils.unmount();
  }
});

test('react upload file', async () => {
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
          <input name="image" type="file" data-testid="image-input" />
          <button type="submit">Submit</button>
        </form>
        {createUserMutation.data && (
          <pre data-testid={'result'}>
            {JSON.stringify(createUserMutation.data, null, 4)}
          </pre>
        )}
      </div>
    );
  }
  {
    // upload with file
    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );
    // get the upload button
    const uploader = utils.getByTestId('image-input');

    const file = new File(['hi bob'], 'bob.txt', {
      type: 'text/plain',
    });

    await userEvent.upload(uploader, file);

    utils.getByText('Submit').click();

    await waitFor(() => {
      utils.getByTestId('result');
    });

    expect(utils.getByTestId('result').textContent).toMatchInlineSnapshot(`
      "{
          \\"name\\": \\"bob\\",
          \\"age\\": 42
      }"
    `);
  }
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

  expect(fileContents).toMatchInlineSnapshot(`
    Object {
      "bob": Object {
        "file": "hi bob",
        "name": "bob.txt",
        "type": "text/plain",
      },
      "joeFilename": Object {
        "file": "[redacted-stream]",
        "filename": "joe.txt",
        "mimeType": "text/plain",
      },
    }
  `);
});
