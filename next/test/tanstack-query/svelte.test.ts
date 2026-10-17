// @vitest-environment happy-dom
import { QueryClient } from '@tanstack/svelte-query';
import {
  createSubscription,
  type CreateSubscriptionResult,
} from '@trpc12/tanstack-svelte-query';
import { flushSync, mount, unmount, type Component } from 'svelte';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import {
  createApp,
  db,
  type AppClient,
} from '../../packages/tanstack-query/src/fixtures/app.ts';
import {
  click,
  container,
  text,
  waitFor,
} from '../../packages/trpc/src/fixtures/dom.ts';
import Failing from './svelte/Failing.svelte';
import Feed from './svelte/Feed.svelte';
import Live from './svelte/Live.svelte';
import Post from './svelte/Post.svelte';
import Root from './svelte/Root.svelte';
import { useTrpc } from './svelte/trpc.ts';

function render<TProps extends Record<string, unknown>>(
  app: Component<TProps>,
  client: AppClient,
  props?: TProps,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const el = container();
  const instance = mount(Root, {
    target: el,
    props: { queryClient, client, app, props },
  });
  flushSync();
  return {
    el,
    [Symbol.asyncDispose]: async () => {
      await unmount(instance);
      el.remove();
    },
  };
}

test('createQuery follows $state through a getter', async () => {
  await using app = await createApp();
  await using view = render(Post, app.client);

  await waitFor(() => expect(text(view.el, 'h1')).toBe('Post 1'));
  click(view.el, '.three');
  await waitFor(() => expect(text(view.el, 'h1')).toBe('Post 3'));
  click(view.el, '.nope');
  await waitFor(() => expect(text(view.el, 'p')).toBe('NOT_FOUND'));
});

test('createMutation invalidates; createInfiniteQuery pages', async () => {
  await using app = await createApp({ posts: 3 });
  await using view = render(Feed, app.client);

  await waitFor(() => expect(view.el.querySelectorAll('li')).toHaveLength(2));
  click(view.el, '.more');
  await waitFor(() => expect(view.el.querySelectorAll('li')).toHaveLength(3));
  click(view.el, '.add');
  await waitFor(() =>
    expect(text(view.el, 'li:last-child')).toBe('From Svelte'),
  );
});

test('createSubscription and live queries follow $state', async () => {
  await using app = await createApp();
  const seen: number[] = [];
  await using view = render(Live, app.client, {
    onCountdown: (n: number) => seen.push(n),
  });

  await waitFor(() => expect(seen).toEqual([2, 1]));
  await waitFor(() => expect(text(view.el, '.status')).toBe('idle'));
  click(view.el, '.again');
  await waitFor(() => expect(seen).toEqual([2, 1, 1]));

  await waitFor(() => expect(db.listeners.size).toBe(1));
  app.addPost('Svelte post');
  await waitFor(() => expect(text(view.el, '.added')).toBe('Svelte post'));
  await waitFor(() =>
    expect(Number(text(view.el, '.tick'))).toBeGreaterThan(40),
  );
});

test('unmounting stops subscriptions', async () => {
  await using app = await createApp();
  {
    await using view = render(Live, app.client, { onCountdown: () => {} });
    await waitFor(() => expect(db.listeners.size).toBe(1));
    await waitFor(() =>
      expect(Number(text(view.el, '.tick'))).toBeGreaterThan(40),
    );
  }
  await waitFor(() => expect(db.listeners.size).toBe(0));
  await waitFor(() => expect(db.openTickers).toBe(0));
});

test('types: createSubscription infers events and errors', () => {
  // Runes only run inside components; this checks types.
  void (() => {
    const trpc = useTrpc();
    const sub = createSubscription(() =>
      trpc.clock.countdown.subscriptionOptions({ input: { from: 3 } }),
    );
    expectTypeOf(sub.data).toEqualTypeOf<number | undefined>();
    expectTypeOf(sub).toExtend<CreateSubscriptionResult<number, unknown>>();
    createSubscription(() =>
      // @ts-expect-error countdown needs `from`
      trpc.clock.countdown.subscriptionOptions({ input: {} }),
    );
  });
});

test('useTrpcClient(), a failing subscription, and no parent context', async () => {
  await using app = await createApp();
  let client: unknown;
  await using view = render(Failing, app.client, {
    onClient: (c: unknown) => (client = c),
  });
  expect(client).toBe(app.client);
  await waitFor(() => expect(text(view.el, '.error')).toBe('CONFLICT'));

  const el = container();
  expect(() =>
    mount(Failing, { target: el, props: { onClient: () => {} } }),
  ).toThrow('Call setTrpcContext() in a parent first');
  el.remove();
});
