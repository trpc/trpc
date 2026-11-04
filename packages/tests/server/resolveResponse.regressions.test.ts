// @vitest-environment node
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import {
  createTRPCClient,
  createTRPCUntypedClient,
  httpLink,
  TRPCClientError,
} from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import { initTRPC, TRPCError } from '@trpc/server';
import type { FetchHandlerRequestOptions } from '@trpc/server/adapters/fetch';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import {
  lazy,
  makeAsyncResource,
  makeResource,
} from '@trpc/server/unstable-core-do-not-import';
import { serve } from 'srvx';
import { z } from 'zod';

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

test('a subscription that fails before it streams calls onError once', async () => {
  const t = initTRPC.create();
  const router = t.router({
    onEvent: t.procedure
      .use(() => {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in' });
      })
      .subscription(async function* () {
        yield 1;
      }),
  });
  await using ctx = testServerAndClientResource(router);

  const onError = vi.fn();
  const subscription = ctx.client.onEvent.subscribe(undefined, { onError });
  using _subscription = makeResource(subscription, () =>
    subscription.unsubscribe(),
  );

  await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
  expect(onError.mock.calls[0]![0]).toBeInstanceOf(TRPCClientError);
  expect(onError.mock.calls[0]![0].data).toMatchObject({
    code: 'UNAUTHORIZED',
  });
  expect(ctx.onErrorSpy).toHaveBeenCalledTimes(1);
  expect(ctx.onErrorSpy.mock.calls[0]![0]).toMatchObject({
    path: 'onEvent',
    type: 'subscription',
    error: { code: 'UNAUTHORIZED' },
  });
});

describe('a stream returned without httpBatchStreamLink is an error of its call', () => {
  function streamRouter() {
    const t = initTRPC.create();
    return t.router({
      stream: t.procedure
        .input(z.object({ id: z.number() }))
        .query(async function* () {
          yield 1;
        }),
      hello: t.procedure.query(() => 'world'),
    });
  }

  test('over httpLink', async () => {
    await using ctx = testServerAndClientResource(streamRouter(), {
      clientLink: 'httpLink',
    });

    const error = await waitError(
      ctx.client.stream.query({ id: 1 }),
      TRPCClientError,
    );

    expect(error.data).toMatchObject({
      code: 'UNSUPPORTED_MEDIA_TYPE',
      httpStatus: 415,
      path: 'stream',
    });
    expect(ctx.onErrorSpy).toHaveBeenCalledTimes(1);
    expect(ctx.onErrorSpy.mock.calls[0]![0]).toMatchObject({
      path: 'stream',
      input: { id: 1 },
      type: 'query',
      error: { code: 'UNSUPPORTED_MEDIA_TYPE' },
    });
  });

  test('over httpBatchLink', async () => {
    await using ctx = testServerAndClientResource(streamRouter(), {
      clientLink: 'httpBatchLink',
    });

    const [stream, hello] = await Promise.allSettled([
      ctx.client.stream.query({ id: 1 }),
      ctx.client.hello.query(),
    ]);

    expect(hello).toEqual({ status: 'fulfilled', value: 'world' });
    expect(stream.status).toBe('rejected');
    const error = (stream as PromiseRejectedResult).reason;
    expect(error).toBeInstanceOf(TRPCClientError);
    expect(error.data).toMatchObject({
      code: 'UNSUPPORTED_MEDIA_TYPE',
      path: 'stream',
    });
    expect(ctx.onErrorSpy).toHaveBeenCalledTimes(1);
    expect(ctx.onErrorSpy.mock.calls[0]![0]).toMatchObject({
      path: 'stream',
      input: { id: 1 },
      type: 'query',
      error: { code: 'UNSUPPORTED_MEDIA_TYPE' },
    });
  });
});

describe('responseMeta runs once', () => {
  test('when the response fails to serialize', async () => {
    const t = initTRPC.create();
    const router = t.router({
      // `JSON.stringify` throws on a bigint
      big: t.procedure.query(() => 1n as unknown as number),
    });
    const responseMeta = vi.fn(() => ({
      headers: new Headers([['x-meta', 'yes']]),
    }));
    const recorder = recordingFetch();
    await using ctx = testServerAndClientResource(router, {
      server: { responseMeta },
      client: ({ httpUrl }) => ({
        links: [httpLink({ url: httpUrl, fetch: recorder.fetch })],
      }),
    });

    const error = await waitError(ctx.client.big.query(), TRPCClientError);

    expect(error.data).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      httpStatus: 500,
    });
    expect(responseMeta).toHaveBeenCalledTimes(1);
    expect(responseMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: [expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR' })],
      }),
    );
    const [res] = recorder.responses;
    expect(res!.status).toBe(500);
    expect(res!.headers.get('x-meta')).toBe('yes');
    expect(res!.headers.get('content-type')).toBe('application/json');
    expect(ctx.onErrorSpy).toHaveBeenCalledTimes(1);
  });

  test('when the response fails after responseMeta added headers', async () => {
    const t = initTRPC.create();
    const router = t.router({
      hello: t.procedure.query(() => 'world'),
    });
    const responseMeta = vi.fn(() => ({
      // `new Response()` throws a `RangeError` outside 200-599
      status: 999,
      headers: new Headers([['x-meta', 'yes']]),
    }));
    const recorder = recordingFetch();
    await using ctx = testServerAndClientResource(router, {
      server: { responseMeta },
      client: ({ httpUrl }) => ({
        links: [httpLink({ url: httpUrl, fetch: recorder.fetch })],
      }),
    });

    const error = await waitError(ctx.client.hello.query(), TRPCClientError);

    expect(error.data).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      httpStatus: 500,
    });
    expect(responseMeta).toHaveBeenCalledTimes(1);
    const [res] = recorder.responses;
    expect(res!.status).toBe(500);
    expect(res!.headers.get('x-meta')).toBeNull();
    expect(ctx.onErrorSpy).toHaveBeenCalledTimes(1);
  });

  test('when responseMeta throws', async () => {
    const t = initTRPC.create();
    const router = t.router({
      hello: t.procedure.query(() => 'world'),
    });
    const responseMeta = vi.fn((): never => {
      throw new Error('responseMeta failed');
    });
    const recorder = recordingFetch();
    await using ctx = testServerAndClientResource(router, {
      server: { responseMeta },
      client: ({ httpUrl }) => ({
        links: [httpLink({ url: httpUrl, fetch: recorder.fetch })],
      }),
    });

    const error = await waitError(ctx.client.hello.query(), TRPCClientError);

    expect(error.message).toBe('responseMeta failed');
    expect(error.data).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      httpStatus: 500,
    });
    expect(responseMeta).toHaveBeenCalledTimes(1);
    expect(recorder.responses.map((res) => res.status)).toEqual([500]);
    expect(ctx.onErrorSpy).toHaveBeenCalledTimes(1);
  });
});

test("a single call's error gets its procedure's type", async () => {
  const t = initTRPC.create({
    errorFormatter: ({ shape, type }) => ({
      ...shape,
      data: { ...shape.data, type },
    }),
  });
  const router = t.router({
    upload: t.procedure.input(z.instanceof(FormData)).query(() => {
      throw new TRPCError({ code: 'CONFLICT', message: 'Already uploaded' });
    }),
  });
  await using ctx = testServerAndClientResource(router, {
    server: { allowMethodOverride: true },
    client: ({ httpUrl }) => ({
      links: [httpLink({ url: httpUrl, methodOverride: 'POST' })],
    }),
  });

  // form data is always parsed as a `mutation` request
  const error = await waitError(
    ctx.client.upload.query(new FormData()),
    TRPCClientError,
  );

  expect(error.data).toMatchObject({
    code: 'CONFLICT',
    path: 'upload',
    type: 'query',
  });
  expect(ctx.onErrorSpy).toHaveBeenCalledTimes(1);
  expect(ctx.onErrorSpy.mock.calls[0]![0]).toMatchObject({ type: 'query' });
});

describe('a request that cannot be parsed gets an error response', () => {
  test.each([
    ['multipart/form-data', 'formData'],
    ['application/octet-stream', 'binary'],
  ])('a GET request with a %s body', async (contentType, path) => {
    const t = initTRPC.create();
    const handler = vi.fn(() => 'never');
    const router = t.router({
      formData: t.procedure.query(handler),
      binary: t.procedure.query(handler),
    });
    await using ctx = testServerAndClientResource(router, {
      client: ({ httpUrl }) => ({
        links: [
          httpLink({ url: httpUrl, headers: { 'content-type': contentType } }),
        ],
      }),
    });

    const error = await waitError(
      path === 'formData'
        ? ctx.client.formData.query()
        : ctx.client.binary.query(),
      TRPCClientError,
    );

    expect(error.message).toBe(
      `Only POST requests are supported for ${contentType} requests`,
    );
    expect(error.data).toMatchObject({
      code: 'METHOD_NOT_SUPPORTED',
      httpStatus: 405,
    });
    expect(error.data).not.toHaveProperty('path');
    expect(handler).not.toHaveBeenCalled();
    expect(ctx.onErrorSpy).toHaveBeenCalledTimes(1);
    expect(ctx.onErrorSpy.mock.calls[0]![0]).toMatchObject({
      type: 'unknown',
      path: undefined,
    });
  });

  test('a call to a lazy router that fails to load', async () => {
    const t = initTRPC.create();
    const router = t.router({
      admin: lazy(async () => {
        throw new Error('Could not load the admin router');
      }),
    });
    await using ctx = testServerAndClientResource(router);
    const client = createTRPCUntypedClient({
      links: [httpLink({ url: ctx.httpUrl })],
    });

    const error = await waitError(client.query('admin.stats'), TRPCClientError);

    expect(error.message).toBe('Could not load the admin router');
    expect(error.data).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      httpStatus: 500,
    });
    expect(ctx.onErrorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('an error response after responseMeta ran drops its headers', () => {
  function responseMeta(status: number) {
    return () => ({
      status,
      headers: new Headers([
        ['x-meta', 'yes'],
        ['cache-control', 's-maxage=60'],
      ]),
    });
  }

  test.each([
    ['httpLink', 'query', 304],
    ['httpBatchStreamLink', 'query', 999],
    ['httpSubscriptionLink', 'subscription', 999],
  ] as const)('over %s', async (clientLink, type, status) => {
    const t = initTRPC.create();
    const router = t.router({
      hello: t.procedure.query(() => 'world'),
      onEvent: t.procedure.subscription(async function* () {
        yield 1;
      }),
    });
    // read on the server, as an `EventSource` doesn't expose the response
    const sent: { status: number; headers: Record<string, unknown> }[] = [];
    await using ctx = testServerAndClientResource(router, {
      clientLink,
      server: {
        responseMeta: responseMeta(status),
        createContext: ({ res }) => {
          res.setHeader('set-cookie', 'session=1');
          return {};
        },
        middleware: (_req, res, next) => {
          res.once('finish', () => {
            sent.push({ status: res.statusCode, headers: res.getHeaders() });
          });
          next();
        },
      },
    });

    if (type === 'query') {
      await ctx.client.hello.query().catch(() => null);
    } else {
      const subscription = ctx.client.onEvent.subscribe(undefined, {
        onError: () => null,
      });
      using _subscription = makeResource(subscription, () =>
        subscription.unsubscribe(),
      );
      await vi.waitFor(() => expect(sent.length).toBeGreaterThan(0));
    }

    expect({ ...sent[0] }).toEqual({
      status: 500,
      headers: {
        'content-type': 'application/json',
        vary: 'trpc-accept, accept',
        'set-cookie': 'session=1',
      },
    });
  });

  describe('keeps the headers createContext set with the fetch adapter', () => {
    async function fetchServer(
      responseMeta: FetchHandlerRequestOptions<AnyTRPCRouter>['responseMeta'],
    ) {
      const t = initTRPC.create();
      const router = t.router({
        hello: t.procedure.query(() => 'world'),
      });
      const server = serve({
        port: 0,
        silent: true,
        fetch: (req) =>
          fetchRequestHandler({
            endpoint: '',
            req,
            router,
            createContext: ({ resHeaders }) => {
              resHeaders.append('set-cookie', 'session=1');
              return {};
            },
            responseMeta,
          }),
      });
      await server.ready();
      const recorder = recordingFetch();
      const client = createTRPCClient<typeof router>({
        links: [
          httpLink({
            url: server.url!.replace(/\/$/, ''),
            fetch: recorder.fetch,
          }),
        ],
      });
      return makeAsyncResource({ client, responses: recorder.responses }, () =>
        server.close(),
      );
    }

    test('when responseMeta returns a status Response rejects', async () => {
      await using ctx = await fetchServer(responseMeta(999));

      await waitError(ctx.client.hello.query(), TRPCClientError);

      const [res] = ctx.responses;
      expect(res!.status).toBe(500);
      expect(res!.headers.getSetCookie()).toEqual(['session=1']);
      expect(res!.headers.get('x-meta')).toBeNull();
      expect(res!.headers.get('cache-control')).toBeNull();
      expect(res!.headers.get('content-type')).toBe('application/json');
    });

    test('when responseMeta throws', async () => {
      await using ctx = await fetchServer(() => {
        throw new Error('responseMeta failed');
      });

      await waitError(ctx.client.hello.query(), TRPCClientError);

      const [res] = ctx.responses;
      expect(res!.status).toBe(500);
      expect(res!.headers.getSetCookie()).toEqual(['session=1']);
    });

    test('and with responseMeta on a response that succeeds', async () => {
      await using ctx = await fetchServer(() => ({
        headers: new Headers([['x-meta', 'yes']]),
      }));

      expect(await ctx.client.hello.query()).toBe('world');

      const [res] = ctx.responses;
      expect(res!.status).toBe(200);
      expect(res!.headers.getSetCookie()).toEqual(['session=1']);
      expect(res!.headers.get('x-meta')).toBe('yes');
    });
  });
});
