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
import { konn } from 'konn';
import type { ReactNode } from 'react';
import React from 'react';
import { z } from 'zod';
import { zfd } from 'zod-form-data';

function formDataOrObject<T extends z.ZodRawShape>(input: T) {
  return zfd.formData(input).or(z.object(input));
}

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.context<CreateHTTPContextOptions>().create();

    const appRouter = t.router({
      polymorphic: t.procedure
        .input(
          formDataOrObject({
            text: z.string(),
          }),
        )
        .mutation((opts) => {
          return opts.input;
        }),
      uploadFile: t.procedure
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
      uploadFilesAndIncludeTextPropertiesToo: t.procedure
        .input(
          zfd.formData({
            files: zfd.repeatableOfType(zfd.file()),
            text: z.string(),
            json: zfd.json(z.object({ foo: z.string() })),
          }),
        )
        .mutation(async ({ input }) => {
          const files = await Promise.all(
            input.files.map(async (file) => ({
              name: file.name,
              type: file.type,
              file: await file.text(),
            })),
          );

          return {
            files,
            text: input.text,
            json: input.json,
          };
        }),
      q: t.procedure
        .input(
          zfd.formData({
            foo: zfd.text(),
          }),
        )
        .query((opts) => {
          return opts.input;
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

test('upload file', async () => {
  const form = new FormData();
  form.append(
    'file',
    new File(['hi bob'], 'bob.txt', {
      type: 'text/plain',
    }),
  );

  const fileContents = await ctx.client.uploadFile.mutate(form);

  expect(fileContents).toMatchInlineSnapshot(`
    Object {
      "file": Object {
        "file": "hi bob",
        "name": "bob.txt",
        "type": "text/plain",
      },
    }
  `);
});

test('polymorphic - accept both JSON and FormData', async () => {
  const form = new FormData();
  form.set('text', 'foo');

  const formDataRes = await ctx.client.polymorphic.mutate(form);
  const jsonRes = await ctx.client.polymorphic.mutate({
    text: 'foo',
  });
  expect(formDataRes).toEqual(jsonRes);
});

test('upload a combination of files and non-file text fields', async () => {
  const form = new FormData();
  form.append(
    'files',
    new File(['hi bob'], 'bob.txt', {
      type: 'text/plain',
    }),
  );
  form.append(
    'files',
    new File(['hi alice'], 'alice.txt', {
      type: 'text/plain',
    }),
  );
  form.set('text', 'foo');
  form.set('json', JSON.stringify({ foo: 'bar' }));

  const fileContents =
    await ctx.client.uploadFilesAndIncludeTextPropertiesToo.mutate(form);

  expect(fileContents).toEqual({
    files: [
      {
        file: 'hi bob',
        name: expect.stringMatching(/\.txt$/),
        type: 'text/plain',
      },
      {
        file: 'hi alice',
        name: expect.stringMatching(/\.txt$/),
        type: 'text/plain',
      },
    ],
    text: 'foo',
    json: {
      foo: 'bar',
    },
  });
});

test('GET requests are not supported', async () => {
  const form = new FormData();
  form.set('foo', 'bar');

  await expect(ctx.client.q.query(form)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: FormData is only supported for mutations]`,
  );
});
