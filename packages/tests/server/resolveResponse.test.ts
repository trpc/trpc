import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import type { TRPCLink } from '@trpc/client';
import {
  createTRPCUntypedClient,
  httpBatchLink,
  httpBatchStreamLink,
  httpLink,
  TRPCClientError,
} from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import { initTRPC, TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { makeResource } from '@trpc/server/unstable-core-do-not-import';

/**
 * A `fetch` for links that keeps every response it gets, to check the
 * status and headers the server sent.
 */
function recordingFetch() {
  const responses: Response[] = [];
  return {
    responses,
    fetch: async (...args: Parameters<typeof fetch>) => {
      const res = await fetch(...args);
      responses.push(res);
      return res;
    },
  };
}

function untypedClient(link: TRPCLink<AnyTRPCRouter>) {
  return createTRPCUntypedClient<AnyTRPCRouter>({ links: [link] });
}

describe('httpLink', () => {
  test('rejects a query that returns a stream', async () => {
    const t = initTRPC.create();
    const router = t.router({
      stream: t.procedure.query(async function* () {
        yield 1;
      }),
    });
    await using ctx = testServerAndClientResource(router, {
      clientLink: 'httpLink',
    });

    const error = await waitError(ctx.client.stream.query(), TRPCClientError);

    expect(error.message).toBe(
      'Cannot use stream-like response in non-streaming request - use httpBatchStreamLink',
    );
    expect(error.data).toMatchObject({
      code: 'UNSUPPORTED_MEDIA_TYPE',
      httpStatus: 415,
    });
    expect(ctx.onErrorSpy).toHaveBeenCalledTimes(1);
    expect(ctx.onErrorSpy.mock.calls[0]![0].error.code).toBe(
      'UNSUPPORTED_MEDIA_TYPE',
    );
  });

  test('rejects a streaming request that is not batched', async () => {
    const t = initTRPC.create();
    const hello = vi.fn(() => 'world');
    const router = t.router({
      hello: t.procedure.query(hello),
    });
    await using ctx = testServerAndClientResource(router, {
      client: ({ httpUrl }) => ({
        links: [
          httpLink({
            url: httpUrl,
            headers: { 'trpc-accept': 'application/jsonl' },
          }),
        ],
      }),
    });

    const error = await waitError(ctx.client.hello.query(), TRPCClientError);

    expect(error.message).toBe(
      'Streaming requests must be batched (you can do a batch of 1)',
    );
    expect(error.data).toMatchObject({ code: 'BAD_REQUEST', httpStatus: 400 });
    expect(hello).not.toHaveBeenCalled();
  });

  test('responds with the error the adapter passes', async () => {
    const t = initTRPC.create();
    const hello = vi.fn(() => 'world');
    const router = t.router({
      hello: t.procedure.query(hello),
    });
    await using ctx = testServerAndClientResource(router, {
      clientLink: 'httpLink',
      server: {
        middleware: (_req, _res, next) => {
          next(new TRPCError({ code: 'FORBIDDEN', message: 'Go away' }));
        },
      },
    });

    const error = await waitError(ctx.client.hello.query(), TRPCClientError);

    expect(error.message).toBe('Go away');
    expect(error.data).toMatchObject({ code: 'FORBIDDEN', httpStatus: 403 });
    expect(hello).not.toHaveBeenCalled();
    expect(ctx.onErrorSpy).toHaveBeenCalledTimes(1);
    expect(ctx.onErrorSpy.mock.calls[0]![0]).toMatchObject({
      path: 'hello',
      type: 'query',
    });
  });
});

describe('responseMeta', () => {
  test('sets the status', async () => {
    const t = initTRPC.create();
    const router = t.router({
      hello: t.procedure.query(() => 'world'),
    });
    const recorder = recordingFetch();
    await using ctx = testServerAndClientResource(router, {
      server: {
        responseMeta: () => ({ status: 202 }),
      },
      client: ({ httpUrl }) => ({
        links: [httpLink({ url: httpUrl, fetch: recorder.fetch })],
      }),
    });

    expect(await ctx.client.hello.query()).toBe('world');
    expect(recorder.responses.map((res) => res.status)).toEqual([202]);
  });

  test('skips deprecated header values that are not strings or arrays', async () => {
    const t = initTRPC.create();
    const router = t.router({
      hello: t.procedure.query(() => 'world'),
    });
    const recorder = recordingFetch();
    await using ctx = testServerAndClientResource(router, {
      server: {
        responseMeta: () => ({
          headers: { 'x-set': 'yes', 'x-unset': undefined },
        }),
      },
      client: ({ httpUrl }) => ({
        links: [httpLink({ url: httpUrl, fetch: recorder.fetch })],
      }),
    });

    expect(await ctx.client.hello.query()).toBe('world');
    const [res] = recorder.responses;
    expect(res!.headers.get('x-set')).toBe('yes');
    expect(res!.headers.has('x-unset')).toBe(false);
  });

  test('gets an unknown type when no procedure is found', async () => {
    const t = initTRPC.create();
    const router = t.router({
      hello: t.procedure.query(() => 'world'),
    });
    const responseMeta = vi.fn(() => ({}));
    await using ctx = testServerAndClientResource(router, {
      server: { responseMeta },
    });
    const client = untypedClient(httpLink({ url: ctx.httpUrl }));

    const error = await waitError(client.query('missing'), TRPCClientError);

    expect(error.data).toMatchObject({ code: 'NOT_FOUND', httpStatus: 404 });
    expect(responseMeta).toHaveBeenCalledTimes(1);
    expect(responseMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'unknown',
        paths: ['missing'],
        eagerGeneration: false,
        errors: [expect.objectContaining({ code: 'NOT_FOUND' })],
      }),
    );
  });
});

describe('httpBatchLink', () => {
  test('rejects a batched subscription call', async () => {
    const t = initTRPC.create();
    const onEvent = vi.fn(async function* () {
      yield 1;
    });
    const router = t.router({
      onEvent: t.procedure.subscription(onEvent),
    });
    await using ctx = testServerAndClientResource(router);
    const client = untypedClient(httpBatchLink({ url: ctx.httpUrl }));

    const error = await waitError(client.query('onEvent'), TRPCClientError);

    expect(error.message).toBe('Cannot batch subscription calls');
    expect(error.data).toMatchObject({ code: 'BAD_REQUEST', httpStatus: 400 });
    expect(onEvent).not.toHaveBeenCalled();
  });
});

describe('httpBatchStreamLink', () => {
  test('streams a query that returns an observable', async () => {
    const t = initTRPC.create();
    const router = t.router({
      numbers: t.procedure.query(() =>
        observable<number>((emit) => {
          emit.next(1);
          emit.next(2);
          emit.complete();
        }),
      ),
    });
    await using ctx = testServerAndClientResource(router);
    const client = untypedClient(httpBatchStreamLink({ url: ctx.httpUrl }));

    const iterable = (await client.query('numbers')) as AsyncIterable<number>;
    const values: number[] = [];
    for await (const value of iterable) {
      values.push(value);
    }

    expect(values).toEqual([1, 2]);
  });
});

describe('httpSubscriptionLink', () => {
  test('errors when SSE subscriptions are disabled', async () => {
    const t = initTRPC.create({ sse: { enabled: false } });
    const onEvent = vi.fn(async function* () {
      yield 1;
    });
    const router = t.router({
      onEvent: t.procedure.subscription(onEvent),
    });
    await using ctx = testServerAndClientResource(router);

    const onError = vi.fn();
    const onData = vi.fn();
    const subscription = ctx.client.onEvent.subscribe(undefined, {
      onError,
      onData,
    });
    using _subscription = makeResource(subscription, () =>
      subscription.unsubscribe(),
    );

    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    const error = onError.mock.calls[0]![0];
    expect(error).toBeInstanceOf(TRPCClientError);
    expect(error.message).toBe('Missing experimental flag "sseSubscriptions"');
    expect(error.data).toMatchObject({ code: 'METHOD_NOT_SUPPORTED' });
    expect(onData).not.toHaveBeenCalled();
    expect(ctx.onErrorSpy).toHaveBeenCalledTimes(1);
    expect(ctx.onErrorSpy.mock.calls[0]![0]).toMatchObject({
      path: 'onEvent',
      type: 'subscription',
    });
  });

  test('errors when a subscription returns neither an observable nor an async iterable', async () => {
    const t = initTRPC.create();
    const router = t.router({
      notIterable: t.procedure.subscription(
        () => 'not iterable' as unknown as AsyncIterable<string>,
      ),
    });
    await using ctx = testServerAndClientResource(router);

    // the client retries internal server errors, so check what the server reports
    const subscription = ctx.client.notIterable.subscribe(undefined, {
      onError: () => null,
    });
    using _subscription = makeResource(subscription, () =>
      subscription.unsubscribe(),
    );

    await vi.waitFor(() => expect(ctx.onErrorSpy).toHaveBeenCalled());
    expect(ctx.onErrorSpy.mock.calls[0]![0]).toMatchObject({
      path: 'notIterable',
      type: 'subscription',
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message:
          'Subscription notIterable did not return an observable or a AsyncGenerator',
      },
    });
  });

  test('cancels a subscription whose request ended before it responded', async () => {
    const t = initTRPC.create();
    const reached = vi.fn();
    const finished = vi.fn();
    const router = t.router({
      slow: t.procedure
        .use(async ({ signal, next }) => {
          reached();
          await new Promise((resolve) => {
            signal!.addEventListener('abort', resolve, { once: true });
          });
          return next();
        })
        .subscription(async function* () {
          try {
            while (true) {
              yield 1;
              await new Promise((resolve) => setTimeout(resolve, 5));
            }
          } finally {
            finished();
          }
        }),
    });
    await using ctx = testServerAndClientResource(router);

    const subscription = ctx.client.slow.subscribe(undefined, {
      onError: () => null,
    });
    await vi.waitFor(() => expect(reached).toHaveBeenCalledTimes(1));
    subscription.unsubscribe();

    await vi.waitFor(() => expect(finished).toHaveBeenCalledTimes(1));
    expect(ctx.onErrorSpy).not.toHaveBeenCalled();
  });
});
