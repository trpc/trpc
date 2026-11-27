// @vitest-environment node

import { httpLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import type { CombinedDataTransformer } from '@trpc/server/unstable-core-do-not-import';
import { expect, test, vi } from 'vitest';
import { z } from 'zod';
import { testServerAndClientResource } from './testClientResource';

const trpc = initTRPC.create();

function inspectInput(input: unknown) {
  if (Object.prototype.toString.call(input) === '[object FormData]') {
    return { kind: 'formData', id: (input as FormData).get('id') };
  }
  return { kind: 'other', input };
}

const router = trpc.router({
  echo: trpc.procedure
    .input(z.object({ id: z.string(), prepared: z.string().optional() }))
    .mutation(({ input }) => input),
  echoQuery: trpc.procedure
    .input(z.object({ id: z.string(), prepared: z.string().optional() }))
    .query(({ input }) => input),
  upload: trpc.procedure
    .input(z.any())
    .mutation(({ input }) => inspectInput(input)),
  uploadQuery: trpc.procedure
    .input(z.any())
    .query(({ input }) => inspectInput(input)),
});

test('a mutation can turn its input into FormData', async () => {
  await using app = testServerAndClientResource(router, {
    client: (opts) => ({
      links: [
        httpLink({
          url: opts.httpUrl,
          prepareInput({ value }) {
            const fd = new FormData();
            fd.set('id', (value as { id: string }).id);
            return fd;
          },
        }),
      ],
    }),
  });

  expect(await app.client.upload.mutate({ id: 'bar' })).toEqual({
    kind: 'formData',
    id: 'bar',
  });
});

test('the prepared value is sent as JSON when it is a plain object', async () => {
  const prepareInput = vi.fn(({ value }: { value: unknown }) => ({
    ...(value as object),
    prepared: 'yes',
  }));
  await using app = testServerAndClientResource(router, {
    client: (opts) => ({
      links: [httpLink({ url: opts.httpUrl, prepareInput })],
    }),
  });

  expect(await app.client.echo.mutate({ id: 'a' })).toEqual({
    id: 'a',
    prepared: 'yes',
  });
  expect(prepareInput).toHaveBeenCalledExactlyOnceWith({
    value: { id: 'a' },
    type: 'mutation',
    path: 'echo',
    methodOverride: undefined,
  });
});

test('prepareInput also applies to queries', async () => {
  await using app = testServerAndClientResource(router, {
    client: (opts) => ({
      links: [
        httpLink({
          url: opts.httpUrl,
          prepareInput: ({ value }) => ({
            ...(value as object),
            prepared: 'yes',
          }),
        }),
      ],
    }),
  });

  expect(await app.client.echoQuery.query({ id: 'q' })).toEqual({
    id: 'q',
    prepared: 'yes',
  });
});

test('a query can send FormData with methodOverride: POST', async () => {
  await using app = testServerAndClientResource(router, {
    server: { allowMethodOverride: true },
    client: (opts) => ({
      links: [
        httpLink({
          url: opts.httpUrl,
          methodOverride: 'POST',
          prepareInput: () => {
            const fd = new FormData();
            fd.set('id', 'posted');
            return fd;
          },
        }),
      ],
    }),
  });

  expect(await app.client.uploadQuery.query({ id: 'posted' })).toEqual({
    kind: 'formData',
    id: 'posted',
  });
});

test('the transformer is not run on FormData prepared for a POST query', async () => {
  const transformer: CombinedDataTransformer = {
    input: {
      serialize(value) {
        if (value instanceof FormData) {
          throw new Error('FormData must not reach the transformer');
        }
        return value;
      },
      deserialize: (value) => value,
    },
    output: {
      serialize: (value) => value,
      deserialize: (value) => value,
    },
  };

  const transformedTrpc = initTRPC.create({ transformer });
  const transformedRouter = transformedTrpc.router({
    uploadQuery: transformedTrpc.procedure
      .input(z.any())
      .query(({ input }) => inspectInput(input)),
  });

  await using app = testServerAndClientResource(transformedRouter, {
    server: { allowMethodOverride: true },
    client: (opts) => ({
      links: [
        httpLink({
          url: opts.httpUrl,
          transformer,
          methodOverride: 'POST',
          prepareInput: () => {
            const fd = new FormData();
            fd.set('id', 'prepared');
            return fd;
          },
        }),
      ],
    }),
  });

  expect(await app.client.uploadQuery.query({ id: 'prepared' })).toEqual({
    kind: 'formData',
    id: 'prepared',
  });
});

test('FormData from prepareInput is still rejected for queries', async () => {
  await using app = testServerAndClientResource(router, {
    client: (opts) => ({
      links: [
        httpLink({
          url: opts.httpUrl,
          prepareInput: () => new FormData(),
        }),
      ],
    }),
  });

  await expect(app.client.echoQuery.query({ id: 'q' })).rejects.toThrow(
    'FormData is only supported for mutations',
  );
});
