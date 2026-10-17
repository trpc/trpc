// @vitest-environment happy-dom
import {
  createInfiniteQueryController,
  createMutationController,
  createQueryController,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/lit-query';
import {
  createSubscriptionController,
  createTrpcContext,
  createTrpcQueryUtils,
  type TrpcProviderElement,
} from '@trpc12/tanstack-lit-query';
import { createTrpcClient, link, routerType } from '@trpc12/trpc/client';
import { Effect, PubSub, Stream } from 'effect';
import { html, LitElement } from 'lit';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import {
  createApp,
  db,
  type AppRouter,
  type Post,
  type AppClient,
} from '../../tanstack-query/src/fixtures/app.ts';
import {
  click,
  container,
  text,
  waitFor,
} from '../../trpc/src/fixtures/dom.ts';

const context = createTrpcContext<AppClient>();
const { useTrpc } = context;
customElements.define('lit-query-provider', QueryClientProvider);
customElements.define('lit-trpc-provider', context.TrpcProvider);

/** Renders into light DOM so tests can query it. */
class View extends LitElement {
  protected override createRenderRoot() {
    return this;
  }
}

function mount<T extends HTMLElement>(tag: string, client: AppClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const queryProvider = document.createElement(
    'lit-query-provider',
  ) as QueryClientProvider;
  queryProvider.client = queryClient;
  const trpcProvider = document.createElement(
    'lit-trpc-provider',
  ) as TrpcProviderElement<AppRouter>;
  trpcProvider.client = client;
  const view = document.createElement(tag) as T;
  trpcProvider.append(view);
  queryProvider.append(trpcProvider);
  const el = container();
  el.append(queryProvider);
  return { el, view, [Symbol.dispose]: () => el.remove() };
}

class PostView extends View {
  static override properties = { postId: { state: true } };
  declare postId: string;
  trpc = useTrpc(this);
  post = createQueryController(this, () =>
    this.trpc.post.byId.queryOptions({ input: { id: this.postId } }),
  );

  constructor() {
    super();
    this.postId = '1';
  }

  override render() {
    const post = this.post();
    return html`
      <h1>${post.data?.title}</h1>
      <p>${post.error?.defined ? post.error.code : ''}</p>
      <button class="three" @click=${() => (this.postId = '3')}>3</button>
      <button class="nope" @click=${() => (this.postId = 'nope')}>nope</button>
    `;
  }
}
customElements.define('lit-post-view', PostView);

test('createQueryController follows host state', async () => {
  await using app = await createApp();
  using view = mount<PostView>('lit-post-view', app.client);
  expectTypeOf(view.view.post.current.data).toEqualTypeOf<Post | undefined>();

  await waitFor(() => expect(text(view.el, 'h1')).toBe('Post 1'));
  click(view.el, '.three');
  await waitFor(() => expect(text(view.el, 'h1')).toBe('Post 3'));
  click(view.el, '.nope');
  await waitFor(() => expect(text(view.el, 'p')).toBe('NOT_FOUND'));
});

class FeedView extends View {
  trpc = useTrpc(this);
  feed = createInfiniteQueryController(this, () =>
    this.trpc.post.list.infiniteOptions({
      input: (cursor: number | undefined) => ({ limit: 2, cursor }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor,
    }),
  );
  create = createMutationController(this, () =>
    this.trpc.post.create.mutationOptions({
      onSuccess: (_data, _vars, _result, opts) =>
        opts.client.invalidateQueries(this.trpc.post.pathFilter()),
    }),
  );

  override render() {
    const posts = this.feed().data?.pages.flatMap((page) => page.items) ?? [];
    expectTypeOf(posts).toEqualTypeOf<Post[]>();
    return html`
      <ul>
        ${posts.map((post) => html`<li>${post.title}</li>`)}
      </ul>
      <button class="more" @click=${() => this.feed.fetchNextPage()}>
        more
      </button>
      <button
        class="add"
        @click=${() => this.create.mutate({ title: 'From Lit' })}
      >
        add
      </button>
    `;
  }
}
customElements.define('lit-feed-view', FeedView);

test('createMutationController invalidates; infinite controller pages', async () => {
  await using app = await createApp({ posts: 3 });
  using view = mount<FeedView>('lit-feed-view', app.client);

  await waitFor(() => expect(view.el.querySelectorAll('li')).toHaveLength(2));
  click(view.el, '.more');
  await waitFor(() => expect(view.el.querySelectorAll('li')).toHaveLength(3));
  click(view.el, '.add');
  await waitFor(() => expect(text(view.el, 'li:last-child')).toBe('From Lit'));
});

class LiveView extends View {
  static override properties = { from: { state: true } };
  declare from: number;
  seen: number[] = [];
  trpc = useTrpc(this);
  countdown = createSubscriptionController(this, () =>
    this.trpc.clock.countdown.subscriptionOptions({
      input: { from: this.from },
      onData: (n) => this.seen.push(n),
    }),
  );
  added = createSubscriptionController(this, () =>
    this.trpc.post.onAdd.subscriptionOptions(),
  );
  tick = createQueryController(this, () =>
    this.trpc.clock.ticks.liveOptions({ input: { from: 40 } }),
  );

  constructor() {
    super();
    this.from = 2;
  }

  override render() {
    return html`
      <p class="status">${this.countdown().status}</p>
      <p class="added">${this.added().data?.title}</p>
      <p class="tick">${this.tick().data}</p>
      <button class="again" @click=${() => (this.from = 1)}>again</button>
    `;
  }
}
customElements.define('lit-live-view', LiveView);

test('createSubscriptionController and live queries follow host state', async () => {
  await using app = await createApp();
  using view = mount<LiveView>('lit-live-view', app.client);
  const host = view.view;
  expectTypeOf(host.added.current.data).toEqualTypeOf<Post | undefined>();

  await waitFor(() => expect(host.seen).toEqual([2, 1]));
  await waitFor(() => expect(text(view.el, '.status')).toBe('idle'));
  click(view.el, '.again');
  await waitFor(() => expect(host.seen).toEqual([2, 1, 1]));

  await waitFor(() => expect(db.listeners.size).toBe(1));
  app.addPost('Lit post');
  await waitFor(() => expect(text(view.el, '.added')).toBe('Lit post'));
  await waitFor(() =>
    expect(Number(text(view.el, '.tick'))).toBeGreaterThan(40),
  );
});

test('disconnecting the host stops subscriptions', async () => {
  await using app = await createApp();
  {
    using view = mount<LiveView>('lit-live-view', app.client);
    await waitFor(() => expect(db.listeners.size).toBe(1));
    await waitFor(() =>
      expect(Number(text(view.el, '.tick'))).toBeGreaterThan(40),
    );
  }
  await waitFor(() => expect(db.listeners.size).toBe(0));
  await waitFor(() => expect(db.openTickers).toBe(0));
});

test('useTrpc throws outside a provider', async () => {
  class Orphan extends View {
    trpc = useTrpc(this);
  }
  customElements.define('lit-orphan', Orphan);
  const el = container();
  const orphan = document.createElement('lit-orphan') as Orphan;
  el.append(orphan);
  expect(() => orphan.trpc.post.pathKey()).toThrow(/TrpcProvider/);
  el.remove();
});

class ClientView extends View {
  client = context.useTrpcClient(this);
}
customElements.define('lit-client-view', ClientView);

test('a provider swaps its client; a controller with fixed options reconnects, resets and is destroyed', async () => {
  await using app = await createApp();
  using view = mount<ClientView>('lit-client-view', app.client);
  const provider = view.el.querySelector(
    'lit-trpc-provider',
  ) as TrpcProviderElement<AppRouter>;
  expect(await view.view.client.post.byId.query({ id: '1' })).toMatchObject({
    title: 'Post 1',
  });

  const posts = Effect.runSync(PubSub.unbounded<Post>());
  let open = 0;
  const local = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      link((opts) =>
        opts.op.type === 'subscription'
          ? Stream.fromPubSub(posts).pipe(
              Stream.onStart(Effect.sync(() => open++)),
              Stream.ensuring(Effect.sync(() => open--)),
            )
          : Stream.make({ id: '1', title: 'Swapped' }),
      ),
    ],
  }) as unknown as AppClient;
  provider.client = local;
  await provider.updateComplete;
  expect(await view.view.client.post.byId.query({ id: '1' })).toMatchObject({
    title: 'Swapped',
  });

  const host = view.view;
  const parent = host.parentElement!;
  const added = createSubscriptionController(
    host,
    createTrpcQueryUtils({ client: local }).post.onAdd.subscriptionOptions(),
  );
  host.remove();
  await Promise.resolve();
  expect(added.current.status).toBe('idle');

  parent.append(host);
  await waitFor(() => expect(open).toBe(1));
  host.remove();
  parent.append(host);
  await waitFor(() => expect(open).toBe(1));
  const publish = (title: string) =>
    Effect.runSync(
      PubSub.publish(posts, { id: title, title, createdAt: new Date(0) }),
    );
  await waitFor(() => {
    publish('After reconnecting');
    expect(added.current.data?.title).toBe('After reconnecting');
  });

  added.reset();
  expect(added.current.data).toBeUndefined();
  await waitFor(() => {
    publish('After reset');
    expect(added.current.data?.title).toBe('After reset');
  });
  added.destroy();
  await waitFor(() => expect(open).toBe(0));
  added.reset();
  expect(added()).toMatchObject({ status: 'idle', data: undefined });
});
