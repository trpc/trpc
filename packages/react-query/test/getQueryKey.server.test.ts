import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient } from '@trpc/client';
import {
  createTRPCQueryUtils,
  createTRPCReact,
  getQueryKey as getClientQueryKey,
} from '@trpc/react-query';
import {
  createHydrationHelpers,
  getQueryKey as getRSCQueryKey,
} from '@trpc/react-query/rsc';
import {
  createServerSideHelpers,
  getQueryKey as getSSGQueryKey,
} from '@trpc/react-query/server';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

type Post = {
  id: number;
  text: string;
};

function createAppRouter() {
  const t = initTRPC.create();

  const posts: Post[] = [
    { id: 1, text: 'first' },
    { id: 2, text: 'second' },
  ];
  const byIdResolver = vi.fn((input: { id: number }) =>
    posts.find((post) => post.id === input.id),
  );

  const appRouter = t.router({
    post: t.router({
      byId: t.procedure
        .input(z.object({ id: z.number() }))
        .query((opts) => byIdResolver(opts.input)),
      all: t.procedure.query(() => posts),
      list: t.procedure
        .input(z.object({ text: z.string(), cursor: z.number().nullish() }))
        .query((opts) => posts.slice(opts.input.cursor ?? 0)),
      add: t.procedure
        .input(z.object({ text: z.string() }))
        .mutation(() => null),
    }),
  });

  const caller = t.createCallerFactory(appRouter)({});

  return { appRouter, caller, byIdResolver };
}

describe('createServerSideHelpers', () => {
  test('matches the client-side query key', () => {
    const { appRouter } = createAppRouter();
    const ssg = createServerSideHelpers({ router: appRouter, ctx: {} });
    const client = createTRPCReact<typeof appRouter>();

    expect(getSSGQueryKey(ssg.post.byId, { id: 1 }, 'query')).toEqual([
      ['post', 'byId'],
      { input: { id: 1 }, type: 'query' },
    ]);
    expect(getSSGQueryKey(ssg.post.byId, { id: 1 }, 'query')).toEqual(
      getClientQueryKey(client.post.byId, { id: 1 }, 'query'),
    );
    expect(getSSGQueryKey(ssg.post.all)).toEqual(
      getClientQueryKey(client.post.all),
    );
    expect(getSSGQueryKey(ssg.post.list, { text: 'a' }, 'infinite')).toEqual(
      getClientQueryKey(client.post.list, { text: 'a' }, 'infinite'),
    );
    expect(getSSGQueryKey(ssg.post)).toEqual([['post']]);
  });

  test('matches the key that fetch() reads from', async () => {
    const { appRouter, byIdResolver } = createAppRouter();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity } },
    });
    const ssg = createServerSideHelpers({
      router: appRouter,
      ctx: {},
      queryClient,
    });

    // seed every post from a single list query, as in #5493
    const posts = await ssg.post.all.fetch();
    for (const post of posts) {
      queryClient.setQueryData(
        getSSGQueryKey(ssg.post.byId, { id: post.id }, 'query'),
        post,
      );
    }

    expect(await ssg.post.byId.fetch({ id: 2 })).toEqual({
      id: 2,
      text: 'second',
    });
    expect(byIdResolver).not.toHaveBeenCalled();
  });

  test('types', () => {
    const { appRouter } = createAppRouter();
    const ssg = createServerSideHelpers({ router: appRouter, ctx: {} });

    getSSGQueryKey(ssg.post.byId);
    getSSGQueryKey(ssg.post.byId, {});
    getSSGQueryKey(ssg.post.byId, { id: 1 }, 'query');
    getSSGQueryKey(ssg.post.list, { text: 'a' }, 'infinite');
    getSSGQueryKey(ssg.post);

    // @ts-expect-error - wrong input type
    getSSGQueryKey(ssg.post.byId, { id: '1' });
    // @ts-expect-error - post.all has no input
    getSSGQueryKey(ssg.post.all, 'foo');
    // @ts-expect-error - routers take no input
    getSSGQueryKey(ssg.post, 'foo');
  });

  test('still rejects query utils, which have prefetch() too', () => {
    const { appRouter } = createAppRouter();
    const utils = createTRPCQueryUtils({
      queryClient: new QueryClient(),
      client: createTRPCClient<typeof appRouter>({ links: [] }),
    });

    expect(() =>
      // @ts-expect-error - query utils have no query key
      getSSGQueryKey(utils.post.byId, { id: 1 }),
    ).toThrow();
  });
});

describe('createHydrationHelpers', () => {
  test('matches the client-side query key', () => {
    const { appRouter, caller } = createAppRouter();
    const queryClient = new QueryClient();
    const { trpc } = createHydrationHelpers<typeof appRouter>(
      caller,
      () => queryClient,
    );
    const client = createTRPCReact<typeof appRouter>();

    expect(getRSCQueryKey(trpc.post.byId, { id: 1 }, 'query')).toEqual(
      getClientQueryKey(client.post.byId, { id: 1 }, 'query'),
    );
    expect(getRSCQueryKey(trpc.post.all)).toEqual(
      getClientQueryKey(client.post.all),
    );
    expect(getRSCQueryKey(trpc.post.list, { text: 'a' }, 'infinite')).toEqual(
      getClientQueryKey(client.post.list, { text: 'a' }, 'infinite'),
    );
    expect(getRSCQueryKey(trpc.post)).toEqual([['post']]);
  });

  test('does not call the procedure', () => {
    const { appRouter, caller, byIdResolver } = createAppRouter();
    const { trpc } = createHydrationHelpers<typeof appRouter>(
      caller,
      () => new QueryClient(),
    );

    getRSCQueryKey(trpc.post.byId, { id: 1 }, 'query');

    expect(byIdResolver).not.toHaveBeenCalled();
  });

  test('still calls a procedure named `_def`', async () => {
    const t = initTRPC.create();
    const appRouter = t.router({
      post: t.router({ _def: t.procedure.query(() => 'called') }),
    });
    const { trpc } = createHydrationHelpers<typeof appRouter>(
      t.createCallerFactory(appRouter)({}),
      () => new QueryClient(),
    );

    expect(await trpc.post._def()).toBe('called');
  });

  test('reads the state of a prefetched query', async () => {
    const { appRouter, caller } = createAppRouter();
    const queryClient = new QueryClient();
    const { trpc } = createHydrationHelpers<typeof appRouter>(
      caller,
      () => queryClient,
    );

    await trpc.post.byId.prefetch({ id: 1 });

    const state = queryClient.getQueryState(
      getRSCQueryKey(trpc.post.byId, { id: 1 }, 'query'),
    );
    expect(state?.status).toBe('success');
    expect(state?.data).toEqual({ id: 1, text: 'first' });
  });

  test('types', () => {
    const { appRouter, caller } = createAppRouter();
    const { trpc } = createHydrationHelpers<typeof appRouter>(
      caller,
      () => new QueryClient(),
    );

    getRSCQueryKey(trpc.post.byId);
    getRSCQueryKey(trpc.post.byId, {});
    getRSCQueryKey(trpc.post.byId, { id: 1 }, 'query');
    getRSCQueryKey(trpc.post.list, { text: 'a' }, 'infinite');
    getRSCQueryKey(trpc.post);

    // @ts-expect-error - wrong input type
    getRSCQueryKey(trpc.post.byId, { id: '1' });
    // @ts-expect-error - post.all has no input
    getRSCQueryKey(trpc.post.all, 'foo');
    // @ts-expect-error - routers take no input
    getRSCQueryKey(trpc.post, 'foo');
  });
});
