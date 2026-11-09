import { retryLink, TRPCClientError, type TRPCLink } from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import { map, observable, share, tap } from '@trpc/server/observable';
import { Stream } from 'effect';
import {
  createTrpcClient,
  httpLink,
  link,
  routerType,
  TrpcError,
  type Operation,
} from '@trpc12/trpc/client';
import { fromV11Link } from '@trpc12/trpc/interop';
import { error, initTrpc } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import { z } from 'zod';
import { createTestServer } from '../fixtures/server.ts';

const t = initTrpc<{ ctx: { user: string | null } }>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let stopped = 0;

const router = t.router({
  whoami: t.procedure.query((opts) => opts.ctx.user),
  byId: t.procedure
    .input(z.object({ id: z.string() }))
    .query((opts) =>
      opts.input.id === '1'
        ? { id: '1' }
        : error({ code: 'NOT_FOUND', message: `No post ${opts.input.id}` }),
    ),
  ticks: t.procedure.subscription(() => Stream.make(1, 2, 3)),
  forever: t.procedure.subscription(async function* (opts) {
    try {
      for (let n = 0; !opts.signal.aborted; n++) {
        yield n;
        await sleep(5);
      }
    } finally {
      stopped++;
    }
  }),
});
type AppRouter = typeof router;

const serve = () =>
  createTestServer({
    router,
    createContext: (opts) => ({
      user: opts.request.headers['x-user'] ?? null,
    }),
  });

test('a v11 link changes the operation and taps results', async () => {
  await using server = await serve();
  const seen: unknown[] = [];
  const authLink: TRPCLink<AnyTRPCRouter> = () => (opts) =>
    opts
      .next({
        ...opts.op,
        context: { ...opts.op.context, headers: { 'x-user': 'kim' } },
      })
      .pipe(tap({ next: (envelope) => seen.push(envelope.result) }), share());
  const contexts: Operation['context'][] = [];
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      fromV11Link(authLink),
      link((opts) => {
        contexts.push(opts.op.context);
        return opts.next(opts.op);
      }),
      httpLink({ url: server.url }),
    ],
  });
  expect(await client.whoami.query()).toBe('kim');
  expect(seen).toEqual([{ type: 'data', data: 'kim' }]);
  expect(contexts).toEqual([{ headers: { 'x-user': 'kim' } }]);
});

test('a v11 link can answer without calling next', async () => {
  await using server = await serve();
  const cacheLink: TRPCLink<AnyTRPCRouter> = () => (opts) =>
    opts.op.path === 'whoami'
      ? observable((observer) => {
          observer.next({ result: { type: 'data', data: 'cached' } });
          observer.complete();
        })
      : opts.next(opts.op);
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [fromV11Link(cacheLink), httpLink({ url: server.url })],
  });
  expect(await client.whoami.query()).toBe('cached');
  expect(await client.byId.query({ id: '1' })).toEqual({ id: '1' });
});

test('errors: v12 errors reach the v11 link, v11 errors keep their code', async () => {
  await using server = await serve();
  const seen: unknown[] = [];
  const v11Link: TRPCLink<AnyTRPCRouter> = () => (opts) =>
    opts.op.path === 'whoami'
      ? observable((observer) => {
          observer.error(
            new TRPCClientError('No token', {
              result: {
                error: {
                  code: -32001,
                  message: 'No token',
                  data: { code: 'UNAUTHORIZED', httpStatus: 401 },
                },
              },
            } as never),
          );
        })
      : opts.next(opts.op).pipe(tap({ error: (e) => seen.push(e) }));
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [fromV11Link(v11Link), httpLink({ url: server.url })],
  });
  const notFound = await client.byId
    .query({ id: '2' })
    .catch((e: unknown) => e);
  expect(notFound).toBeInstanceOf(TrpcError);
  expect(notFound).toMatchObject({ code: 'NOT_FOUND', message: 'No post 2' });
  // Read as v11 links read a TRPCClientError; passed on, the v12 error itself.
  expect(seen).toMatchObject([
    {
      name: 'TRPCClientError',
      message: 'No post 2',
      data: { code: 'NOT_FOUND', httpStatus: 404, path: 'byId' },
      shape: { code: -32004, message: 'No post 2' },
      cause: notFound,
    },
  ]);
  await expect(client.whoami.query()).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
    message: 'No token',
    data: undefined,
    cause: { data: { code: 'UNAUTHORIZED', httpStatus: 401 } },
  });
});

test("v11's retryLink, as its docs configure it, retries only what v11 retried", async () => {
  await using server = await serve();
  let attempts = 0;
  const counting: TRPCLink<AnyTRPCRouter> = () => (opts) => {
    attempts++;
    return opts.next(opts.op);
  };
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      fromV11Link(
        retryLink({
          retry: (opts) => {
            if (
              opts.error.data &&
              opts.error.data.code !== 'INTERNAL_SERVER_ERROR'
            ) {
              return false;
            }
            return opts.op.type === 'query' && opts.attempts <= 3;
          },
        }),
      ),
      fromV11Link(counting),
      httpLink({ url: server.url }),
    ],
  });
  await expect(client.byId.query({ id: '2' })).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  expect(attempts).toBe(1);
});

test('an error a v11 link rewraps with TRPCClientError.from is still the v12 error', async () => {
  await using server = await serve();
  const rewrap: TRPCLink<AnyTRPCRouter> = () => (opts) =>
    observable((observer) =>
      opts.next(opts.op).subscribe({
        next: (value) => observer.next(value),
        error: (err) => observer.error(TRPCClientError.from(err)),
        complete: () => observer.complete(),
      }),
    );
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [fromV11Link(rewrap), httpLink({ url: server.url })],
  });
  await expect(client.byId.query({ id: '2' })).rejects.toMatchObject({
    code: 'NOT_FOUND',
    message: 'No post 2',
  });
});

test('subscriptions pass through v11 operators, and stop when the loop ends', async () => {
  await using server = await serve();
  const results: unknown[] = [];
  const timesTen: TRPCLink<AnyTRPCRouter> = () => (opts) =>
    opts.next(opts.op).pipe(
      tap({ next: (envelope) => results.push(envelope.result.type) }),
      map((envelope) =>
        envelope.result.type === 'data'
          ? {
              ...envelope,
              result: {
                ...envelope.result,
                data: (envelope.result.data as number) * 10,
              },
            }
          : envelope,
      ),
    );
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [fromV11Link(timesTen), httpLink({ url: server.url })],
  });
  const ticks: number[] = [];
  for await (const n of client.ticks.subscribe()) ticks.push(n);
  expect(ticks).toEqual([10, 20, 30]);
  expect(results).toEqual(['started', 'data', 'data', 'data']);

  const before = stopped;
  for await (const n of client.forever.subscribe()) {
    if (n >= 10) break;
  }
  await expect.poll(() => stopped).toBe(before + 1);
});
