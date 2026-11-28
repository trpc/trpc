import { EventEmitter, on } from 'node:events';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { suppressLogsUntil } from '@trpc/server/__tests__/suppressLogs';
import type { TRPCClientError } from '@trpc/client';
import { createTRPCClient, httpSSELink } from '@trpc/client';
import type { TRPCConnectionState } from '@trpc/client/unstable-internals';
import { initTRPC, tracked, TRPCError } from '@trpc/server';
import { makeResource } from '@trpc/server/unstable-core-do-not-import';
import { z } from 'zod';

type Context = { version: string | undefined };

function setup(opts: {
  allowMethodOverride: boolean;
  maxDurationMs: number | undefined;
}) {
  const ee = new EventEmitter();
  const onConnection =
    vi.fn<(args: { version: string | undefined; input: unknown }) => void>();
  const createContext = vi.fn<(version: string | undefined) => Context>(
    (version) => ({ version }),
  );

  const t = initTRPC
    .context<Context>()
    .create({ sse: { maxDurationMs: opts.maxDurationMs } });
  const router = t.router({
    numbers: t.procedure
      .input(z.object({ lastEventId: z.string().optional() }).optional())
      .subscription(async function* (opts) {
        onConnection({ version: opts.ctx.version, input: opts.input });
        for await (const [num] of on(ee, 'data', { signal: opts.signal })) {
          yield tracked(String(num), num as number);
        }
      }),
  });

  const ctx = testServerAndClientResource(router, {
    server: {
      allowMethodOverride: opts.allowMethodOverride,
      createContext(ctxOpts) {
        const header = ctxOpts.req.headers['x-version'];
        return createContext(typeof header === 'string' ? header : undefined);
      },
    },
  });

  return {
    ...ctx,
    onConnection,
    createContext,
    emit: (num: number) => ee.emit('data', num),
    listenerCount: () => ee.listenerCount('data'),
  };
}

test('runs `headers` again for each reconnect and resumes from the last event id', async () => {
  await using ctx = setup({
    allowMethodOverride: false,
    maxDurationMs: undefined,
  });
  let version = 0;
  const client = createTRPCClient<typeof ctx.router>({
    links: [
      httpSSELink({
        url: ctx.httpUrl,
        headers: () => ({ 'x-version': String(++version) }),
        reconnect: { delay: () => 0 },
      }),
    ],
  });

  const onData = vi.fn<(args: { id: string; data: number }) => void>();
  const sub = client.numbers.subscribe(undefined, { onData });
  using _sub = makeResource({}, () => sub.unsubscribe());

  await vi.waitFor(() => {
    expect(ctx.listenerCount()).toBe(1);
  });
  ctx.emit(1);
  await vi.waitFor(() => {
    expect(onData).toHaveBeenCalledTimes(1);
  });

  await suppressLogsUntil(async () => {
    ctx.destroyConnections();
    await vi.waitFor(() => {
      expect(ctx.onConnection).toHaveBeenCalledTimes(2);
    });
  });

  expect(ctx.onConnection.mock.calls.map((call) => call[0])).toEqual([
    { version: '1', input: undefined },
    { version: '2', input: { lastEventId: '1' } },
  ]);

  await vi.waitFor(() => {
    expect(ctx.listenerCount()).toBe(1);
  });
  ctx.emit(2);
  await vi.waitFor(() => {
    expect(onData).toHaveBeenCalledTimes(2);
  });
  expect(onData.mock.calls.map((call) => call[0])).toEqual([
    { id: '1', data: 1 },
    { id: '2', data: 2 },
  ]);
});

test('a non-retryable error ends the subscription without reconnecting', async () => {
  await using ctx = setup({
    allowMethodOverride: false,
    maxDurationMs: undefined,
  });
  ctx.createContext.mockImplementation(() => {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  });
  const client = createTRPCClient<typeof ctx.router>({
    links: [httpSSELink({ url: ctx.httpUrl, reconnect: { delay: () => 0 } })],
  });

  const onError = vi.fn<(err: TRPCClientError<typeof ctx.router>) => void>();
  client.numbers.subscribe(undefined, { onError });

  await vi.waitFor(() => {
    expect(onError).toHaveBeenCalledTimes(1);
  });
  expect(onError.mock.calls[0]![0].data?.code).toBe('UNAUTHORIZED');
  expect(ctx.createContext).toHaveBeenCalledTimes(1);
});

test('gives up after `reconnect.attempts` failed connections in a row', async () => {
  await using ctx = setup({
    allowMethodOverride: false,
    maxDurationMs: undefined,
  });
  ctx.createContext.mockImplementation(() => {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'down' });
  });
  const client = createTRPCClient<typeof ctx.router>({
    links: [
      httpSSELink({
        url: ctx.httpUrl,
        reconnect: { attempts: 2, delay: () => 0 },
      }),
    ],
  });

  const onError = vi.fn<(err: TRPCClientError<typeof ctx.router>) => void>();
  const onConnectionStateChange =
    vi.fn<
      (state: TRPCConnectionState<TRPCClientError<typeof ctx.router>>) => void
    >();
  await suppressLogsUntil(async () => {
    client.numbers.subscribe(undefined, { onError, onConnectionStateChange });
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });

  expect(onError.mock.calls[0]![0].data?.code).toBe('INTERNAL_SERVER_ERROR');
  // the first connection and 2 retries
  expect(ctx.createContext).toHaveBeenCalledTimes(3);
  const retries = onConnectionStateChange.mock.calls.filter(
    ([state]) => state.state === 'connecting' && state.error,
  );
  expect(retries).toHaveLength(2);
});

test('reads a JSON error response instead of the event stream', async () => {
  // the server doesn't accept POST subscriptions without `allowMethodOverride`
  await using ctx = setup({
    allowMethodOverride: false,
    maxDurationMs: undefined,
  });
  const client = createTRPCClient<typeof ctx.router>({
    links: [
      httpSSELink({
        url: ctx.httpUrl,
        methodOverride: 'POST',
        reconnect: { delay: () => 0 },
      }),
    ],
  });

  const onError = vi.fn<(err: TRPCClientError<typeof ctx.router>) => void>();
  await suppressLogsUntil(async () => {
    client.numbers.subscribe(undefined, { onError });
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });

  expect(onError.mock.calls[0]![0].data?.code).toBe('METHOD_NOT_SUPPORTED');
  expect(onError.mock.calls[0]![0].data?.httpStatus).toBe(405);
});

test('`methodOverride: POST` sends the input in the body', async () => {
  await using ctx = setup({
    allowMethodOverride: true,
    maxDurationMs: undefined,
  });
  const client = createTRPCClient<typeof ctx.router>({
    links: [httpSSELink({ url: ctx.httpUrl, methodOverride: 'POST' })],
  });

  const onData = vi.fn<(args: { id: string; data: number }) => void>();
  const sub = client.numbers.subscribe({ lastEventId: '5' }, { onData });
  using _sub = makeResource({}, () => sub.unsubscribe());

  await vi.waitFor(() => {
    expect(ctx.listenerCount()).toBe(1);
  });
  expect(ctx.onConnection.mock.calls[0]![0].input).toEqual({
    lastEventId: '5',
  });
  ctx.emit(6);
  await vi.waitFor(() => {
    expect(onData).toHaveBeenCalledTimes(1);
  });
});

test('a stream the server ends reconnects without counting as a failure', async () => {
  await using ctx = setup({ allowMethodOverride: false, maxDurationMs: 50 });
  const client = createTRPCClient<typeof ctx.router>({
    links: [
      httpSSELink({
        url: ctx.httpUrl,
        // any failure would end the subscription
        reconnect: { attempts: 0 },
      }),
    ],
  });

  const onError = vi.fn();
  const sub = client.numbers.subscribe(undefined, { onError });
  using _sub = makeResource({}, () => sub.unsubscribe());

  // each response ends at `maxDurationMs` without the `return` event
  await vi.waitFor(() => {
    expect(ctx.onConnection.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
  expect(onError).not.toHaveBeenCalled();
});

test('retries an error response that is not a tRPC error', async () => {
  await using ctx = setup({
    allowMethodOverride: false,
    maxDurationMs: undefined,
  });
  // a proxy's error, shaped like a tRPC error response but without a code
  const fetchSpy = vi.fn(
    async () =>
      new Response(JSON.stringify({ error: { message: 'Bad gateway' } }), {
        status: 502,
      }),
  );
  const client = createTRPCClient<typeof ctx.router>({
    links: [
      httpSSELink({
        url: ctx.httpUrl,
        fetch: fetchSpy,
        reconnect: { attempts: 2, delay: () => 0 },
      }),
    ],
  });

  const onError = vi.fn<(err: TRPCClientError<typeof ctx.router>) => void>();
  client.numbers.subscribe(undefined, { onError });

  await vi.waitFor(() => {
    expect(onError).toHaveBeenCalledTimes(1);
  });
  expect(onError.mock.calls[0]![0].message).toBe(
    'The subscription request failed with an unexpected response',
  );
  // the first request and 2 retries
  expect(fetchSpy).toHaveBeenCalledTimes(3);
});

test('runs a `url` function again for each reconnect', async () => {
  await using ctx = setup({
    allowMethodOverride: false,
    maxDurationMs: undefined,
  });
  const url = vi.fn(async () => ctx.httpUrl);
  const client = createTRPCClient<typeof ctx.router>({
    links: [httpSSELink({ url, reconnect: { delay: () => 0 } })],
  });

  const sub = client.numbers.subscribe(undefined, { onData: vi.fn() });
  using _sub = makeResource({}, () => sub.unsubscribe());

  await vi.waitFor(() => {
    expect(ctx.onConnection).toHaveBeenCalledTimes(1);
  });
  await suppressLogsUntil(async () => {
    ctx.destroyConnections();
    await vi.waitFor(() => {
      expect(ctx.onConnection).toHaveBeenCalledTimes(2);
    });
  });
  expect(url).toHaveBeenCalledTimes(2);
});
