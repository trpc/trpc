/** @jsxImportSource preact */
// @vitest-environment happy-dom
import {
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/preact-query';
import {
  createTrpcContext,
  useSubscription,
} from '@trpcdev/tanstack-preact-query';
import { render, type ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { TrpcClient } from 'trpcdev/client';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { createApp, db, type AppRouter, type Post } from './fixtures/app.ts';
import { click, container, text, waitFor } from './fixtures/dom.ts';

const { TrpcProvider, useTrpc } = createTrpcContext<AppRouter>();

function mount(ui: ComponentChildren, client: TrpcClient<AppRouter>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const el = container();
  render(
    <QueryClientProvider client={queryClient}>
      <TrpcProvider client={client}>{ui}</TrpcProvider>
    </QueryClientProvider>,
    el,
  );
  return {
    el,
    [Symbol.dispose]: () => {
      render(null, el);
      el.remove();
    },
  };
}

test('useQuery and useMutation through the provider', async () => {
  await using app = await createApp();
  function Posts() {
    const trpc = useTrpc();
    const queryClient = useQueryClient();
    const list = useQuery(
      trpc.post.list.queryOptions({ input: { limit: 10 } }),
    );
    const missing = useQuery(
      trpc.post.byId.queryOptions({ input: { id: 'nope' } }),
    );
    const create = useMutation(
      trpc.post.create.mutationOptions({
        onSuccess: () => queryClient.invalidateQueries(trpc.post.pathFilter()),
      }),
    );
    if (list.data) expectTypeOf(list.data.items).toEqualTypeOf<Post[]>();
    return (
      <>
        <ul>
          {list.data?.items.map((post) => (
            <li key={post.id}>{post.title}</li>
          ))}
        </ul>
        <p class="error">
          {missing.error?.defined ? missing.error.code : undefined}
        </p>
        <button onClick={() => create.mutate({ title: 'From Preact' })}>
          add
        </button>
      </>
    );
  }
  using view = mount(<Posts />, app.client);
  await waitFor(() => expect(view.el.querySelectorAll('li')).toHaveLength(3));
  await waitFor(() => expect(text(view.el, '.error')).toBe('NOT_FOUND'));
  click(view.el, 'button');
  await waitFor(() =>
    expect(text(view.el, 'li:last-child')).toBe('From Preact'),
  );
});

test('useInfiniteQuery loads pages on demand', async () => {
  await using app = await createApp({ posts: 3 });
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
  await waitFor(() => expect(view.el.querySelectorAll('li')).toHaveLength(3));
  expect(view.el.querySelector('button')).toBeNull();
});

test('useSubscription and live queries update the UI', async () => {
  await using app = await createApp();
  function Live() {
    const trpc = useTrpc();
    const [enabled, setEnabled] = useState(true);
    const added = useSubscription(
      trpc.post.onAdd.subscriptionOptions({ enabled }),
    );
    const tick = useQuery(trpc.clock.ticks.liveOptions({ input: { from: 7 } }));
    return (
      <>
        <p class="status">{added.status}</p>
        <p class="added">{added.data?.title}</p>
        <p class="tick">{tick.data}</p>
        <button onClick={() => setEnabled(false)}>stop</button>
      </>
    );
  }
  using view = mount(<Live />, app.client);
  await waitFor(() => expect(db.listeners.size).toBe(1));
  app.addPost('Preact post');
  await waitFor(() => expect(text(view.el, '.added')).toBe('Preact post'));
  expect(text(view.el, '.status')).toBe('active');
  await waitFor(() =>
    expect(Number(text(view.el, '.tick'))).toBeGreaterThan(7),
  );

  click(view.el, 'button');
  await waitFor(() => expect(text(view.el, '.status')).toBe('idle'));
  await waitFor(() => expect(db.listeners.size).toBe(0));
});
