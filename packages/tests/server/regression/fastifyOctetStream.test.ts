// @vitest-environment node
import { createTRPCClient, httpLink, TRPCClientError } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { octetInputParser } from '@trpc/server/http';
import { makeAsyncResource } from '@trpc/server/unstable-core-do-not-import';
import fastify from 'fastify';

const t = initTRPC.create();

const router = t.router({
  upload: t.procedure.input(octetInputParser).mutation(async ({ input }) => {
    const bytes: number[] = [];
    for await (const chunk of input) {
      bytes.push(...chunk);
    }
    return bytes;
  }),
});

async function startServer(opts: { maxBodySize: number | undefined }) {
  const instance = fastify();

  instance.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: { router, maxBodySize: opts.maxBodySize },
  });

  const url = await instance.listen({ port: 0 });

  return makeAsyncResource(
    {
      client: createTRPCClient<typeof router>({
        links: [httpLink({ url: `${url}/trpc` })],
      }),
    },
    () => instance.close(),
  );
}

// Fastify answers 415 for a content type it has no parser for, before the
// request reaches tRPC
test('a binary input reaches the procedure', async () => {
  await using $ = await startServer({ maxBodySize: undefined });

  const bytes = new Uint8Array([0, 1, 2, 254, 255]);
  const blob = new Blob([bytes], { type: 'application/octet-stream' });

  expect(await $.client.upload.mutate(blob)).toEqual([0, 1, 2, 254, 255]);
});

test('a binary input over maxBodySize is rejected', async () => {
  await using $ = await startServer({ maxBodySize: 1024 });

  const blob = new Blob([new Uint8Array(10_000)], {
    type: 'application/octet-stream',
  });

  const error = await $.client.upload.mutate(blob).catch((cause) => cause);
  expect(error).toBeInstanceOf(TRPCClientError);
  expect(error.data).toMatchObject({
    code: 'PAYLOAD_TOO_LARGE',
    httpStatus: 413,
  });
});
