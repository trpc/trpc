import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import {
  experimental_pipelining,
  getUntypedClient,
  httpBatchStreamLink,
} from '@trpc/client';
import {
  createOperationPipeline,
  pipeCall,
  pipelineContext,
} from '@trpc/client/unstable-internals';
import { initTRPC, TRPCError } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';

/** A pipelined batch as a GET request, with an input for calls 1 and 2 */
function pipelined(opts: { paths: string; pipe: unknown }) {
  return new Request(
    `http://localhost/trpc/${opts.paths}?batch=pipeline&input=${encodeURIComponent(
      JSON.stringify({ 1: {}, 2: {} }),
    )}&pipe=${encodeURIComponent(JSON.stringify(opts.pipe))}`,
  );
}

test('a call that reads a failed call and a pending one fails without waiting for the pending one', async () => {
  const t = initTRPC.create();
  const released = new AbortController();
  const pending = new Promise<void>((resolve) => {
    released.signal.addEventListener('abort', () => resolve());
  });
  const router = t.router({
    slow: t.procedure.query(async () => {
      await pending;
      return { id: 'slow' };
    }),
    failing: t.procedure.query(() => {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }),
    edge: t.procedure
      .input(z.object({ a: z.string(), b: z.string() }))
      .query((opts) => opts.input),
  });
  await using ctx = testServerAndClientResource(router, {
    server: { experimental_allowPipelining: true },
    client: (clientOpts) => ({
      links: [
        httpBatchStreamLink({
          url: clientOpts.httpUrl,
          experimental_pipelining: experimental_pipelining(),
        }),
      ],
    }),
  });
  const untyped = getUntypedClient(ctx.client);

  const slow = createOperationPipeline();
  const failing = createOperationPipeline();
  const slowResult = untyped.query('slow', undefined, {
    context: pipelineContext(slow),
  });
  const failingResult = untyped.query('failing', undefined, {
    context: pipelineContext(failing),
  });
  failingResult.catch(() => undefined);
  const edge = pipeCall({
    path: 'edge',
    input: { a: undefined, b: undefined },
    reads: {
      each: null,
      reads: [
        { kind: 'whole', to: ['a'], from: slow, path: ['id'] },
        { kind: 'whole', to: ['b'], from: failing, path: ['id'] },
      ],
    },
  });
  assert(edge);
  let settled = false;
  edge.result.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );

  await expect(failingResult).rejects.toThrow();
  // `slow` is still running
  await vi.waitFor(() => expect(settled).toBe(true));
  await expect(edge.result).rejects.toThrow();

  released.abort();
  expect(await slowResult).toEqual({ id: 'slow' });
});

test('a call whose data JSON cannot carry is reported to `onError`, in a pipelined batch that does not stream', async () => {
  const t = initTRPC.create();
  const router = t.router({
    post: t.procedure.query(() => ({ authorId: 'u1' })),
    big: t.procedure.input(z.object({ id: z.string() })).query(() => BigInt(1)),
  });
  const onError = vi.fn();
  const res = await fetchRequestHandler({
    endpoint: '/trpc',
    req: pipelined({
      paths: 'post,big',
      pipe: { 1: { reads: [{ to: ['id'], from: 0, path: ['authorId'] }] } },
    }),
    router,
    experimental_allowPipelining: true,
    onError,
  });
  const json = await res.json();

  expect(json[0]).toEqual({ result: { data: { authorId: 'u1' } } });
  expect(json[1]).toHaveProperty('error');
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError.mock.calls[0]![0]).toMatchObject({
    path: 'big',
    input: { id: 'u1' },
    type: 'query',
  });
});

test('a run of a call for every item that returns an Observable is an error for that item', async () => {
  const t = initTRPC.create();
  const router = t.router({
    post: t.procedure.query(() => ({ tags: [{ id: 't1' }] })),
    tag: t.procedure
      .input(z.object({ id: z.string() }))
      .query(() => observable<number>((emit) => emit.next(1))),
  });
  const res = await fetchRequestHandler({
    endpoint: '/trpc',
    req: pipelined({
      paths: 'post,tag',
      pipe: {
        1: {
          each: { from: 0, path: ['tags'] },
          reads: [{ to: ['id'], path: ['id'] }],
        },
      },
    }),
    router,
    experimental_allowPipelining: true,
  });
  const json = await res.json();

  expect(json[1]).toMatchObject({
    items: {
      0: { error: { data: { code: 'UNSUPPORTED_MEDIA_TYPE' } } },
    },
  });
});
