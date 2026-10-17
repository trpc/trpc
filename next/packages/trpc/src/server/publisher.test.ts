import { Effect, Fiber, Layer, Stream } from 'effect';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import {
  initTrpc,
  Publisher,
  type inferRouterServices,
  type TrackedEnvelope,
} from '@trpc12/trpc/server';
import { createTestServer } from '../fixtures/server.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

interface Post {
  id: string;
  title: string;
}

class Posts extends Publisher.Service<
  Posts,
  { created: Post; deleted: { id: string } }
>()('test/Posts') {}

test('publish and subscribe as Effects, with ids and channels (14 Q14.6)', async () => {
  const program = Effect.gen(function* () {
    const id = yield* Posts.publish('created', { id: '0', title: 'missed' });
    expect(id).toBe('1');
    const events = yield* Effect.forkChild(
      Posts.subscribe('created').pipe(Stream.take(2), Stream.runCollect),
    );
    yield* Effect.sleep(10);
    yield* Posts.publish('deleted', { id: '0' });
    yield* Posts.publish('created', { id: '1', title: 'a' });
    yield* Posts.publish('created', { id: '2', title: 'b' });
    return yield* Fiber.join(events);
  });
  const events = await Effect.runPromise(
    Effect.scoped(program.pipe(Effect.provide(Posts.memory()))),
  );
  expectTypeOf([...events]).toEqualTypeOf<TrackedEnvelope<Post>[]>();
  expect([...events].map((e) => [e.id, e.data.title])).toEqual([
    ['3', 'a'],
    ['4', 'b'],
  ]);
});

class Chat extends Publisher.Service<
  Chat,
  { [room: `chat:${string}`]: { text: string } }
>()('test/Chat') {}

test('a channel per audience: template keys type every room, replays included', async () => {
  const program = Effect.gen(function* () {
    yield* Chat.publish('chat:1', { text: 'kept for room 1' });
    const collect = (room: string) =>
      Effect.forkChild(
        Chat.subscribe(`chat:${room}`, { lastEventId: '0' }).pipe(
          Stream.take(2),
          Stream.map((e) => e.data.text),
          Stream.runCollect,
        ),
      );
    const one = yield* collect('1');
    const two = yield* collect('2');
    yield* Effect.sleep(10);
    yield* Chat.publish('chat:2', { text: 'for room 2' });
    yield* Chat.publish('chat:1', { text: 'for room 1' });
    yield* Chat.publish('chat:2', { text: 'for room 2, again' });
    return {
      one: [...(yield* Fiber.join(one))],
      two: [...(yield* Fiber.join(two))],
    };
  });
  expectTypeOf<Parameters<typeof Chat.publish<'chat:9'>>[1]>().toEqualTypeOf<{
    text: string;
  }>();
  expect(
    await Effect.runPromise(
      Effect.scoped(program.pipe(Effect.provide(Chat.memory({ buffer: 10 })))),
    ),
  ).toEqual({
    one: ['kept for room 1', 'for room 1'],
    two: ['for room 2', 'for room 2, again'],
  });
});

const t = initTrpc();
const router = {
  create: t.procedure
    .input(z.object({ title: z.string() }))
    .mutation(({ input }) =>
      Effect.gen(function* () {
        const post: Post = { id: crypto.randomUUID(), ...input };
        yield* Posts.publish('created', post);
        return post;
      }),
    ),
  onCreated: t.procedure.subscription((opts) =>
    Posts.subscribe('created', { lastEventId: opts.lastEventId }),
  ),
};

test('a subscription resumes from the buffer after lastEventId', async () => {
  expectTypeOf<inferRouterServices<typeof router>>().toEqualTypeOf<Posts>();
  await using server = await createTestServer({
    router,
    layer: Posts.memory({ buffer: 2 }),
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: server.url })],
  });
  for (const title of ['a', 'b', 'c']) await client.create.mutate({ title });

  const seen: string[] = [];
  for await (const post of client.onCreated.subscribe(undefined, {
    lastEventId: '1',
  })) {
    expectTypeOf(post).toEqualTypeOf<TrackedEnvelope<Post>>();
    seen.push(post.data.title);
    if (seen.length === 2) break;
  }
  expect(seen).toEqual(['b', 'c']);
});

test('the layer can be swapped for another backend', async () => {
  const sent: string[] = [];
  const Fake = Layer.succeed(Posts, {
    publish: (channel, data) =>
      Effect.sync(() => {
        sent.push(`${channel}:${JSON.stringify(data)}`);
        return 'x';
      }),
    subscribe: () => Stream.empty,
  });
  await Effect.runPromise(
    Posts.publish('deleted', { id: '9' }).pipe(Effect.provide(Fake)),
  );
  expect(sent).toEqual(['deleted:{"id":"9"}']);
});
