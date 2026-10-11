// @vitest-environment happy-dom
import {
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  VueQueryPlugin,
} from '@tanstack/vue-query';
import {
  createTRPCContext,
  useSubscription,
} from '@trpcdev/tanstack-query/vue';
import type { TRPCClient } from 'trpcdev/client';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { createApp as createVueApp, defineComponent, h, ref } from 'vue';
import { createApp, db, type AppRouter, type Post } from './fixtures/app.ts';
import { click, container, text, waitFor } from './fixtures/dom.ts';

const { TRPCPlugin, useTRPC } = createTRPCContext<AppRouter>();

function mount(setup: () => () => unknown, client: TRPCClient<AppRouter>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const el = container();
  const vueApp = createVueApp(defineComponent({ setup }))
    .use(VueQueryPlugin, { queryClient })
    .use(TRPCPlugin, { client });
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
    const trpc = useTRPC();
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
    const trpc = useTRPC();
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
    const trpc = useTRPC();
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
