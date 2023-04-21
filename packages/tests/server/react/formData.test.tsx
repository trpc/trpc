import { routerToServerAndClientNew } from '../___testHelpers';
import { createQueryClient } from '../__queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { waitFor } from '@testing-library/dom';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createTRPCClientProxy,
  experimental_formDataLink,
  httpBatchLink,
  loggerLink,
  splitLink,
} from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { CreateTRPCReactBase } from '@trpc/react-query/createTRPCReact';
import { inferRouterOutputs, initTRPC } from '@trpc/server';
import { nodeHTTPFormDataContentTypeHandler } from '@trpc/server/adapters/node-http/content-type/form-data';
import { nodeHTTPJSONContentTypeHandler } from '@trpc/server/adapters/node-http/content-type/json';
import {
  experimental_zodFileSchema as zodFileSchema,
  experimental_zodFileStreamSchema as zodFileStreamSchema,
} from '@trpc/server/adapters/zodFileSchema';
import { konn } from 'konn';
import React, { ReactNode } from 'react';
import { z } from 'zod';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();

    const appRouter = t.router({
      createUser: t.procedure
        .input(
          z.object({
            name: z.string(),
            age: z.coerce.number(),
            image: zodFileSchema.optional(),
          }),
        )
        .mutation((opts) => {
          const { input } = opts;
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
            bobfile: zodFileSchema,
            joefile: zodFileStreamSchema,
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
        "name": "joe.txt",
        "stream": Object {
          "_events": Object {},
          "_eventsCount": 1,
          "_readableState": Object {
            "autoDestroy": true,
            "awaitDrainWriters": null,
            "buffer": Object {
              "head": Object {
                "data": Object {
                  "data": Array [
                    104,
                    105,
                    32,
                    106,
                    111,
                    101,
                  ],
                  "type": "Buffer",
                },
                "next": null,
              },
              "length": 1,
              "tail": Object {
                "data": Object {
                  "data": Array [
                    104,
                    105,
                    32,
                    106,
                    111,
                    101,
                  ],
                  "type": "Buffer",
                },
                "next": null,
              },
            },
            "closeEmitted": false,
            "closed": false,
            "constructed": true,
            "dataEmitted": false,
            "decoder": null,
            "defaultEncoding": "utf8",
            "destroyed": false,
            "emitClose": true,
            "emittedReadable": false,
            "encoding": null,
            "endEmitted": false,
            "ended": true,
            "errorEmitted": false,
            "errored": null,
            "flowing": null,
            "highWaterMark": 16384,
            "length": 6,
            "multiAwaitDrain": false,
            "needReadable": false,
            "objectMode": false,
            "pipes": Array [],
            "readableListening": false,
            "reading": false,
            "readingMore": false,
            "resumeScheduled": false,
            "sync": false,
          },
          "bytesRead": 6,
          "truncated": false,
        },
        "type": "text/plain",
      },
    }
  `);
});
