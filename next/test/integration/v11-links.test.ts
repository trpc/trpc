import { TRPCClientError, type TRPCLink } from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import { map, observable, share, tap } from '@trpc/server/observable';
import { Stream } from 'effect';
import {
  createTrpcClient,
  httpLink,
  link,
  routerType,
  type Operation,
} from 'trpcdev/client';
import { fromV11Link } from 'trpcdev/interop';
import { error, initTrpc } from 'trpcdev/server';
import { expect, test } from 'vite-plus/test';
import { z } from 'zod';
import { createTestServer } from './fixtures/server.ts';

const t = initTrpc<{ ctx: { user: string | null } }>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let stopped = 0;

const router = {
  whoami: t.procedure.query(({ ctx }) => ctx.user),
  byId: t.procedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) =>
      input.id === '1'
        ? { id: '1' }
        : error({ code: 'NOT_FOUND', message: `No post ${input.id}` }),
    ),
  ticks: t.procedure.subscription(() => Stream.make(1, 2, 3)),
  forever: t.procedure.subscription(async function* ({ signal }) {
    try {
      for (let n = 0; !signal.aborted; n++) {
        yield n;
        await sleep(5);
      }
    } finally {
      stopped++;
    }
  }),
};
type AppRouter = typeof router;

const serve = () =>
  createTestServer({
    router,
    createContext: ({ request }) => ({
      user: request.headers['x-user'] ?? null,
    }),
  });

test('a v11 link changes the operation and taps results', async () => {
  await using server = await serve();
  const seen: unknown[] = [];
  const authLink: TRPCLink<AnyTRPCRouter> =
    () =>
    ({ op, next }) =>
      next({
        ...op,
        context: { ...op.context, headers: { 'x-user': 'kim' } },
      }).pipe(tap({ next: (envelope) => seen.push(envelope.result) }), share());
  const contexts: Operation['context'][] = [];
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      fromV11Link(authLink),
      link(({ op, next }) => {
        contexts.push(op.context);
        return next(op);
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
  const cacheLink: TRPCLink<AnyTRPCRouter> =
    () =>
    ({ op, next }) =>
      op.path === 'whoami'
        ? observable((observer) => {
            observer.next({ result: { type: 'data', data: 'cached' } });
            observer.complete();
          })
        : next(op);
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
  const v11Link: TRPCLink<AnyTRPCRouter> =
    () =>
    ({ op, next }) =>
      op.path === 'whoami'
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
        : next(op).pipe(tap({ error: (e) => seen.push(e) }));
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [fromV11Link(v11Link), httpLink({ url: server.url })],
  });
  await expect(client.byId.query({ id: '2' })).rejects.toMatchObject({
    code: 'NOT_FOUND',
    message: 'No post 2',
  });
  expect(seen).toMatchObject([{ code: 'NOT_FOUND' }]);
  await expect(client.whoami.query()).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
    message: 'No token',
    data: { code: 'UNAUTHORIZED', httpStatus: 401 },
  });
});

test('subscriptions pass through v11 operators, and stop when the loop ends', async () => {
  await using server = await serve();
  const results: unknown[] = [];
  const timesTen: TRPCLink<AnyTRPCRouter> =
    () =>
    ({ op, next }) =>
      next(op).pipe(
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
