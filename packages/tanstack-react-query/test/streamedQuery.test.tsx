import { testReactResource } from './__helpers';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { httpBatchStreamLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import {
  createDeferred,
  isAsyncIterable,
} from '@trpc/server/unstable-core-do-not-import';
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
    let gate = createDeferred<'chunk' | 'end' | 'fail'>();
    const call = {
      signal: undefined as AbortSignal | undefined,
      answered: answered.promise,
      answer: () => answered.resolve(),
      chunks: 0,
      finished: false,
      next: (action: 'chunk' | 'end' | 'fail') => gate.resolve(action),
      async *stream() {
        while (true) {
          const action = await gate.promise;
          gate = createDeferred();
          if (action === 'end') {
            call.finished = true;
            return;
          }
          if (action === 'fail') throw new Error(`${name} failed`);
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
  const failed: unknown[] = [];
  async function* record(iterable: AsyncIterable<unknown>) {
    try {
      for await (const value of iterable) {
        received.push(value);
        yield value;
      }
    } catch (cause) {
      failed.push(cause);
      throw cause;
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

  const ctx = testReactResource(appRouter, {
    client: (opts) => ({
      links: [recordLink, httpBatchStreamLink({ url: opts.httpUrl })],
    }),
  });

  const options = ctx.optionsProxyClient.stream.queryOptions();

  return {
    ...ctx,
    calls,
    failed,
    options,
    observe: () =>
      new QueryObserver(ctx.queryClient, options as never).subscribe(
        () => undefined,
      ),
    data: () => ctx.queryClient.getQueryData(options.queryKey),
    fetchStatus: () =>
      ctx.queryClient.getQueryState(options.queryKey)?.fetchStatus,
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

describe('a query that streams', () => {
  test('a refetch stops the older stream from writing to the query', async () => {
    await using t = testContext();
    const unsubscribe = t.observe();
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const [older] = t.calls;
    older!.answer();
    await t.sendChunk(older!, 'a1');
    await vi.waitFor(() => expect(t.data()).toEqual(['a1']));

    const refetch = t.queryClient.invalidateQueries({
      queryKey: t.options.queryKey,
    });
    await vi.waitFor(() => expect(t.calls).toHaveLength(2));
    const newer = t.calls[1]!;
    newer.answer();
    await t.sendChunk(newer, 'b1');
    await vi.waitFor(() => expect(t.data()).toEqual(['b1']));
    newer.next('end');
    await refetch;
    expect(t.fetchStatus()).toBe('idle');

    await t.sendChunk(older!, 'a2');
    expect(t.data()).toEqual(['b1']);
    unsubscribe();
  });

  test('a refetch leaves the older stream running to its end on the server', async () => {
    await using t = testContext();
    const unsubscribe = t.observe();
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const [older] = t.calls;
    older!.answer();
    await t.sendChunk(older!, 'a1');

    const refetch = t.queryClient.invalidateQueries({
      queryKey: t.options.queryKey,
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
    unsubscribe();
  });

  test('cancelQueries leaves the stream running to its end on the server', async () => {
    await using t = testContext();
    const unsubscribe = t.observe();
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const [call] = t.calls;
    call!.answer();
    await t.sendChunk(call!, 'a1');

    await t.queryClient.cancelQueries({ queryKey: t.options.queryKey });

    await t.sendChunk(call!, 'a2');
    await t.sendChunk(call!, 'a3');
    call!.next('end');
    await vi.waitFor(() => expect(call!.finished).toBe(true));
    expect(call!.signal?.aborted).toBe(false);
    unsubscribe();
  });

  test('one options object on two QueryClients at once gives each its whole stream', async () => {
    await using t = testContext();
    const first = new QueryClient();
    const second = new QueryClient();
    const fetchingFirst = first.fetchQuery(t.options as never);
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const fetchingSecond = second.fetchQuery(t.options as never);
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
    expect(first.getQueryData(t.options.queryKey)).toEqual(['a1', 'a2']);
    expect(second.getQueryData(t.options.queryKey)).toEqual(['b1', 'b2']);
  });

  test('one options object on two QueryClients at once streams into each', async () => {
    await using t = testContext();
    const first = new QueryClient();
    const second = new QueryClient();
    const fetchingFirst = first.fetchQuery(t.options as never);
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const fetchingSecond = second.fetchQuery(t.options as never);
    await vi.waitFor(() => expect(t.calls).toHaveLength(2));
    const [callFirst, callSecond] = t.calls;
    callFirst!.answer();
    callSecond!.answer();

    await t.sendChunk(callFirst!, 'a1');
    await t.sendChunk(callSecond!, 'b1');
    expect(first.getQueryData(t.options.queryKey)).toEqual(['a1']);
    expect(second.getQueryData(t.options.queryKey)).toEqual(['b1']);

    callFirst!.next('end');
    callSecond!.next('end');
    await Promise.all([fetchingFirst, fetchingSecond]);
  });

  test('a query with its own queryHash gets its whole stream', async () => {
    await using t = testContext();
    const fetching = t.queryClient.fetchQuery({
      ...t.options,
      queryHash: 'mine',
    } as never);
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const [call] = t.calls;
    call!.answer();

    await t.serverChunk(call!);
    await t.serverChunk(call!);
    call!.next('end');

    await expect(fetching).resolves.toEqual(['a1', 'a2']);
    expect(t.queryClient.getQueryCache().get('mine')?.state.data).toEqual([
      'a1',
      'a2',
    ]);
  });

  test('streams into a query with its own queryHash', async () => {
    await using t = testContext();
    const fetching = t.queryClient.fetchQuery({
      ...t.options,
      queryHash: 'mine',
    } as never);
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const [call] = t.calls;
    call!.answer();

    await t.sendChunk(call!, 'a1');
    expect(t.queryClient.getQueryCache().get('mine')?.state.data).toEqual([
      'a1',
    ]);
    expect(t.queryClient.getQueryCache().getAll()).toHaveLength(1);

    call!.next('end');
    await fetching;
  });

  test('one key array under two queryHashes at once gives each its whole stream', async () => {
    await using t = testContext();
    const fetchingFirst = t.queryClient.fetchQuery({
      ...t.options,
      queryHash: 'first',
    } as never);
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const fetchingSecond = t.queryClient.fetchQuery({
      ...t.options,
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
    const cache = t.queryClient.getQueryCache();
    expect(cache.get('first')?.state.data).toEqual(['a1', 'a2']);
    expect(cache.get('second')?.state.data).toEqual(['b1', 'b2']);
  });

  test('one key array at its hash and under its own queryHash at once keeps the streams apart', async () => {
    await using t = testContext();
    const fetchingAtHash = t.queryClient.fetchQuery(t.options as never);
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const fetchingOwn = t.queryClient.fetchQuery({
      ...t.options,
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
    expect(t.data()).toEqual(['a1']);
    expect(ownData()).toEqual(['b1']);
  });

  test('a query with its own queryHash removed before it streams leaves the query at the key hash its own result', async () => {
    await using t = testContext();
    const fetchingAtHash = t.queryClient.fetchQuery(t.options as never);
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const fetchingOwn = t.queryClient
      .fetchQuery({ ...t.options, queryHash: 'mine' } as never)
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

  test('an older request that answers after removeQueries stays out of the new query', async () => {
    await using t = testContext();
    const fetchingOlder = t.queryClient
      .fetchQuery(t.options as never)
      .catch(() => 'cancelled');
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));

    t.queryClient.removeQueries({ queryKey: t.options.queryKey });
    // a fresh object, as a render makes
    const fetchingNewer = t.queryClient.fetchQuery(
      t.optionsProxyClient.stream.queryOptions() as never,
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
    await expect(fetchingOlder).resolves.toBe('cancelled');
    expect(t.data()).toEqual(['b1']);
  });

  test('an older request that answers after clear stays out of the new query', async () => {
    await using t = testContext();
    const fetchingOlder = t.queryClient
      .fetchQuery(t.options as never)
      .catch(() => 'cancelled');
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));

    t.queryClient.clear();
    const fetchingNewer = t.queryClient.fetchQuery(
      t.optionsProxyClient.stream.queryOptions() as never,
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
    await expect(fetchingOlder).resolves.toBe('cancelled');
  });

  test('cancelQueries before the request answers leaves the data alone', async () => {
    await using t = testContext();
    t.queryClient.setQueryData(t.options.queryKey, ['seed']);
    const unsubscribe = t.observe();
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));

    await t.queryClient.cancelQueries({ queryKey: t.options.queryKey });

    const [call] = t.calls;
    call!.answer();
    await t.sendChunk(call!, 'a1');
    expect(t.data()).toEqual(['seed']);
    unsubscribe();
  });

  test('the current stream failing reports its error', async () => {
    await using t = testContext();
    const fetching = t.queryClient.fetchQuery(t.options as never);
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const [call] = t.calls;
    call!.answer();
    await t.sendChunk(call!, 'a1');

    call!.next('fail');

    await expect(fetching).rejects.toThrow('a failed');
    expect(t.queryClient.getQueryState(t.options.queryKey)).toMatchObject({
      status: 'error',
      fetchStatus: 'idle',
      data: ['a1'],
    });
  });

  test('an older request that answers last does not take over', async () => {
    await using t = testContext();
    t.queryClient.setQueryData(t.options.queryKey, ['seed']);
    const unsubscribe = t.observe();
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const [older] = t.calls;

    const refetch = t.queryClient.invalidateQueries({
      queryKey: t.options.queryKey,
    });
    await vi.waitFor(() => expect(t.calls).toHaveLength(2));
    const newer = t.calls[1]!;
    newer.answer();
    await t.sendChunk(newer, 'b1');
    await vi.waitFor(() => expect(t.data()).toEqual(['b1']));

    older!.answer();
    await t.sendChunk(older!, 'a1');
    expect(t.data()).toEqual(['b1']);

    await t.sendChunk(newer, 'b2');
    await vi.waitFor(() => expect(t.data()).toEqual(['b1', 'b2']));
    newer.next('end');
    await refetch;
    expect(t.data()).toEqual(['b1', 'b2']);
    unsubscribe();
  });

  test('cancelQueries stops the stream from overwriting an optimistic update', async () => {
    await using t = testContext();
    const unsubscribe = t.observe();
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const [call] = t.calls;
    call!.answer();
    await t.sendChunk(call!, 'a1');
    await vi.waitFor(() => expect(t.data()).toEqual(['a1']));

    await t.queryClient.cancelQueries({ queryKey: t.options.queryKey });
    t.queryClient.setQueryData(t.options.queryKey, ['optimistic']);

    await t.sendChunk(call!, 'a2');
    expect(t.data()).toEqual(['optimistic']);
    unsubscribe();
  });

  test('an older stream that fails after the newer one finished changes nothing', async () => {
    await using t = testContext();
    const unsubscribe = t.observe();
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const [older] = t.calls;
    older!.answer();
    await t.sendChunk(older!, 'a1');
    await vi.waitFor(() => expect(t.data()).toEqual(['a1']));

    const refetch = t.queryClient.invalidateQueries({
      queryKey: t.options.queryKey,
    });
    await vi.waitFor(() => expect(t.calls).toHaveLength(2));
    const newer = t.calls[1]!;
    newer.answer();
    await t.sendChunk(newer, 'b1');
    newer.next('end');
    await refetch;

    older!.next('fail');
    await vi.waitFor(() => expect(t.failed).toHaveLength(1));
    const state = t.queryClient.getQueryState(t.options.queryKey);
    expect(state).toMatchObject({
      status: 'success',
      fetchStatus: 'idle',
      data: ['b1'],
      error: null,
    });
    unsubscribe();
  });

  test('keeps streaming into the cache after the last observer leaves', async () => {
    await using t = testContext();
    const unsubscribe = t.observe();
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const [call] = t.calls;
    call!.answer();
    await t.sendChunk(call!, 'a1');

    unsubscribe();

    await t.sendChunk(call!, 'a2');
    await vi.waitFor(() => expect(t.data()).toEqual(['a1', 'a2']));
    call!.next('end');
    await vi.waitFor(() => expect(t.fetchStatus()).toBe('idle'));
    expect(t.data()).toEqual(['a1', 'a2']);
  });

  test('streams into a query with its own queryKeyHashFn', async () => {
    await using t = testContext();
    const fetching = t.queryClient.fetchQuery({
      ...t.options,
      queryKeyHashFn: () => 'custom-hash',
    } as never);
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const [call] = t.calls;
    call!.answer();
    await t.sendChunk(call!, 'a1');
    await vi.waitFor(() =>
      expect(
        t.queryClient.getQueryCache().get('custom-hash')?.state.data,
      ).toEqual(['a1']),
    );
    call!.next('end');
    await expect(fetching).resolves.toEqual(['a1']);
    expect(t.queryClient.getQueryCache().getAll()).toHaveLength(1);
  });

  test('streams into a query with its own queryKeyHashFn when the client default throws', async () => {
    await using t = testContext();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          queryKeyHashFn: () => {
            throw new Error('this client hashes no tRPC keys');
          },
        },
      },
    });
    const fetching = queryClient.fetchQuery({
      ...t.options,
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

  test('streams into the QueryClient that runs the fetch', async () => {
    await using t = testContext();
    // the proxy's own client has this query too, and it's idle
    t.queryClient.setQueryData(t.options.queryKey, ['other']);
    const queryClient = new QueryClient();
    const fetching = queryClient.fetchQuery(t.options as never);
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const [call] = t.calls;
    call!.answer();
    await t.sendChunk(call!, 'a1');
    await vi.waitFor(() =>
      expect(queryClient.getQueryData(t.options.queryKey)).toEqual(['a1']),
    );
    await t.sendChunk(call!, 'a2');
    await vi.waitFor(() =>
      expect(queryClient.getQueryData(t.options.queryKey)).toEqual([
        'a1',
        'a2',
      ]),
    );
    call!.next('end');
    await expect(fetching).resolves.toEqual(['a1', 'a2']);
    expect(t.data()).toEqual(['other']);
  });

  test('a query function called with a context that has no client writes as before', async () => {
    await using t = testContext();
    const queryFn = t.options.queryFn as unknown as (
      context: object,
    ) => Promise<unknown>;
    const fetching = queryFn({
      queryKey: t.options.queryKey,
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
