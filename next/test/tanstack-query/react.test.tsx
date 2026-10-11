// @vitest-environment happy-dom
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import {
  createTRPCQueryUtils,
  hydrationOptions,
} from '@trpcdev/tanstack-query';
import {
  createTRPCContext,
  useSubscription,
} from '@trpcdev/tanstack-query/react';
import { Suspense, useState, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import type { TRPCClient } from 'trpcdev/client';
import { createRouterClient } from 'trpcdev/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import {
  appRouter,
  createApp,
  db,
  type AppRouter,
  type Post,
} from './fixtures/app.ts';
import { click, container, text, waitFor } from './fixtures/dom.ts';

const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

function mount(ui: ReactNode, client: TRPCClient<AppRouter>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const el = container();
  const root = createRoot(el);
  root.render(
    <QueryClientProvider client={queryClient}>
      <TRPCProvider client={client}>{ui}</TRPCProvider>
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
  const trpc = useTRPC();
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
    const trpc = useTRPC();
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
    const trpc = useTRPC();
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
    const trpc = useTRPC();
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
    const trpc = useTRPC();
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

test('server render with prefetched data, then hydrate without refetching', async () => {
  await using app = await createApp();
  function Page() {
    const trpc = useTRPC();
    const client = useTRPCClient();
    expectTypeOf(client).toEqualTypeOf<TRPCClient<AppRouter>>();
    const { data } = useSuspenseQuery(
      trpc.post.byId.queryOptions({ input: { id: '3' } }),
    );
    return <h1>{data.createdAt.toISOString().slice(0, 10)}</h1>;
  }

  const serverQueryClient = new QueryClient({
    defaultOptions: hydrationOptions(),
  });
  const serverClient = createRouterClient(appRouter, {
    ctx: { locale: null },
  });
  await serverQueryClient.prefetchQuery(
    createTRPCQueryUtils({ client: serverClient }).post.byId.queryOptions({
      input: { id: '3' },
    }),
  );
  const tree = (queryClient: QueryClient, client: TRPCClient<AppRouter>) => (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider client={client}>
        <Page />
      </TRPCProvider>
    </QueryClientProvider>
  );
  const html = renderToString(tree(serverQueryClient, serverClient));
  const state = JSON.parse(JSON.stringify(dehydrate(serverQueryClient)));

  const el = container();
  el.innerHTML = html;
  expect(text(el, 'h1')).toBe('2026-01-04');
  const browserQueryClient = new QueryClient({
    defaultOptions: hydrationOptions(),
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
