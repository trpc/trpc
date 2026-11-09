import { Schema, Stream } from 'effect';
import {
  createTrpcClient,
  httpLink,
  TrpcError,
  type TrpcIterable,
  routerType,
} from '@trpc12/trpc/client';
import {
  type AnyContractRouter,
  experimental_contract,
} from '@trpc12/trpc/contract';
import { initTrpc, stream, tracked } from '@trpc12/trpc/server';
import { createTestServer } from '../../fixtures/server.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc();
type ErrorOf<T> = T extends TrpcIterable<any, any, infer E> ? E : never;

const Post = z.object({ id: z.string(), title: z.string().trim() });
const Token = z.object({ text: z.string() });
const Summary = z.object({ tokens: z.number().int() });

const router = t.router({
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
});
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
    TrpcIterable<{ id: string; title: string }, any, ErrorOf<typeof feed>>
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
    TrpcIterable<{ text: string }, { tokens: number }, ErrorOf<typeof chat>>
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

test('in-process, a streamed output ends with its validated return value', async () => {
  expect(await drain(await t.call(router.chat, undefined))).toEqual({
    items: [{ text: 'He' }, { text: 'llo' }],
    returned: { tokens: 2 },
  });
  const fromStream = t.procedure
    .output(stream(Schema.Struct({ n: Schema.Number })))
    .query(() => Stream.make({ n: 1 }));
  expect(await drain(await t.call(fromStream, undefined))).toEqual({
    items: [{ n: 1 }],
    returned: undefined,
  });
  const bad = await drain(await t.call(router.badSummary, undefined)).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(bad).toBeInstanceOf(TrpcError);
  expect(bad).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
});

test('a streamed output reads its source one item per next(), and leaving closes it', async () => {
  const pulled: number[] = [];
  let closed = false;
  async function* tokens() {
    try {
      for (let i = 0; ; i++) {
        pulled.push(i);
        yield { text: String(i) };
      }
    } finally {
      await Promise.resolve();
      closed = true;
    }
  }
  const validated = t.procedure.output(stream(Token)).query(tokens);
  const unvalidated = t.procedure.query(tokens);
  for (const procedure of [validated, unvalidated]) {
    pulled.length = 0;
    closed = false;
    const iterator = (await t.call(procedure, undefined))[
      Symbol.asyncIterator
    ]();
    expect(await iterator.next()).toEqual({
      done: false,
      value: { text: '0' },
    });
    expect(await iterator.next()).toEqual({
      done: false,
      value: { text: '1' },
    });
    expect(pulled).toEqual([0, 1]);
    expect(await iterator.return?.('left')).toEqual({
      done: true,
      value: 'left',
    });
    expect(closed).toBe(true);
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
  }
});

test('throw() on a streamed output closes its source and rejects with the error', async () => {
  let closed = false;
  async function* tokens() {
    try {
      yield { text: 'a' };
      yield { text: 'b' };
    } finally {
      closed = true;
    }
  }
  const validated = t.procedure.output(stream(Token)).query(tokens);
  const unvalidated = t.procedure.query(tokens);
  for (const procedure of [validated, unvalidated]) {
    closed = false;
    const iterator = (await t.call(procedure, undefined))[
      Symbol.asyncIterator
    ]();
    await iterator.next();
    const thrown = new Error('stop');
    await expect(iterator.throw?.(thrown)).rejects.toBe(thrown);
    expect(closed).toBe(true);
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
  }
});

test('an invalid item closes the source before the stream fails', async () => {
  let closed = false;
  const broken = t.procedure.output(stream(Post)).query(async function* () {
    try {
      yield { id: '1', title: 'ok' };
      yield { id: 2 } as unknown as { id: string; title: string };
      yield { id: '3', title: 'never' };
    } finally {
      closed = true;
    }
  });
  const items: unknown[] = [];
  const err = await (async () => {
    for await (const item of await t.call(broken, undefined)) items.push(item);
  })().then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(items).toEqual([{ id: '1', title: 'ok' }]);
  expect(err).toBeInstanceOf(TrpcError);
  expect(closed).toBe(true);
});

test('stream() validates the items of a ReadableStream', async () => {
  const fromWeb = t.procedure.output(stream(Post)).query(
    () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue({ id: '1', title: ' Web ' });
          controller.close();
        },
      }),
  );
  const items: unknown[] = [];
  for await (const item of await t.call(fromWeb, undefined)) items.push(item);
  expect(items).toEqual([{ id: '1', title: 'Web' }]);
});

test('contracts take stream() outputs', async () => {
  const c = experimental_contract.create();
  const appContract = {
    chat: c.output(stream(Token, Summary)).mutation(),
  } satisfies AnyContractRouter;
  const impl = t.implement(appContract);
  await using server = await createTestServer({
    router: impl.router({
      chat: impl.chat.mutation(async function* () {
        yield { text: 'a' };
        return { tokens: 1 };
      }),
    }),
  });
  const client = createTrpcClient({
    router: appContract,
    links: [httpLink({ url: server.url })],
  });
  const chat = await client.chat.mutate();
  expectTypeOf(chat).toEqualTypeOf<
    TrpcIterable<{ text: string }, { tokens: number }, ErrorOf<typeof chat>>
  >();
  expect(await drain(chat)).toEqual({
    items: [{ text: 'a' }],
    returned: { tokens: 1 },
  });
});
