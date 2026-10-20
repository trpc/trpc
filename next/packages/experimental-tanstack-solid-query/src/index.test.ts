// @vitest-environment happy-dom
import {
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/solid-query';
import {
  createTrpcContext,
  useSubscription,
} from '@trpc12/experimental-tanstack-solid-query';
import { createSignal, type JSX } from 'solid-js';
import h from 'solid-js/h';
import { isServer, render } from 'solid-js/web';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import {
  createApp,
  db,
  type Post,
  type AppClient,
} from '../../tanstack-query/src/fixtures/app.ts';
import {
  click,
  container,
  text,
  waitFor,
} from '../../trpc/src/fixtures/dom.ts';

const [TrpcProvider, useTrpc, useTrpcClient] = createTrpcContext<AppClient>();

function mount(App: () => JSX.Element, client: AppClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const el = container();
  const dispose = render(
    () =>
      h(QueryClientProvider, { client: queryClient }, () =>
        h(TrpcProvider, { client }, () => h(App, {})),
      ) as unknown as JSX.Element,
    el,
  );
  return {
    el,
    [Symbol.dispose]: () => {
      dispose();
      el.remove();
    },
  };
}

test('runs with the reactive (browser) build', () => {
  expect(isServer).toBe(false);
});

test('useQuery follows signals through an accessor', async () => {
  await using app = await createApp();
  const [id, setId] = createSignal('1');
  using view = mount(() => {
    const trpc = useTrpc();
    const post = useQuery(() =>
      trpc.post.byId.queryOptions({ input: { id: id() } }),
    );
    return h('div', [
      h('h1', () => post.data?.title),
      h('p', () => (post.error?.defined ? post.error.code : '')),
    ]) as unknown as JSX.Element;
  }, app.client);

  await waitFor(() => expect(text(view.el, 'h1')).toBe('Post 1'));
  setId('3');
  await waitFor(() => expect(text(view.el, 'h1')).toBe('Post 3'));
  setId('nope');
  await waitFor(() => expect(text(view.el, 'p')).toBe('NOT_FOUND'));
});

test('useMutation invalidates; useInfiniteQuery pages', async () => {
  await using app = await createApp({ posts: 3 });
  using view = mount(() => {
    const trpc = useTrpc();
    const queryClient = useQueryClient();
    const feed = useInfiniteQuery(() =>
      trpc.post.list.infiniteOptions({
        input: (cursor: number | undefined) => ({ limit: 2, cursor }),
        initialPageParam: undefined,
        getNextPageParam: (page) => page.nextCursor,
      }),
    );
    const create = useMutation(() =>
      trpc.post.create.mutationOptions({
        onSuccess: () =>
          queryClient.invalidateQueries(trpc.post.list.infiniteFilter()),
      }),
    );
    const posts = () => feed.data?.pages.flatMap((page) => page.items) ?? [];
    expectTypeOf(posts).returns.toEqualTypeOf<Post[]>();
    return h('div', [
      h('ul', () => posts().map((post) => h('li', post.title))),
      h(
        'button',
        { class: 'more', onClick: () => feed.fetchNextPage() },
        'more',
      ),
      h(
        'button',
        { class: 'add', onClick: () => create.mutate({ title: 'From Solid' }) },
        'add',
      ),
    ]) as unknown as JSX.Element;
  }, app.client);

  await waitFor(() => expect(view.el.querySelectorAll('li')).toHaveLength(2));
  click(view.el, '.more');
  await waitFor(() => expect(view.el.querySelectorAll('li')).toHaveLength(3));
  click(view.el, '.add');
  await waitFor(() =>
    expect(text(view.el, 'li:last-child')).toBe('From Solid'),
  );
});

test('useSubscription and live queries follow signals', async () => {
  await using app = await createApp();
  const [from, setFrom] = createSignal(2);
  const seen: number[] = [];
  using view = mount(() => {
    const trpc = useTrpc();
    const countdown = useSubscription(() =>
      trpc.clock.countdown.subscriptionOptions({
        input: { from: from() },
        onData: (n) => seen.push(n),
      }),
    );
    const added = useSubscription(() => trpc.post.onAdd.subscriptionOptions());
    const tick = useQuery(() =>
      trpc.clock.ticks.liveOptions({ input: { from: 40 } }),
    );
    return h('div', [
      h('p', { class: 'status' }, () => countdown.status),
      h('p', { class: 'added' }, () => added.data?.title),
      h('p', { class: 'tick' }, () => tick.data),
    ]) as unknown as JSX.Element;
  }, app.client);

  await waitFor(() => expect(seen).toEqual([2, 1]));
  await waitFor(() => expect(text(view.el, '.status')).toBe('idle'));
  setFrom(1);
  await waitFor(() => expect(seen).toEqual([2, 1, 1]));

  await waitFor(() => expect(db.listeners.size).toBe(1));
  app.addPost('Solid post');
  await waitFor(() => expect(text(view.el, '.added')).toBe('Solid post'));
  await waitFor(() =>
    expect(Number(text(view.el, '.tick'))).toBeGreaterThan(40),
  );
});

test('useTrpcClient(), a failing subscription, and no provider', async () => {
  await using app = await createApp();
  let client: unknown;
  using view = mount(() => {
    client = useTrpcClient();
    const failing = useSubscription(() =>
      useTrpc().clock.countdown.subscriptionOptions({ input: { from: 0 } }),
    );
    return h('p', () => failing.error?.code ?? '') as unknown as JSX.Element;
  }, app.client);
  expect(client).toBe(app.client);
  await waitFor(() => expect(text(view.el, 'p')).toBe('CONFLICT'));
  expect(() => useTrpc()).toThrow('Wrap your component in <TrpcProvider>');
});
