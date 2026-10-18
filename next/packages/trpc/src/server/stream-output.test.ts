import { Schema, Stream } from 'effect';
import {
  createTrpcClient,
  httpLink,
  TrpcError,
  routerType,
} from '@trpc12/trpc/client';
import {
  type AnyContractRouter,
  experimental_contract,
} from '@trpc12/trpc/contract';
import { initTrpc, stream, tracked } from '@trpc12/trpc/server';
import { createTestServer } from '../fixtures/server.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc();

const Post = z.object({ id: z.string(), title: z.string().trim() });
const Token = z.object({ text: z.string() });
const Summary = z.object({ tokens: z.number().int() });

const router = {
  feed: t.procedure.output(stream(Post)).query(async function* () {
    yield { id: '1', title: ' Hello ' };
    yield { id: '2', title: 'World' };
  }),
  broken: t.procedure.output(stream(Post)).query(async function* () {
    yield { id: '1', title: 'ok' };
    yield { id: 2, title: 'bad' } as unknown as { id: string; title: string };
  }),
  chat: t.procedure.output(stream(Token, Summary)).mutation(async function* () {
    yield { text: 'He' };
    yield { text: 'llo' };
    return { tokens: 2 };
  }),
  badSummary: t.procedure
    .output(stream(Token, Summary))
    .mutation(async function* () {
      yield { text: 'x' };
      return { tokens: 1.5 };
    }),
  effectFeed: t.procedure
    .output(stream(Schema.Struct({ n: Schema.Number })))
    .query(() => Stream.make({ n: 1 }, { n: 2 })),
  notAStream: t.procedure
    .output(stream(Post))
    // @ts-expect-error -- stream() needs an AsyncIterable or a Stream
    .query(() => ({ id: '1', title: 'x' })),
  // @ts-expect-error -- a plain schema on a streamed query points to stream()
  plain: t.procedure.output(Post).query(async function* () {
    yield { id: '1', title: 'x' };
  }),
  onPost: t.procedure.output(Post).subscription(async function* () {
    yield tracked('1', { id: '1', title: ' a ' });
  }),
  onPostStream: t.procedure
    .output(stream(Post))
    .subscription(async function* () {
      yield { id: '1', title: ' b ' };
    }),
};
type AppRouter = typeof router;

async function setup() {
  const server = await createTestServer({ router });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url })],
  });
  return { client, [Symbol.asyncDispose]: () => server.close() };
}

async function drain<T, R>(iterable: AsyncIterable<T, R>) {
  const items: T[] = [];
  const iterator = iterable[Symbol.asyncIterator]();
  while (true) {
    const next = await iterator.next();
    if (next.done) return { items, returned: next.value };
    items.push(next.value);
  }
}

test('stream(Item) validates and transforms each item of a streamed query', async () => {
  await using ctx = await setup();
  const feed = await ctx.client.feed.query();
  expectTypeOf(feed).toEqualTypeOf<
    AsyncIterable<{ id: string; title: string }>
  >();
  expect((await drain(feed)).items).toEqual([
    { id: '1', title: 'Hello' },
    { id: '2', title: 'World' },
  ]);
});

test('an invalid item fails the stream after the items before it', async () => {
  await using ctx = await setup();
  const items: unknown[] = [];
  const err = await (async () => {
    for await (const item of await ctx.client.broken.query()) items.push(item);
  })().then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(items).toEqual([{ id: '1', title: 'ok' }]);
  expect(err).toBeInstanceOf(TrpcError);
  expect(err).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
});

test('stream(Item, Return) validates the return value, and the client gets it', async () => {
  await using ctx = await setup();
  const chat = await ctx.client.chat.mutate();
  expectTypeOf(chat).toEqualTypeOf<
    AsyncIterable<{ text: string }, { tokens: number }>
  >();
  expect(await drain(chat)).toEqual({
    items: [{ text: 'He' }, { text: 'llo' }],
    returned: { tokens: 2 },
  });

  const bad = await drain(await ctx.client.badSummary.mutate()).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(bad).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
});

test('stream() validates the items of an Effect Stream', async () => {
  await using ctx = await setup();
  expect((await drain(await ctx.client.effectFeed.query())).items).toEqual([
    { n: 1 },
    { n: 2 },
  ]);
});

test('a resolver that does not stream fails stream() validation', async () => {
  await using ctx = await setup();
  await expect(ctx.client.notAStream.query()).rejects.toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
  });
});

test('subscriptions validate each event with .output(Event) or .output(stream(Event))', async () => {
  await using ctx = await setup();
  const a: unknown[] = [];
  for await (const e of ctx.client.onPost.subscribe()) a.push(e);
  expect(a).toEqual([{ id: '1', data: { id: '1', title: 'a' } }]);

  const b: { id: string; title: string }[] = [];
  for await (const e of ctx.client.onPostStream.subscribe()) b.push(e);
  expectTypeOf(b[0]!).toEqualTypeOf<{ id: string; title: string }>();
  expect(b).toEqual([{ id: '1', title: 'b' }]);
});

test('contracts take stream() outputs', async () => {
  const c = experimental_contract.create();
  const appContract = {
    chat: c.output(stream(Token, Summary)).mutation(),
  } satisfies AnyContractRouter;
  const impl = t.implement(appContract);
  await using server = await createTestServer({
    router: {
      chat: impl.chat.mutation(async function* () {
        yield { text: 'a' };
        return { tokens: 1 };
      }),
    },
  });
  const client = createTrpcClient({
    router: appContract,
    links: [httpLink({ url: server.url })],
  });
  const chat = await client.chat.mutate();
  expectTypeOf(chat).toEqualTypeOf<
    AsyncIterable<{ text: string }, { tokens: number }>
  >();
  expect(await drain(chat)).toEqual({
    items: [{ text: 'a' }],
    returned: { tokens: 1 },
  });
});
