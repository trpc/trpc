// @vitest-environment happy-dom
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
  useMutation,
  useMutationState,
  useQueries,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createTrpcQueryUtils, hydrationOptions } from '@trpc12/tanstack-query';
import {
  createTrpcContext,
  useSubscription,
} from '@trpc12/tanstack-react-query';
import { Suspense, useContext, useState, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import {
  createTrpcClient,
  httpLink,
  link,
  routerType,
  TrpcError,
  type LinksContext,
  type LinksTypes,
  type TrpcClient,
} from '@trpc12/trpc/client';
import { createRouterClient } from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import {
  appRouter,
  createApp,
  db,
  type AppRouter,
  type Post,
  type AppClient,
  serializer,
} from '../../tanstack-query/src/fixtures/app.ts';
import {
  click,
  container,
  text,
  waitFor,
} from '../../trpc/src/fixtures/dom.ts';

const [TrpcProvider, useTrpc, useTrpcClient, TrpcContext] =
  createTrpcContext<AppClient>();

function mount(ui: ReactNode, client: AppClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const el = container();
  const root = createRoot(el);
  root.render(
    <QueryClientProvider client={queryClient}>
      <TrpcProvider client={client}>{ui}</TrpcProvider>
    </QueryClientProvider>,
  );
  return {
    el,
    queryClient,
    [Symbol.dispose]: () => {
      root.unmount();
      el.remove();
    },
  };
}

function PostTitle({ id }: { id: string }) {
  const trpc = useTrpc();
  const post = useQuery(trpc.post.byId.queryOptions({ input: { id } }));
  if (post.error) {
    return (
      <p className="error">
        {post.error.defined ? post.error.code : 'unexpected'}
      </p>
    );
  }
  if (!post.data) return <p className="loading">loading</p>;
  expectTypeOf(post.data).toEqualTypeOf<Post>();
  return (
    <h1>
      {post.data.title} on {post.data.createdAt.toISOString().slice(0, 10)}
    </h1>
  );
}

test('useQuery reads through the provider; typed errors render', async () => {
  await using app = await createApp();
  using view = mount(
    <>
      <PostTitle id="1" />
      <PostTitle id="nope" />
    </>,
    app.client,
  );
  await waitFor(() => expect(text(view.el, 'h1')).toBe('Post 1 on 2026-01-02'));
  await waitFor(() => expect(text(view.el, '.error')).toBe('NOT_FOUND'));
});

test('useMutation invalidates with pathFilter', async () => {
  await using app = await createApp();
  function Posts() {
    const trpc = useTrpc();
    const queryClient = useQueryClient();
    const list = useQuery(
      trpc.post.list.queryOptions({ input: { limit: 10 } }),
    );
    const create = useMutation(
      trpc.post.create.mutationOptions({
        onSuccess: () => queryClient.invalidateQueries(trpc.post.pathFilter()),
      }),
    );
    return (
      <>
        <ul>
          {list.data?.items.map((post) => (
            <li key={post.id}>{post.title}</li>
          ))}
        </ul>
        <button onClick={() => create.mutate({ title: 'From React' })}>
          add
        </button>
      </>
    );
  }
  using view = mount(<Posts />, app.client);
  await waitFor(() => expect(view.el.querySelectorAll('li')).toHaveLength(3));
  click(view.el, 'button');
  await waitFor(() =>
    expect(text(view.el, 'li:last-child')).toBe('From React'),
  );
});

test('useSuspenseQuery suspends until the data arrives', async () => {
  await using app = await createApp();
  function Title() {
    const trpc = useTrpc();
    const { data } = useSuspenseQuery(
      trpc.post.byId.queryOptions({ input: { id: '2' } }),
    );
    expectTypeOf(data).toEqualTypeOf<Post>();
    return <h1>{data.title}</h1>;
  }
  using view = mount(
    <Suspense fallback={<p>suspended</p>}>
      <Title />
    </Suspense>,
    app.client,
  );
  await waitFor(() => expect(text(view.el, 'p')).toBe('suspended'));
  await waitFor(() => expect(text(view.el, 'h1')).toBe('Post 2'));
});

test('useInfiniteQuery loads pages on demand', async () => {
  await using app = await createApp({ posts: 5 });
  function Feed() {
    const trpc = useTrpc();
    const feed = useInfiniteQuery(
      trpc.post.list.infiniteOptions({
        input: (cursor: number | undefined) => ({ limit: 2, cursor }),
        initialPageParam: undefined,
        getNextPageParam: (page) => page.nextCursor,
      }),
    );
    return (
      <>
        <ul>
          {feed.data?.pages
            .flatMap((page) => page.items)
            .map((post) => (
              <li key={post.id}>{post.title}</li>
            ))}
        </ul>
        {feed.hasNextPage && (
          <button onClick={() => void feed.fetchNextPage()}>more</button>
        )}
      </>
    );
  }
  using view = mount(<Feed />, app.client);
  await waitFor(() => expect(view.el.querySelectorAll('li')).toHaveLength(2));
  click(view.el, 'button');
  await waitFor(() => expect(view.el.querySelectorAll('li')).toHaveLength(4));
  click(view.el, 'button');
  await waitFor(() => expect(view.el.querySelectorAll('li')).toHaveLength(5));
  expect(view.el.querySelector('button')).toBeNull();
});

test('useSubscription, live and streamed queries update the UI', async () => {
  await using app = await createApp();
  const toasts: string[] = [];
  function Live() {
    const trpc = useTrpc();
    const [from, setFrom] = useState(100);
    const added = useSubscription(
      trpc.post.onAdd.subscriptionOptions({
        onData: (post) => toasts.push(post.title),
      }),
    );
    const tick = useQuery(trpc.clock.ticks.liveOptions({ input: { from } }));
    const reply = useQuery(
      trpc.chat.reply.queryOptions({ input: { prompt: 'react' } }),
    );
    return (
      <>
        <p className="status">{added.status}</p>
        <p className="added">{added.data?.title}</p>
        <p className="tick">{tick.data}</p>
        <p className="reply">{reply.data?.join(' ')}</p>
        <button onClick={() => setFrom(500)}>jump</button>
      </>
    );
  }
  using view = mount(<Live />, app.client);
  await waitFor(() => expect(text(view.el, '.reply')).toBe('you said react'));
  await waitFor(() => expect(db.listeners.size).toBe(1));
  app.addPost('Live post');
  await waitFor(() => expect(text(view.el, '.added')).toBe('Live post'));
  expect(text(view.el, '.status')).toBe('active');
  expect(toasts).toEqual(['Live post']);

  await waitFor(() =>
    expect(Number(text(view.el, '.tick'))).toBeGreaterThan(100),
  );
  click(view.el, 'button');
  await waitFor(() =>
    expect(Number(text(view.el, '.tick'))).toBeGreaterThan(500),
  );
});

test('useQueries takes queryOptions; combine sees the typed results', async () => {
  await using app = await createApp();
  function Titles() {
    const trpc = useTrpc();
    const titles = useQueries({
      queries: ['1', '2', 'nope'].map((id) =>
        trpc.post.byId.queryOptions({ input: { id } }),
      ),
      combine: (results) => {
        expectTypeOf(results[0]!.data).toEqualTypeOf<Post | undefined>();
        return results.map((r) =>
          r.error?.defined ? r.error.code : (r.data?.title ?? '…'),
        );
      },
    });
    return <p>{titles.join(',')}</p>;
  }
  using view = mount(<Titles />, app.client);
  await waitFor(() =>
    expect(text(view.el, 'p')).toBe('Post 1,Post 2,NOT_FOUND'),
  );
});

test('useMutationState reads pending variables through mutationFilter', async () => {
  await using app = await createApp();
  const seen: (string | undefined)[] = [];
  function Composer() {
    const trpc = useTrpc();
    const create = useMutation(trpc.post.create.mutationOptions());
    const pending = useMutationState({
      filters: trpc.post.create.mutationFilter({ status: 'pending' }),
      select: (mutation) => mutation.state.variables,
    });
    seen.push(...pending.map((v) => (v as { title: string }).title));
    return (
      <>
        <p className="done">{create.data?.title}</p>
        <button onClick={() => create.mutate({ title: 'Draft' })}>add</button>
      </>
    );
  }
  using view = mount(<Composer />, app.client);
  await waitFor(() => click(view.el, 'button'));
  await waitFor(() => expect(text(view.el, '.done')).toBe('Draft'));
  expect(seen).toContain('Draft');
});

test('components with the same useSubscription key share one subscription', async () => {
  await using app = await createApp();
  function Added({ name }: { name: string }) {
    const trpc = useTrpc();
    const added = useSubscription(trpc.post.onAdd.subscriptionOptions());
    return <p className={name}>{added.data?.title}</p>;
  }
  using view = mount(
    <>
      <Added name="a" />
      <Added name="b" />
    </>,
    app.client,
  );
  await waitFor(() => expect(db.listeners.size).toBe(1));
  app.addPost('Shared');
  await waitFor(() => expect(text(view.el, '.a')).toBe('Shared'));
  expect(text(view.el, '.b')).toBe('Shared');
  expect(db.listeners.size).toBe(1);
});

test('server render with prefetched data, then hydrate without refetching', async () => {
  await using app = await createApp();
  function Page() {
    const trpc = useTrpc();
    const client = useTrpcClient();
    expectTypeOf(client).toEqualTypeOf<AppClient>();
    const { data } = useSuspenseQuery(
      trpc.post.byId.queryOptions({ input: { id: '3' } }),
    );
    return <h1>{data.createdAt.toISOString().slice(0, 10)}</h1>;
  }

  const serverQueryClient = new QueryClient({
    defaultOptions: hydrationOptions({ serializer }),
  });
  const serverClient = createRouterClient(appRouter, {
    ctx: { locale: null },
  });
  await serverQueryClient.query(
    createTrpcQueryUtils({ client: serverClient }).post.byId.queryOptions({
      input: { id: '3' },
    }),
  );
  const tree = (queryClient: QueryClient, client: AppClient) => (
    <QueryClientProvider client={queryClient}>
      <TrpcProvider client={client}>
        <Page />
      </TrpcProvider>
    </QueryClientProvider>
  );
  const html = renderToString(tree(serverQueryClient, serverClient));
  const state = JSON.parse(JSON.stringify(dehydrate(serverQueryClient)));

  const el = container();
  el.innerHTML = html;
  expect(text(el, 'h1')).toBe('2026-01-04');
  const browserQueryClient = new QueryClient({
    defaultOptions: hydrationOptions({ serializer }),
  });
  const root = hydrateRoot(
    el,
    <HydrationBoundary state={state} queryClient={browserQueryClient}>
      {tree(browserQueryClient, app.client)}
    </HydrationBoundary>,
  );
  await waitFor(() =>
    expect(browserQueryClient.getQueryCache().getAll()).toHaveLength(1),
  );
  expect(text(el, 'h1')).toBe('2026-01-04');
  expect(db.calls).toEqual(['post.byId:3']);
  root.unmount();
});

test('the context can be bridged into another tree', () => {
  const client = createRouterClient(appRouter, { ctx: { locale: null } });
  let bridged: unknown;
  function Capture() {
    bridged = useContext(TrpcContext);
    return null;
  }
  renderToString(
    <TrpcProvider client={client}>
      <Capture />
    </TrpcProvider>,
  );
  function Inner() {
    return <p>{useTrpcClient() === client ? 'same' : 'other'}</p>;
  }
  const html = renderToString(
    <TrpcContext value={bridged}>
      <Inner />
    </TrpcContext>,
  );
  expect(html).toBe('<p>same</p>');
});

test('createTrpcContext({ keyPrefix }) prefixes the provided helpers', () => {
  const [BillingProvider, useBilling] = createTrpcContext<AppClient>({
    keyPrefix: 'billing',
  });
  const client = createRouterClient(appRouter, { ctx: { locale: null } });
  function Key() {
    return <p>{JSON.stringify(useBilling().post.pathKey())}</p>;
  }
  const html = renderToString(
    <BillingProvider client={client}>
      <Key />
    </BillingProvider>,
  );
  expect(html).toBe('<p>[[&quot;billing&quot;,&quot;post&quot;]]</p>');
});

test("a context typed from a client factory takes its router, its links' context and their types", () => {
  class Offline extends TrpcError.Tagged('OFFLINE') {}
  const links = [
    link<{ context: { priority?: 'high' }; errors: Offline }>(({ op, next }) =>
      next(op),
    ),
    httpLink({ url: 'http://localhost', serializer }),
  ] as const;
  const makeClient = () =>
    createTrpcClient({ router: routerType<AppRouter>(), links });
  const [FactoryProvider, useFromFactory, useFactoryClient] =
    createTrpcContext<typeof makeClient>();
  const [, useFromClient, useClient] =
    createTrpcContext<ReturnType<typeof makeClient>>();
  expectTypeOf(useFromFactory).toEqualTypeOf(useFromClient);
  expectTypeOf(useFactoryClient).toEqualTypeOf(useClient);
  expectTypeOf(useFactoryClient).returns.toEqualTypeOf<
    TrpcClient<
      AppRouter,
      LinksContext<typeof links>,
      undefined,
      LinksTypes<typeof links>
    >
  >();
  expectTypeOf(useFromFactory).not.toEqualTypeOf(
    createTrpcContext<AppRouter>()[1],
  );
  expectTypeOf(makeClient()).toExtend<
    Parameters<typeof FactoryProvider>[0]['client']
  >();
});
