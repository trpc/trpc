import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { hydrationOptions } from '@trpc12/tanstack-query';
import { createTrpcRsc } from '@trpc12/tanstack-react-query/rsc';
import { renderToString } from 'react-dom/server';
import { initTrpc } from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import {
  appRouter,
  createApp,
  db,
  type Post,
  serializer,
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
    serializer,
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
    const { data } = useQuery(
      app.trpc.post.byId.queryOptions({ input: { id: '2' } }),
    );
    return <h1>{data?.createdAt.toISOString().slice(0, 10)}</h1>;
  }
  const browser = new QueryClient({
    defaultOptions: hydrationOptions({ serializer }),
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

test("HydrationBoundary keeps Next's digest errors, which Next needs to see, and redacts the rest", async () => {
  const dynamic = Object.assign(new Error('Dynamic server usage'), {
    digest: 'DYNAMIC_SERVER_USAGE',
  });
  const t = initTrpc();
  const rsc = createTrpcRsc({
    router: {
      dynamic: t.procedure.query(async (): Promise<string> => {
        throw dynamic;
      }),
      broken: t.procedure.query(async (): Promise<string> => {
        throw new Error('db password is hunter2');
      }),
    },
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
