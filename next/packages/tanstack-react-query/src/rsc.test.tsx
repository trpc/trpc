import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { hydrationOptions } from '@trpc12/tanstack-query';
import {
  cacheTags,
  createTrpcRsc,
  revalidationTag,
} from '@trpc12/tanstack-react-query/rsc';
import { renderToString } from 'react-dom/server';
import { initTrpc } from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import {
  appRouter,
  createApp,
  db,
  type Post,
  transformer,
} from '../../tanstack-query/src/fixtures/app.ts';

/** One request's worth of React `cache()`. */
const requestCache = () => {
  const memo = new Map<unknown, unknown>();
  return <TFn extends (...args: any[]) => any>(fn: TFn): TFn =>
    ((...args: unknown[]) => {
      if (!memo.has(fn)) memo.set(fn, fn(...args));
      return memo.get(fn);
    }) as TFn;
};

test('createTrpcRsc: per-request ctx and query client, and a server HydrationBoundary (15 Q15.4)', async () => {
  await using app = await createApp();
  let contexts = 0;
  const rsc = createTrpcRsc({
    router: appRouter,
    transformer,
    ctx: () => {
      contexts++;
      return { locale: 'sv' };
    },
    cache: requestCache(),
  });

  await rsc.caller.greeting.query();
  await rsc.caller.greeting.query();
  expect(contexts).toBe(1);
  expect(db.locales).toEqual(['sv', 'sv']);

  const byId = rsc.trpc.post.byId.queryOptions({ input: { id: '2' } });
  rsc.prefetch(byId);
  const post = await rsc.getQueryClient().query(byId);
  expectTypeOf(post).toEqualTypeOf<Post>();
  expect(db.calls).toEqual(['post.byId:2']);

  function Title() {
    const query = useQuery(
      app.trpc.post.byId.queryOptions({ input: { id: '2' } }),
    );
    return <h1>{query.data?.createdAt.toISOString().slice(0, 10)}</h1>;
  }
  const browser = new QueryClient({
    defaultOptions: hydrationOptions({ transformer }),
  });
  const html = renderToString(
    <QueryClientProvider client={browser}>
      <rsc.HydrationBoundary>
        <Title />
      </rsc.HydrationBoundary>
    </QueryClientProvider>,
  );
  expect(html).toContain('2026-01-03');
  expect(db.calls).toEqual(['post.byId:2']);
});

test('prefetch fills infinite queries with their first page, for useSuspenseInfiniteQuery', async () => {
  await using _app = await createApp({ posts: 3 });
  const rsc = createTrpcRsc({
    router: appRouter,
    transformer,
    ctx: { locale: null },
    cache: requestCache(),
  });
  const feed = rsc.trpc.post.list.infiniteOptions({
    input: (cursor: number | undefined) => ({ limit: 2, cursor }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.nextCursor,
  });
  rsc.prefetch(feed);
  await expect
    .poll(() => rsc.getQueryClient().getQueryData(feed.queryKey))
    .toEqual({
      pages: [{ items: [expect.anything(), expect.anything()], nextCursor: 2 }],
      pageParams: [undefined],
    });
});

test("HydrationBoundary keeps Next's digest errors, which Next needs to see, and redacts the rest", async () => {
  const dynamic = Object.assign(new Error('Dynamic server usage'), {
    digest: 'DYNAMIC_SERVER_USAGE',
  });
  const t = initTrpc();
  const rsc = createTrpcRsc({
    router: t.router({
      dynamic: t.procedure.query(async (): Promise<string> => {
        throw dynamic;
      }),
      broken: t.procedure.query(async (): Promise<string> => {
        throw new Error('db password is hunter2');
      }),
    }),
    cache: requestCache(),
  });
  rsc.prefetch(rsc.trpc.dynamic.queryOptions({ retry: false }));
  rsc.prefetch(rsc.trpc.broken.queryOptions({ retry: false }));
  const element = rsc.HydrationBoundary({}) as {
    props: { state: { queries: { promise?: Promise<unknown> }[] } };
  };
  const [first, second] = element.props.state.queries;
  await expect(first!.promise).rejects.toBe(dynamic);
  await expect(second!.promise).rejects.toThrow('redacted');
});

test('/rsc exports the data-cache tag helpers, for server components and Server Actions', () => {
  const rsc = createTrpcRsc({
    router: appRouter,
    transformer,
    ctx: { locale: null },
  });
  const key = rsc.trpc.post.byId.queryKey({ input: { id: '1' } });
  expect(cacheTags(key)).toEqual([
    'trpc',
    'trpc:post',
    'trpc:post.byId',
    'trpc:post.byId:{"id":"1"}',
  ]);
  expect(revalidationTag(rsc.trpc.post.pathKey())).toBe('trpc:post');
});
