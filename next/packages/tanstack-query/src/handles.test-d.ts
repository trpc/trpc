import { QueryClient, skipToken } from '@tanstack/query-core';
import {
  createTrpcQueryUtils,
  type inferQueryHandle,
  type QueryData,
  type TrpcQueryHandle,
  type TrpcQueryKey,
} from '@trpc12/tanstack-query';
import { describe, expectTypeOf, test } from 'vite-plus/test';
import type { createApp, Post } from './fixtures/app.ts';

declare const app: Awaited<ReturnType<typeof createApp>>;
const queryClient = new QueryClient();
const bound = createTrpcQueryUtils({ client: app.client, queryClient });
const lazy = createTrpcQueryUtils({
  client: app.client,
  queryClient: () => queryClient,
});
const byIdOptions = app.trpc.post.byId.queryOptions({ input: { id: '1' } });

describe('the handle verbs', () => {
  test('return a handle typed by the procedure', async () => {
    const handle = await bound.post.byId.$ensure({ input: { id: '1' } });
    expectTypeOf(handle).toEqualTypeOf<
      inferQueryHandle<typeof app.trpc.post.byId>
    >();
    expectTypeOf(handle.input).toEqualTypeOf<{ id: string }>();
    expectTypeOf(handle.queryKey).toExtend<TrpcQueryKey>();
    expectTypeOf(handle.queryKey[1].input).toEqualTypeOf<
      { id: string } | undefined
    >();
    expectTypeOf(
      bound.post.byId.$prefetch({ input: { id: '1' } }),
    ).toEqualTypeOf(handle);
    expectTypeOf(
      await bound.post.byId.$fetch({ input: { id: '1' } }),
    ).toEqualTypeOf(handle);
    expectTypeOf(
      await lazy.post.byId.$ensure({ input: { id: '1' } }),
    ).toEqualTypeOf(handle);
  });

  test('take input like queryOptions(), without skipToken', () => {
    void bound.greeting.$ensure();
    void bound.post.byId.$ensure({ input: { id: '1' }, staleTime: 1000 });
    // @ts-expect-error -- post.byId takes an input
    void bound.post.byId.$ensure();
    // @ts-expect-error -- a handle always starts its query
    void bound.post.byId.$ensure({ input: skipToken });
    // @ts-expect-error -- observer options belong to the reader
    void bound.post.byId.$ensure({ input: { id: '1' }, select: () => 1 });
    // @ts-expect-error -- no link declares `dedup`
    void bound.post.byId.$ensure({ input: { id: '1' }, context: { dedup: 1 } });
  });

  test('exist only on helpers made with a queryClient', () => {
    expectTypeOf(app.trpc.post.byId).not.toHaveProperty('$ensure');
    expectTypeOf(app.trpc.post.byId).not.toHaveProperty('$prefetch');
    expectTypeOf(app.trpc.post.create).not.toHaveProperty('$ensure');
    expectTypeOf(bound.post.create).not.toHaveProperty('$ensure');
    expectTypeOf(bound.clock.ticks).not.toHaveProperty('$ensure');
    const maybe = createTrpcQueryUtils({
      client: app.client,
      queryClient: queryClient as QueryClient | undefined,
    });
    expectTypeOf(maybe.post.byId).not.toHaveProperty('$ensure');
  });
});

describe('$fromHandle', () => {
  test('returns the same options as queryOptions() for the handle', async () => {
    const handle = await bound.post.byId.$ensure({ input: { id: '1' } });
    const read = app.trpc.$fromHandle(handle);
    expectTypeOf(read).toEqualTypeOf(byIdOptions);
    expectTypeOf(read.queryKey).toEqualTypeOf(
      app.trpc.post.byId.queryKey({ input: { id: '1' } }),
    );
    expectTypeOf(await queryClient.query(read)).toEqualTypeOf<Post>();
    expectTypeOf(app.trpc.post.$fromHandle(handle)).toEqualTypeOf(read);
  });

  test('types select, the error and context from the handle', async () => {
    const handle = await bound.post.byId.$ensure({ input: { id: '1' } });
    const title = app.trpc.$fromHandle(handle, {
      select: (post) => {
        expectTypeOf(post).toEqualTypeOf<Post>();
        return post.title;
      },
      context: { dedupe: false },
    });
    expectTypeOf(await queryClient.query(title)).toEqualTypeOf<string>();
    const error = queryClient.getQueryState(
      app.trpc.$fromHandle(handle).queryKey,
    )?.error;
    expectTypeOf(error).toEqualTypeOf(
      queryClient.getQueryState(byIdOptions.queryKey)?.error,
    );
    expectTypeOf<NonNullable<typeof error>['code']>().toExtend<string>();
    // @ts-expect-error -- no link declares `dedup`
    app.trpc.$fromHandle(handle, { context: { dedup: false } });
  });

  test('takes only handles', () => {
    // @ts-expect-error -- a plain object isn't a handle: only the verbs make them
    app.trpc.$fromHandle({
      queryKey: [['post', 'byId'], { input: { id: '1' }, type: 'query' }],
      input: { id: '1' },
    });
    // @ts-expect-error -- options aren't a handle
    app.trpc.$fromHandle(byIdOptions);
  });

  test('a handle for typing props', () => {
    type Handle = inferQueryHandle<typeof bound.post.byId>;
    expectTypeOf<Handle>().toEqualTypeOf<
      inferQueryHandle<typeof app.trpc.post.byId>
    >();
    expectTypeOf<Handle>().toExtend<TrpcQueryHandle>();
    expectTypeOf<
      inferQueryHandle<typeof app.trpc.greeting>['input']
    >().toEqualTypeOf<undefined>();
    // A streamed query's handle reads its chunks so far
    const reply = app.trpc.$fromHandle(
      {} as inferQueryHandle<typeof app.trpc.chat.reply>,
    );
    expectTypeOf(reply).toEqualTypeOf(
      app.trpc.chat.reply.queryOptions({ input: { prompt: 'hi' } }),
    );
    expectTypeOf<QueryData<AsyncIterable<string>>>().toEqualTypeOf<string[]>();
  });
});
