// @vitest-environment happy-dom
import {
  dehydrate,
  hydrate,
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  VueQueryPlugin,
} from '@tanstack/vue-query';
import {
  createTrpcContext,
  createTrpcQueryUtils,
  hydrationOptions,
  useSubscription,
} from '@trpc12/tanstack-vue-query';
import { createRouterClient } from '@trpc12/trpc/server';
import { expect, expectTypeOf, test, vi } from 'vite-plus/test';
import {
  createApp as createVueApp,
  createSSRApp,
  defineComponent,
  effectScope,
  h,
  ref,
} from 'vue';
import { renderToString } from 'vue/server-renderer';
import {
  appRouter,
  createApp,
  db,
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

const { TrpcPlugin, provideTrpc, useTrpc, useTrpcClient } =
  createTrpcContext<AppClient>();

function mount(setup: () => () => unknown, client: AppClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const el = container();
  const vueApp = createVueApp(defineComponent({ setup }))
    .use(VueQueryPlugin, { queryClient })
    .use(TrpcPlugin, { client });
  vueApp.mount(el);
  return {
    el,
    [Symbol.dispose]: () => {
      vueApp.unmount();
      el.remove();
    },
  };
}

test('useQuery follows reactive input through a getter', async () => {
  await using app = await createApp();
  const id = ref('1');
  using view = mount(() => {
    const trpc = useTrpc();
    const post = useQuery(() =>
      trpc.post.byId.queryOptions({ input: { id: id.value } }),
    );
    return () =>
      h('div', [
        h('h1', post.data.value?.title),
        h('p', post.error.value?.defined ? post.error.value.code : ''),
      ]);
  }, app.client);

  await waitFor(() => expect(text(view.el, 'h1')).toBe('Post 1'));
  id.value = '2';
  await waitFor(() => expect(text(view.el, 'h1')).toBe('Post 2'));
  id.value = 'nope';
  await waitFor(() => expect(text(view.el, 'p')).toBe('NOT_FOUND'));
});

test('useMutation invalidates; useInfiniteQuery pages', async () => {
  await using app = await createApp({ posts: 3 });
  using view = mount(() => {
    const trpc = useTrpc();
    const queryClient = useQueryClient();
    const feed = useInfiniteQuery(
      trpc.post.list.infiniteOptions({
        input: (cursor: number | undefined) => ({ limit: 2, cursor }),
        initialPageParam: undefined,
        getNextPageParam: (page) => page.nextCursor,
      }),
    );
    const create = useMutation(
      trpc.post.create.mutationOptions({
        onSuccess: () => queryClient.invalidateQueries(trpc.post.pathFilter()),
      }),
    );
    return () => {
      const posts = feed.data.value?.pages.flatMap((page) => page.items) ?? [];
      expectTypeOf(posts).toEqualTypeOf<Post[]>();
      return h('div', [
        h(
          'ul',
          posts.map((post) => h('li', { key: post.id }, post.title)),
        ),
        h(
          'button',
          { class: 'more', onClick: () => void feed.fetchNextPage() },
          'more',
        ),
        h(
          'button',
          { class: 'add', onClick: () => create.mutate({ title: 'From Vue' }) },
          'add',
        ),
      ]);
    };
  }, app.client);

  await waitFor(() => expect(view.el.querySelectorAll('li')).toHaveLength(2));
  click(view.el, '.more');
  await waitFor(() => expect(view.el.querySelectorAll('li')).toHaveLength(3));
  click(view.el, '.add');
  await waitFor(() => expect(text(view.el, 'li:last-child')).toBe('From Vue'));
});

test('useSubscription restarts when its getter changes', async () => {
  await using app = await createApp();
  const from = ref(3);
  const seen: number[] = [];
  using view = mount(() => {
    const trpc = useTrpc();
    const countdown = useSubscription(() =>
      trpc.clock.countdown.subscriptionOptions({
        input: { from: from.value },
        onData: (n) => seen.push(n),
      }),
    );
    const added = useSubscription(trpc.post.onAdd.subscriptionOptions());
    const tick = useQuery(trpc.clock.ticks.liveOptions({ input: { from: 1 } }));
    return () =>
      h('div', [
        h('p', { class: 'countdown' }, String(countdown.data.value)),
        h('p', { class: 'status' }, countdown.status.value),
        h('p', { class: 'added' }, added.data.value?.title),
        h('p', { class: 'tick' }, tick.data.value),
      ]);
  }, app.client);

  await waitFor(() => expect(seen).toEqual([3, 2, 1]));
  await waitFor(() => expect(text(view.el, '.status')).toBe('idle'));
  from.value = 2;
  await waitFor(() => expect(seen).toEqual([3, 2, 1, 2, 1]));

  await waitFor(() => expect(db.listeners.size).toBe(1));
  app.addPost('Vue post');
  await waitFor(() => expect(text(view.el, '.added')).toBe('Vue post'));
  await waitFor(() =>
    expect(Number(text(view.el, '.tick'))).toBeGreaterThan(1),
  );
});

test('server render with prefetched data and no subscription, then hydrate without refetching', async () => {
  await using app = await createApp();
  const Page = defineComponent({
    setup() {
      const trpc = useTrpc();
      const post = useQuery(
        trpc.post.byId.queryOptions({ input: { id: '3' } }),
      );
      const added = useSubscription(trpc.post.onAdd.subscriptionOptions());
      return () =>
        h('div', [
          h('h1', post.data.value?.createdAt.toISOString().slice(0, 10)),
          h('p', added.status.value),
        ]);
    },
  });
  const queryClient = () =>
    new QueryClient({
      defaultOptions: {
        ...hydrationOptions({ serializer }),
        queries: { staleTime: 30_000 },
      },
    });
  const tree = (queryClient: QueryClient, client: AppClient) =>
    createSSRApp(Page)
      .use(VueQueryPlugin, { queryClient })
      .use(TrpcPlugin, { client });

  const serverQueryClient = queryClient();
  const serverClient = createRouterClient(appRouter, { ctx: { locale: null } });
  await serverQueryClient.query(
    createTrpcQueryUtils({ client: serverClient }).post.byId.queryOptions({
      input: { id: '3' },
    }),
  );
  const html = await renderToString(tree(serverQueryClient, serverClient));
  expect(html).toContain('<h1>2026-01-04</h1><p>idle</p>');
  expect(db.listeners.size).toBe(0);
  const state = JSON.parse(JSON.stringify(dehydrate(serverQueryClient)));

  const el = container();
  el.innerHTML = html;
  const browserQueryClient = queryClient();
  hydrate(browserQueryClient, state);
  const vueApp = tree(browserQueryClient, app.client);
  vueApp.mount(el);
  using _ = {
    [Symbol.dispose]: () => {
      vueApp.unmount();
      el.remove();
    },
  };
  expect(text(el, 'h1')).toBe('2026-01-04');
  await waitFor(() => expect(db.listeners.size).toBe(1));
  expect(db.calls).toEqual(['post.byId:3']);
});

test('provideTrpc() and useTrpcClient(), a failing subscription, one in an effect scope, and no provider', async () => {
  await using app = await createApp();
  let client: unknown;
  const Child = defineComponent({
    setup() {
      client = useTrpcClient();
      const failing = useSubscription(
        useTrpc().clock.countdown.subscriptionOptions({ input: { from: 0 } }),
      );
      return () => h('p', { class: 'error' }, failing.error.value?.code ?? '');
    },
  });
  const el = container();
  const vueApp = createVueApp(
    defineComponent({
      setup() {
        provideTrpc(app.client);
        return () => h(Child);
      },
    }),
  ).use(VueQueryPlugin, { queryClient: new QueryClient() });
  vueApp.mount(el);
  using _ = {
    [Symbol.dispose]: () => {
      vueApp.unmount();
      el.remove();
    },
  };
  expect(client).toBe(app.client);
  await waitFor(() => expect(text(el, '.error')).toBe('CONFLICT'));

  const scope = effectScope();
  const added = scope.run(() =>
    useSubscription(app.trpc.post.onAdd.subscriptionOptions()),
  )!;
  await waitFor(() => expect(db.listeners.size).toBe(1));
  app.addPost('In a scope');
  await waitFor(() => expect(added.data.value?.title).toBe('In a scope'));
  scope.stop();
  await waitFor(() => expect(db.listeners.size).toBe(0));

  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(() => useTrpc()).toThrow(
    'Install TrpcPlugin or call provideTrpc() first',
  );
  warn.mockRestore();
});
