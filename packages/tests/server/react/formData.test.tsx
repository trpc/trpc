import * as fs from 'fs';
import { routerToServerAndClientNew } from '../___testHelpers';
import { createQueryClient } from '../__queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  experimental_formDataLink,
  getUntypedClient,
  httpBatchLink,
  loggerLink,
  splitLink,
} from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { CreateTRPCReactBase } from '@trpc/react-query/src/createTRPCReact';
import { initTRPC } from '@trpc/server';
import {
  experimental_createFileUploadHandler,
  experimental_createMemoryUploadHandler,
  experimental_isMultipartFormDataRequest,
  experimental_NodeOnDiskFile,
  experimental_parseMultipartFormData,
  nodeHTTPFormDataContentTypeHandler,
} from '@trpc/server/adapters/node-http/content-type/form-data';
import { nodeHTTPJSONContentTypeHandler } from '@trpc/server/adapters/node-http/content-type/json';
import { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import { konn } from 'konn';
import React, { ReactNode } from 'react';
import { z } from 'zod';
import { zfd } from 'zod-form-data';

beforeAll(async () => {
  const { FormData, File, Blob } = await import('node-fetch');
  globalThis.FormData = FormData;
  globalThis.File = File;
  globalThis.Blob = Blob;
});

function formDataOrObject<T extends z.ZodRawShape>(input: T) {
  return zfd.formData(input).or(z.object(input));
}

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.context<CreateHTTPContextOptions>().create();

    const appRouter = t.router({
      polymorphic: t.procedure
        .use(async (opts) => {
          if (!experimental_isMultipartFormDataRequest(opts.ctx.req)) {
            return opts.next();
          }
          const formData = await experimental_parseMultipartFormData(
            opts.ctx.req,
            experimental_createMemoryUploadHandler(),
          );

          return opts.next({
            getRawInput: async () => formData,
          });
        })
        .input(
          formDataOrObject({
            text: z.string(),
          }),
        )
        .mutation((opts) => {
          return opts.input;
        }),
      uploadFile: t.procedure
        .use(async (opts) => {
          const formData = await experimental_parseMultipartFormData(
            opts.ctx.req,
            experimental_createMemoryUploadHandler(),
          );

          return opts.next({
            getRawInput: async () => formData,
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
      uploadFilesOnDiskAndIncludeTextPropertiesToo: t.procedure
        .use(async (opts) => {
          const maxBodySize = 100; // 100 bytes
          const formData = await experimental_parseMultipartFormData(
            opts.ctx.req,
            experimental_createFileUploadHandler(),
            maxBodySize,
          );

          return opts.next({
            getRawInput: async () => formData,
          });
        })
        .input(
          zfd.formData({
            files: zfd.repeatableOfType(
              z.instanceof(experimental_NodeOnDiskFile),
            ),
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
            // console: loggerLinkConsole,
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
      loggerLinkConsole,
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
    await ctx.client.uploadFilesOnDiskAndIncludeTextPropertiesToo.mutate(form);

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

test('Throws when aggregate size of uploaded files and non-file text fields exceeds maxBodySize - files too large', async () => {
  const form = new FormData();
  form.append(
    'files',
    new File(['a'.repeat(50)], 'bob.txt', {
      type: 'text/plain',
    }),
  );
  form.append(
    'files',
    new File(['a'.repeat(51)], 'alice.txt', {
      type: 'text/plain',
    }),
  );
  form.set('text', 'foo');
  form.set('json', JSON.stringify({ foo: 'bar' }));

  await expect(
    ctx.client.uploadFilesOnDiskAndIncludeTextPropertiesToo.mutate(form),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `"Body exceeded upload size of 100 bytes."`,
  );
});

test('Throws when aggregate size of uploaded files and non-file text fields exceeds maxBodySize - text fields too large', async () => {
  const form = new FormData();
  form.append(
    'files',
    new File(['hi bob'], 'bob.txt', {
      type: 'text/plain',
    }),
  );

  form.set('text', 'a'.repeat(101));
  form.set('json', JSON.stringify({ foo: 'bar' }));

  await expect(
    ctx.client.uploadFilesOnDiskAndIncludeTextPropertiesToo.mutate(form),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `"Body exceeded upload size of 100 bytes."`,
  );
});
