// Vitest doesn't play nice with JSOM ArrayBuffer's: https://github.com/vitest-dev/vitest/issues/4043#issuecomment-1742028595
// @vitest-environment node
import { routerToServerAndClientNew } from '../___testHelpers';
import { createQueryClient } from '../__queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  getUntypedClient,
  httpBatchLink,
  httpLink,
  isNonJsonSerializable,
  loggerLink,
  splitLink,
} from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { initTRPC } from '@trpc/server';
import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import { octetInputParser } from '@trpc/server/http';
import { konn } from 'konn';
import type { ReactNode } from 'react';
import React from 'react';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.context<CreateHTTPContextOptions>().create();

    const appRouter = t.router({
      uploadFile: t.procedure
        .input(octetInputParser)
        .mutation(async ({ input }) => {
          const chunks = [];

          const reader = input.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            chunks.push(value);
          }

          const content = Buffer.concat(chunks).toString('utf-8');

          return {
            fileContent: content,
          };
        }),
    });

    type TRouter = typeof appRouter;

    const loggerLinkConsole = {
      log: vi.fn(),
      error: vi.fn(),
    };
    const opts = routerToServerAndClientNew(appRouter, {
      client: ({ httpUrl }) => ({
        links: [
          loggerLink({
            enabled: () => true,
            console: loggerLinkConsole,
          }),
          splitLink({
            condition: (op) => isNonJsonSerializable(op.input),
            true: httpLink({
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
    const trpc = createTRPCReact<TRouter, unknown>();

    const client = opts.client;

    function App(props: { children: ReactNode }) {
      return (
        <trpc.Provider {...{ queryClient, client: getUntypedClient(client) }}>
          <QueryClientProvider client={queryClient}>
            {props.children}
          </QueryClientProvider>
        </trpc.Provider>
      );
    }

    return {
      ...opts,
      close: opts.close,
      queryClient,
      App,
    };
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('upload File', async () => {
  const file = new File(['hi bob'], 'bob.txt', {
    type: 'text/plain',
  });

  const response = await ctx.client.uploadFile.mutate(file);

  expect(response).toMatchInlineSnapshot(`
    Object {
      "fileContent": "hi bob",
    }
  `);
});

test('upload Blob', async () => {
  const blob = new Blob(['hi bob']);

  const response = await ctx.client.uploadFile.mutate(blob);

  expect(response).toMatchInlineSnapshot(`
    Object {
      "fileContent": "hi bob",
    }
  `);
});

test('upload UInt8Array', async () => {
  const uint8array = new Uint8Array(
    'hi bob'.split('').map((char) => char.charCodeAt(0)),
  );
  const response = await ctx.client.uploadFile.mutate(uint8array);

  expect(response).toMatchInlineSnapshot(`
    Object {
      "fileContent": "hi bob",
    }
  `);
});
