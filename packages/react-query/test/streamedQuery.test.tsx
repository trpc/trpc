import { createQueryClient } from './__queryClient';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { TRPCLink } from '@trpc/client';
import { getUntypedClient, httpBatchStreamLink } from '@trpc/client';
import { createTRPCQueryUtils, createTRPCReact } from '@trpc/react-query';
import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import {
  createDeferred,
  isAsyncIterable,
} from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
import { describe, expect, test, vi } from 'vitest';

/**
 * Each call of `stream` waits for the test before it answers with the stream
 * and before each chunk, and the client records what reached it. A test can
 * then wait for an older stream's chunk to arrive, however slow the machine is.
 */
function testContext() {
  const t = initTRPC.create();

  function createCall(name: string) {
    const answered = createDeferred<void>();
    let gate = createDeferred<'chunk' | 'end'>();
    const call = {
      signal: undefined as AbortSignal | undefined,
      answered: answered.promise,
      answer: () => answered.resolve(),
      chunks: 0,
      finished: false,
      next: (action: 'chunk' | 'end') => gate.resolve(action),
      async *stream() {
        while (true) {
          const action = await gate.promise;
          gate = createDeferred();
          if (action === 'end') {
            call.finished = true;
            return;
          }
          yield `${name}${++call.chunks}`;
        }
      },
    };
    return call;
  }
  const calls: ReturnType<typeof createCall>[] = [];

  const appRouter = t.router({
    stream: t.procedure.query(async (opts) => {
      const call = createCall('abc'[calls.length]!);
      call.signal = opts.signal;
      calls.push(call);
      await call.answered;
      return call.stream();
    }),
  });

  const received: unknown[] = [];
  async function* record(iterable: AsyncIterable<unknown>) {
    for await (const value of iterable) {
      received.push(value);
      yield value;
    }
  }
  const recordLink: TRPCLink<typeof appRouter> =
    () =>
    ({ next, op }) =>
      observable((observer) =>
        next(op).subscribe({
          next(envelope) {
            const data = (envelope.result as { data?: unknown }).data;
            observer.next(
              isAsyncIterable(data)
                ? { ...envelope, result: { data: record(data) } }
                : envelope,
            );
          },
          error: (cause) => observer.error(cause),
          complete: () => observer.complete(),
        }),
      );

  const ctx = testServerAndClientResource(appRouter, {
    client: (opts) => ({
      links: [recordLink, httpBatchStreamLink({ url: opts.httpUrl })],
    }),
  });
  const queryClient = createQueryClient();
  const utils = createTRPCQueryUtils({
    client: getUntypedClient(ctx.client),
    queryClient,
  });
  const trpc = createTRPCReact<typeof appRouter>();
  const queryKey = utils.stream.queryOptions().queryKey;

  return {
    ...ctx,
    calls,
    queryClient,
    queryKey,
    utils,
    data: () => queryClient.getQueryData(queryKey),
    /** Starts the query the way each entry point does. */
    entryPoints: {
      useQuery() {
        function App() {
          trpc.stream.useQuery();
          return null;
        }
        render(
          <trpc.Provider client={ctx.client} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
              <App />
            </QueryClientProvider>
          </trpc.Provider>,
        );
      },
      queryOptions() {
        new QueryObserver(
          queryClient,
          utils.stream.queryOptions() as never,
        ).subscribe(() => undefined);
      },
    },
    /** Sends a chunk and waits for the client to have received it. */
    async sendChunk(call: ReturnType<typeof createCall>, chunk: string) {
      call.next('chunk');
      await vi.waitFor(() => expect(received).toContain(chunk));
    },
    /** Sends a chunk and waits for the server to have sent it. */
    async serverChunk(call: ReturnType<typeof createCall>) {
      const before = call.chunks;
      call.next('chunk');
      await vi.waitFor(() => expect(call.chunks).toBe(before + 1));
    },
  };
}

describe.each(['useQuery', 'queryOptions'] as const)(
  'a query that streams, through %s',
  (entryPoint) => {
    test('a refetch stops the older stream from writing to the query', async () => {
      await using t = testContext();
      t.entryPoints[entryPoint]();
      await vi.waitFor(() => expect(t.calls).toHaveLength(1));
      const [older] = t.calls;
      older!.answer();
      await t.sendChunk(older!, 'a1');
      await vi.waitFor(() => expect(t.data()).toEqual(['a1']));

      const refetch = t.queryClient.invalidateQueries({
        queryKey: t.queryKey,
      });
      await vi.waitFor(() => expect(t.calls).toHaveLength(2));
      const newer = t.calls[1]!;
      newer.answer();
      await t.sendChunk(newer, 'b1');
      await vi.waitFor(() => expect(t.data()).toEqual(['b1']));
      newer.next('end');
      await refetch;

      await t.sendChunk(older!, 'a2');
      expect(t.data()).toEqual(['b1']);
    });

    test('a refetch leaves the older stream running to its end on the server', async () => {
      await using t = testContext();
      t.entryPoints[entryPoint]();
      await vi.waitFor(() => expect(t.calls).toHaveLength(1));
      const [older] = t.calls;
      older!.answer();
      await t.sendChunk(older!, 'a1');

      const refetch = t.queryClient.invalidateQueries({
        queryKey: t.queryKey,
      });
      await vi.waitFor(() => expect(t.calls).toHaveLength(2));
      const newer = t.calls[1]!;
      newer.answer();
      await t.sendChunk(newer, 'b1');
      newer.next('end');
      await refetch;

      await t.sendChunk(older!, 'a2');
      await t.sendChunk(older!, 'a3');
      older!.next('end');
      await vi.waitFor(() => expect(older!.finished).toBe(true));
      expect(older!.signal?.aborted).toBe(false);
      expect(t.data()).toEqual(['b1']);
    });

    test('cancelQueries leaves the stream running to its end on the server', async () => {
      await using t = testContext();
      t.entryPoints[entryPoint]();
      await vi.waitFor(() => expect(t.calls).toHaveLength(1));
      const [call] = t.calls;
      call!.answer();
      await t.sendChunk(call!, 'a1');

      await t.queryClient.cancelQueries({ queryKey: t.queryKey });

      await t.sendChunk(call!, 'a2');
      await t.sendChunk(call!, 'a3');
      call!.next('end');
      await vi.waitFor(() => expect(call!.finished).toBe(true));
      expect(call!.signal?.aborted).toBe(false);
    });

    test('cancelQueries stops the stream from overwriting an optimistic update', async () => {
      await using t = testContext();
      t.entryPoints[entryPoint]();
      await vi.waitFor(() => expect(t.calls).toHaveLength(1));
      const [call] = t.calls;
      call!.answer();
      await t.sendChunk(call!, 'a1');
      await vi.waitFor(() => expect(t.data()).toEqual(['a1']));

      await t.queryClient.cancelQueries({ queryKey: t.queryKey });
      t.queryClient.setQueryData(t.queryKey, ['optimistic']);

      await t.sendChunk(call!, 'a2');
      expect(t.data()).toEqual(['optimistic']);
    });

    test('an older request that answers after removeQueries stays out of the new query', async () => {
      await using t = testContext();
      t.entryPoints[entryPoint]();
      await vi.waitFor(() => expect(t.calls).toHaveLength(1));

      t.queryClient.removeQueries({ queryKey: t.queryKey });
      const fetchingNewer = t.queryClient.fetchQuery(
        t.utils.stream.queryOptions() as never,
      );
      await vi.waitFor(() => expect(t.calls).toHaveLength(2));
      const [older, newer] = t.calls;
      newer!.answer();
      await t.sendChunk(newer!, 'b1');
      await vi.waitFor(() => expect(t.data()).toEqual(['b1']));

      older!.answer();
      await t.sendChunk(older!, 'a1');
      expect(t.data()).toEqual(['b1']);

      older!.next('end');
      newer!.next('end');
      await expect(fetchingNewer).resolves.toEqual(['b1']);
      expect(t.data()).toEqual(['b1']);
    });

    test('an older request that answers after clear stays out of the new query', async () => {
      await using t = testContext();
      t.entryPoints[entryPoint]();
      await vi.waitFor(() => expect(t.calls).toHaveLength(1));

      t.queryClient.clear();
      const fetchingNewer = t.queryClient.fetchQuery(
        t.utils.stream.queryOptions() as never,
      );
      await vi.waitFor(() => expect(t.calls).toHaveLength(2));
      const [older, newer] = t.calls;

      older!.answer();
      await t.sendChunk(older!, 'a1');
      expect(t.data()).toBeUndefined();

      older!.next('end');
      newer!.answer();
      newer!.next('end');
      await expect(fetchingNewer).resolves.toEqual([]);
    });
  },
);

describe('a query that streams, through a retained queryOptions object', () => {
  test('one options object on two QueryClients at once gives each its whole stream', async () => {
    await using t = testContext();
    const options = t.utils.stream.queryOptions();
    const first = createQueryClient();
    const second = createQueryClient();
    const fetchingFirst = first.fetchQuery(options as never);
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const fetchingSecond = second.fetchQuery(options as never);
    await vi.waitFor(() => expect(t.calls).toHaveLength(2));
    const [callFirst, callSecond] = t.calls;
    callFirst!.answer();
    callSecond!.answer();

    await t.serverChunk(callFirst!);
    await t.serverChunk(callSecond!);
    await t.serverChunk(callFirst!);
    await t.serverChunk(callSecond!);
    callFirst!.next('end');
    callSecond!.next('end');

    await expect(fetchingFirst).resolves.toEqual(['a1', 'a2']);
    await expect(fetchingSecond).resolves.toEqual(['b1', 'b2']);
  });

  test('a query with its own queryHash gets its whole stream', async () => {
    await using t = testContext();
    const fetching = t.queryClient.fetchQuery({
      ...t.utils.stream.queryOptions(),
      queryHash: 'mine',
    } as never);
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const [call] = t.calls;
    call!.answer();

    await t.serverChunk(call!);
    await t.serverChunk(call!);
    call!.next('end');

    await expect(fetching).resolves.toEqual(['a1', 'a2']);
  });

  test('one key array under two queryHashes at once gives each its whole stream', async () => {
    await using t = testContext();
    const options = t.utils.stream.queryOptions();
    const fetchingFirst = t.queryClient.fetchQuery({
      ...options,
      queryHash: 'first',
    } as never);
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const fetchingSecond = t.queryClient.fetchQuery({
      ...options,
      queryHash: 'second',
    } as never);
    await vi.waitFor(() => expect(t.calls).toHaveLength(2));
    const [callFirst, callSecond] = t.calls;
    callFirst!.answer();
    callSecond!.answer();

    await t.serverChunk(callFirst!);
    await t.serverChunk(callSecond!);
    await t.serverChunk(callFirst!);
    await t.serverChunk(callSecond!);
    callFirst!.next('end');
    callSecond!.next('end');

    await expect(fetchingFirst).resolves.toEqual(['a1', 'a2']);
    await expect(fetchingSecond).resolves.toEqual(['b1', 'b2']);
  });

  test('one key array at its hash and under its own queryHash at once keeps the streams apart', async () => {
    await using t = testContext();
    const options = t.utils.stream.queryOptions();
    const fetchingAtHash = t.queryClient.fetchQuery(options as never);
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const fetchingOwn = t.queryClient.fetchQuery({
      ...options,
      queryHash: 'mine',
    } as never);
    await vi.waitFor(() => expect(t.calls).toHaveLength(2));
    const [callAtHash, callOwn] = t.calls;
    callAtHash!.answer();
    callOwn!.answer();
    const ownData = () => t.queryClient.getQueryCache().get('mine')?.state.data;

    await t.sendChunk(callOwn!, 'b1');
    expect(t.data() ?? []).not.toContain('b1');
    await t.sendChunk(callAtHash!, 'a1');
    expect(ownData() ?? []).not.toContain('a1');

    callAtHash!.next('end');
    callOwn!.next('end');
    await expect(fetchingAtHash).resolves.toEqual(['a1']);
    await expect(fetchingOwn).resolves.toEqual(['b1']);
  });

  test('a query with its own queryHash removed before it streams leaves the query at the key hash its own result', async () => {
    await using t = testContext();
    const options = t.utils.stream.queryOptions();
    const fetchingAtHash = t.queryClient.fetchQuery(options as never);
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const fetchingOwn = t.queryClient
      .fetchQuery({ ...options, queryHash: 'mine' } as never)
      .catch(() => 'cancelled');
    await vi.waitFor(() => expect(t.calls).toHaveLength(2));
    const [callAtHash, callOwn] = t.calls;

    t.queryClient.removeQueries({
      predicate: (query) => query.queryHash === 'mine',
    });
    callOwn!.answer();
    await t.sendChunk(callOwn!, 'b1');
    callAtHash!.answer();
    await t.sendChunk(callAtHash!, 'a1');
    callAtHash!.next('end');
    await expect(fetchingAtHash).resolves.toEqual(['a1']);

    await t.sendChunk(callOwn!, 'b2');
    expect(t.data()).toEqual(['a1']);
    callOwn!.next('end');
    await expect(fetchingOwn).resolves.toBe('cancelled');
    expect(t.data()).toEqual(['a1']);
  });

  test('streams into a query with its own queryKeyHashFn when the client default throws', async () => {
    await using t = testContext();
    const queryClient = createQueryClient({
      defaultOptions: {
        queries: {
          queryKeyHashFn: () => {
            throw new Error('this client hashes no tRPC keys');
          },
        },
      },
    });
    const fetching = queryClient.fetchQuery({
      ...t.utils.stream.queryOptions(),
      queryKeyHashFn: () => 'custom-hash',
    } as never);
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const [call] = t.calls;
    call!.answer();
    await t.sendChunk(call!, 'a1');
    await vi.waitFor(() =>
      expect(
        queryClient.getQueryCache().get('custom-hash')?.state.data,
      ).toEqual(['a1']),
    );
    call!.next('end');
    await expect(fetching).resolves.toEqual(['a1']);
  });

  test('a query function called with a context that has no client writes as before', async () => {
    await using t = testContext();
    const options = t.utils.stream.queryOptions();
    const queryFn = options.queryFn as unknown as (
      context: object,
    ) => Promise<unknown>;
    const fetching = queryFn({
      queryKey: options.queryKey,
      meta: undefined,
      signal: new AbortController().signal,
    });
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const [call] = t.calls;
    call!.answer();
    await t.sendChunk(call!, 'a1');
    expect(t.data()).toEqual(['a1']);
    call!.next('end');
    await expect(fetching).resolves.toEqual(['a1']);
  });
});
