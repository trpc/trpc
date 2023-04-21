import { routerToServerAndClientNew } from '../___testHelpers';
import { createQueryClient } from '../__queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  createTRPCClientProxy,
  experimental_formDataLink,
  httpBatchLink,
  loggerLink,
  splitLink,
} from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { CreateTRPCReactBase } from '@trpc/react-query/createTRPCReact';
import { initTRPC } from '@trpc/server';
import {
  experimental_createMemoryUploadHandler,
  experimental_parseMultipartFormData,
  nodeHTTPFormDataContentTypeHandler,
} from '@trpc/server/adapters/node-http/content-type/form-data';
import { nodeHTTPJSONContentTypeHandler } from '@trpc/server/adapters/node-http/content-type/json';
import { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import { konn } from 'konn';
import React, { ReactNode } from 'react';
import { zfd } from 'zod-form-data';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.context<CreateHTTPContextOptions>().create();

    const appRouter = t.router({
      uploadFile: t.procedure
        .use(async (opts) => {
          const formData = await experimental_parseMultipartFormData(
            opts.ctx.req,
            experimental_createMemoryUploadHandler(),
          );

          return opts.next({
            rawInput: { formData },
          });
        })
        .input(
          zfd.formData({
            file: zfd.file(),
          }),
        )
        .mutation(async ({ input }) => {
          return {
            file: {
              name: input.file.name,
              type: input.file.type,
              file: await input.file.text(),
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
        experimental_contentTypeHandlers: [
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
            true: experimental_formDataLink({
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

test('upload file', async () => {
  const { client } = ctx;
  const proxyClient = createTRPCClientProxy(client);

  const { FormData, File } = await import('node-fetch');
  globalThis.FormData = FormData;
  globalThis.File = File;

  const form = new FormData();
  form.append(
    'file',
    new File(['hi bob'], 'bob.txt', {
      type: 'text/plain',
    }),
  );

  const fileContents = await proxyClient.uploadFile.mutate(form as any);

  expect(fileContents).toMatchInlineSnapshot();
});
