import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import { httpLink, TRPCClientError } from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import { makeResource } from '@trpc/server/unstable-core-do-not-import';
import { z } from 'zod';

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
    expect(res!.headers.get('x-meta')).toBe('yes');
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
