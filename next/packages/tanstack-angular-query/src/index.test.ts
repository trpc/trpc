// @vitest-environment happy-dom
import '@angular/compiler';
import {
  Component,
  computed,
  inject,
  Injector,
  provideZonelessChangeDetection,
  signal,
  type Signal,
  type Type,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import {
  injectInfiniteQuery,
  injectMutation,
  injectQuery,
  provideTanStackQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import {
  createTrpcContext,
  injectSubscription,
} from '@trpc12/tanstack-angular-query';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import {
  createApp,
  db,
  type Post,
  type AppClient,
} from '../../tanstack-query/src/fixtures/app.ts';
import { click, text, waitFor } from '../../trpc/src/fixtures/dom.ts';

const context = createTrpcContext<AppClient>();
const { injectTrpc } = context;

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

function render<T>(component: Type<T>, client: AppClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideTanStackQuery(queryClient),
      context.provideTrpc(client),
    ],
  });
  const fixture = TestBed.createComponent(component);
  fixture.autoDetectChanges();
  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
    [Symbol.dispose]: () => {
      fixture.destroy();
      TestBed.resetTestingModule();
    },
  };
}

const PostView = Component({
  selector: 'post-view',
  template: `
    <h1>{{ post.data()?.title }}</h1>
    <p>{{ post.error()?.defined ? post.error()?.code : '' }}</p>
    <button class="three" (click)="id.set('3')">3</button>
    <button class="nope" (click)="id.set('nope')">nope</button>
  `,
})(
  class {
    trpc = injectTrpc();
    id = signal('1');
    post = injectQuery(() =>
      this.trpc.post.byId.queryOptions({ input: { id: this.id() } }),
    );
  },
);

test('injectQuery follows signals', async () => {
  await using app = await createApp();
  using view = render(PostView, app.client);
  expectTypeOf(view.fixture.componentInstance.post.data).toEqualTypeOf<
    Signal<Post | undefined>
  >();

  await waitFor(() => expect(text(view.el, 'h1')).toBe('Post 1'));
  click(view.el, '.three');
  await waitFor(() => expect(text(view.el, 'h1')).toBe('Post 3'));
  click(view.el, '.nope');
  await waitFor(() => expect(text(view.el, 'p')).toBe('NOT_FOUND'));
});

const FeedView = Component({
  selector: 'feed-view',
  template: `
    <ul>
      @for (post of posts(); track post.id) {
        <li>{{ post.title }}</li>
      }
    </ul>
    <button class="more" (click)="feed.fetchNextPage()">more</button>
    <button class="add" (click)="create.mutate({ title: 'From Angular' })">
      add
    </button>
  `,
})(
  class {
    trpc = injectTrpc();
    queryClient = inject(QueryClient);
    feed = injectInfiniteQuery(() =>
      this.trpc.post.list.infiniteOptions({
        input: (cursor: number | undefined) => ({ limit: 2, cursor }),
        initialPageParam: undefined,
        getNextPageParam: (page) => page.nextCursor,
      }),
    );
    create = injectMutation(() =>
      this.trpc.post.create.mutationOptions({
        onSuccess: () =>
          this.queryClient.invalidateQueries(this.trpc.post.pathFilter()),
      }),
    );
    posts = computed(
      () => this.feed.data()?.pages.flatMap((page) => page.items) ?? [],
    );
  },
);

test('injectMutation invalidates; injectInfiniteQuery pages', async () => {
  await using app = await createApp({ posts: 3 });
  using view = render(FeedView, app.client);
  expectTypeOf(view.fixture.componentInstance.posts).toEqualTypeOf<
    Signal<Post[]>
  >();

  await waitFor(() => expect(view.el.querySelectorAll('li')).toHaveLength(2));
  click(view.el, '.more');
  await waitFor(() => expect(view.el.querySelectorAll('li')).toHaveLength(3));
  click(view.el, '.add');
  await waitFor(() =>
    expect(text(view.el, 'li:last-child')).toBe('From Angular'),
  );
});

const LiveView = Component({
  selector: 'live-view',
  template: `
    <p class="status">{{ countdown.status() }}</p>
    <p class="added">{{ added.data()?.title }}</p>
    <p class="tick">{{ tick.data() }}</p>
    <button class="again" (click)="from.set(1)">again</button>
  `,
})(
  class {
    trpc = injectTrpc();
    seen: number[] = [];
    from = signal(2);
    countdown = injectSubscription(() =>
      this.trpc.clock.countdown.subscriptionOptions({
        input: { from: this.from() },
        onData: (n) => this.seen.push(n),
      }),
    );
    added = injectSubscription(() =>
      this.trpc.post.onAdd.subscriptionOptions(),
    );
    tick = injectQuery(() =>
      this.trpc.clock.ticks.liveOptions({ input: { from: 40 } }),
    );
  },
);

test('injectSubscription and live queries follow signals', async () => {
  await using app = await createApp();
  using view = render(LiveView, app.client);
  expectTypeOf(view.fixture.componentInstance.added.data).toEqualTypeOf<
    Signal<Post | undefined>
  >();

  await waitFor(() =>
    expect(view.fixture.componentInstance.seen).toEqual([2, 1]),
  );
  await waitFor(() => expect(text(view.el, '.status')).toBe('idle'));
  click(view.el, '.again');
  await waitFor(() =>
    expect(view.fixture.componentInstance.seen).toEqual([2, 1, 1]),
  );

  await waitFor(() => expect(db.listeners.size).toBe(1));
  app.addPost('Angular post');
  await waitFor(() => expect(text(view.el, '.added')).toBe('Angular post'));
  await waitFor(() =>
    expect(Number(text(view.el, '.tick'))).toBeGreaterThan(40),
  );
});

test('destroying the component stops subscriptions', async () => {
  await using app = await createApp();
  {
    using view = render(LiveView, app.client);
    await waitFor(() => expect(db.listeners.size).toBe(1));
    await waitFor(() =>
      expect(Number(text(view.el, '.tick'))).toBeGreaterThan(40),
    );
  }
  await waitFor(() => expect(db.listeners.size).toBe(0));
  await waitFor(() => expect(db.openTickers).toBe(0));
});

test('injectSubscription needs an injection context or an injector', () => {
  expect(() =>
    injectSubscription(() => ({
      subscriptionKey: [['manual']],
      enabled: true,
      subscribe: async function* () {},
    })),
  ).toThrow(/injection context/);
});

const ClientView = Component({
  selector: 'client-view',
  template: `<p class="error">{{ failing.error()?.code }}</p>`,
})(
  class {
    client = context.injectTrpcClient();
    trpc = injectTrpc();
    injector = inject(Injector);
    failing = injectSubscription(() =>
      this.trpc.clock.countdown.subscriptionOptions({ input: { from: 0 } }),
    );
  },
);

test('injectTrpcClient(), a failing subscription, and injectSubscription with an injector', async () => {
  await using app = await createApp();
  using view = render(ClientView, app.client);
  const component = view.fixture.componentInstance;
  expect(component.client).toBe(app.client);
  await waitFor(() => expect(text(view.el, '.error')).toBe('CONFLICT'));

  const added = injectSubscription(
    () => component.trpc.post.onAdd.subscriptionOptions(),
    { injector: component.injector },
  );
  await waitFor(() => {
    TestBed.tick();
    expect(db.listeners.size).toBe(1);
  });
  app.addPost('Injected');
  await waitFor(() => expect(added.data()?.title).toBe('Injected'));
});
