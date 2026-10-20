// @vitest-environment happy-dom
import {
  cacheLink,
  createReactClient,
  dehydrate,
  hydrate,
  refetchOnReconnectLink,
  refetchOnWindowFocusLink,
  standardLinks,
  structuralSharingLink,
  useQuery,
  useQueryState,
  type QueryPromise,
} from '@trpc12/experimental-react';
import { link, localLink, routerType, type AnyLink } from '@trpc12/trpc/client';
import { createSerializer } from '@trpc12/trpc/serializer';
import { type Duration, Effect, Stream } from 'effect';
import { Component, Suspense, use, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { prerender } from 'react-dom/static';
import { expect, test, vi } from 'vite-plus/test';
import { waitFor } from '../../trpc/src/fixtures/dom.ts';
import {
  db,
  freshDb,
  router,
  tick,
  type AppRouter,
  type Post,
} from '../../trpc/src/fixtures/posts.ts';

const serializer = createSerializer();

const make = <const L extends ReadonlyArray<AnyLink>>(
  links: L,
  isServer = false,
) =>
  createReactClient({
    router: routerType<AppRouter>(),
    links: [...links, localLink({ router, serializer })],
    isServer,
  });

/** One test's page: fresh posts and captured `console.error`s, emptied after. */
const domCleanup = () => {
  const posts = freshDb();
  const warnings: string[] = [];
  vi.spyOn(console, 'error').mockImplementation((message: unknown) => {
    warnings.push(String(message));
  });
  return {
    warnings,
    [Symbol.dispose]: () => {
      posts[Symbol.dispose]();
      document.body.innerHTML = '';
    },
  };
};

let renders = 0;
function Title(props: { post: QueryPromise<Post> }) {
  renders++;
  const post = use(useQuery(props.post));
  return <h1>{post.title}</h1>;
}

function Fetching(props: { post: QueryPromise<Post> }) {
  const state = useQueryState(props.post);
  return <p>{state.isFetching ? 'fetching' : 'idle'}</p>;
}

function mount(ui: ReactNode) {
  renders = 0;
  const el = document.createElement('div');
  document.body.append(el);
  const root = createRoot(el);
  root.render(<Suspense fallback={<p>loading</p>}>{ui}</Suspense>);
  return { el, unmount: () => root.unmount() };
}

const h1 = (el: HTMLElement) => el.querySelector('h1')?.textContent;

test('a loader starts the query; the component reads it with use() without uncached-promise warnings', async () => {
  using dom = domCleanup();
  const trpc = make([]);
  const post = trpc.post.byId.query({ id: '1' }); // the loader
  const view = mount(<Title post={post} />);
  await waitFor(() => expect(h1(view.el)).toBe('Hello'));
  expect(db.calls).toEqual(['byId:1']);
  expect(dom.warnings.filter((w) => w.includes('uncached promise'))).toEqual(
    [],
  );
  view.unmount();
});

test('setData and refetches re-render; an unchanged refetch with structural sharing does not', async () => {
  using _dom = domCleanup();
  const trpc = make([cacheLink(), structuralSharingLink()]);
  const post = trpc.post.byId.query({ id: '1' });
  await post;
  const view = mount(<Title post={post} />);
  await waitFor(() => expect(h1(view.el)).toBe('Hello'));
  const before = renders;

  await trpc.post.byId.invalidate({ id: '1' });
  await tick();
  expect(renders).toBe(before);

  trpc.post.byId.setData({ id: '1' }, (prev) => ({ ...prev!, title: 'Set' }));
  await waitFor(() => expect(h1(view.el)).toBe('Set'));
  expect(view.el.textContent).not.toContain('loading');
  view.unmount();
});

test('refetchOnWindowFocusLink refetches what is on screen when the page is visible again', async () => {
  using _dom = domCleanup();
  const trpc = make([cacheLink(), refetchOnWindowFocusLink()]);
  const post = trpc.post.byId.query({ id: '1' });
  const view = mount(
    <>
      <Title post={post} />
      <Fetching post={post} />
    </>,
  );
  await waitFor(() => expect(h1(view.el)).toBe('Hello'));
  await waitFor(() =>
    expect([...trpc.store.entries()][0]?.observers).toBeGreaterThan(0),
  );
  db.posts.get('1')!.title = 'Refocused';
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'hidden',
  });
  document.dispatchEvent(new Event('visibilitychange'));
  await tick(5);
  expect(db.calls).toEqual(['byId:1']);
  delete (document as { visibilityState?: unknown }).visibilityState;
  document.dispatchEvent(new Event('visibilitychange'));
  await waitFor(() => expect(h1(view.el)).toBe('Refocused'));
  expect(view.el.querySelector('p')?.textContent).toBe('idle');
  expect(db.calls).toEqual(['byId:1', 'byId:1']);
  view.unmount();
  trpc.store.dispose();
});

test('server render, dehydrate, then hydrateRoot in the browser without a request', async () => {
  using dom = domCleanup();
  const server = make(standardLinks(), true);
  const app = (trpc: typeof server) => (
    <Suspense fallback={<p>loading</p>}>
      <Title post={trpc.post.byId.query({ id: '1' })} />
    </Suspense>
  );
  const rendered = await prerender(app(server));
  const html = await new Response(rendered.prelude).text();
  expect(html).toContain('<h1>Hello</h1>');
  const state = JSON.parse(JSON.stringify(dehydrate(server)));

  const browser = make(standardLinks({ staleTime: 60_000 }));
  hydrate(browser, state);
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.append(el);
  const root = hydrateRoot(el, app(browser));
  await tick(20);
  expect(h1(el)).toBe('Hello');
  expect(db.calls).toEqual(['byId:1']);
  expect(dom.warnings).toEqual([]);
  root.unmount();
  browser.store.dispose();
});

test('refetchOnReconnectLink refetches what is on screen and stale when the browser is back online', async () => {
  using _dom = domCleanup();
  const real = Date.now.bind(Date);
  const clock = vi.spyOn(Date, 'now');
  const trpc = make([
    cacheLink({ staleTime: 60_000 }),
    refetchOnReconnectLink(),
  ]);
  const post = trpc.post.byId.query({ id: '1' });
  const view = mount(<Title post={post} />);
  await waitFor(() => expect(h1(view.el)).toBe('Hello'));
  await waitFor(() =>
    expect([...trpc.store.entries()][0]?.observers).toBeGreaterThan(0),
  );
  db.posts.get('1')!.title = 'Online';
  window.dispatchEvent(new Event('online'));
  await tick(5);
  expect(db.calls).toEqual(['byId:1']);
  clock.mockImplementation(() => real() + 60_000);
  window.dispatchEvent(new Event('online'));
  await waitFor(() => expect(h1(view.el)).toBe('Online'));
  view.unmount();
  trpc.store.dispose();
});

function Refetch(props: { post: QueryPromise<Post> }) {
  const state = useQueryState(props.post);
  return (
    <button type="button" onClick={() => void state.refetch()}>
      {state.isFetching ? 'fetching' : 'idle'}
    </button>
  );
}

test('useQueryState().refetch refetches the query', async () => {
  using _dom = domCleanup();
  const trpc = make([cacheLink({ staleTime: 60_000 })]);
  const post = trpc.post.byId.query({ id: '1' });
  const view = mount(
    <>
      <Title post={post} />
      <Refetch post={post} />
    </>,
  );
  await waitFor(() => expect(h1(view.el)).toBe('Hello'));
  db.posts.get('1')!.title = 'Again';
  view.el.querySelector('button')!.click();
  await waitFor(() => expect(h1(view.el)).toBe('Again'));
  expect(db.calls).toEqual(['byId:1', 'byId:1']);
  view.unmount();
});

class Boundary extends Component<{ children: ReactNode }, { error?: Error }> {
  override state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }
  override render(): ReactNode {
    return this.state.error ? (
      <p>{this.state.error.message}</p>
    ) : (
      this.props.children
    );
  }
}

let picks = 0;
function Picked(props: { post: QueryPromise<Post> }) {
  picks++;
  const picked = use(
    useQuery(props.post, {
      select: (post) => ({ title: post.title, first: post.tags[0] }),
    }),
  );
  return (
    <h2>
      {picked.title} {picked.first}
    </h2>
  );
}

const h2 = (el: HTMLElement) => el.querySelector('h2')?.textContent;

test('select picks a part and re-renders only when that part changes', async () => {
  using _dom = domCleanup();
  picks = 0;
  const trpc = make([cacheLink({ staleTime: 60_000 })]);
  // The first load is pending: select applies when it resolves.
  const post = trpc.post.byId.query({ id: '1' });
  const view = mount(<Picked post={post} />);
  await waitFor(() => expect(h2(view.el)).toBe('Hello a'));
  const before = picks;

  // New data, without structuralSharingLink, but the same picked part.
  trpc.post.byId.setData({ id: '1' }, (prev) => ({
    ...prev!,
    at: new Date(7),
  }));
  await tick(5);
  expect(picks).toBe(before);

  trpc.post.byId.setData({ id: '1' }, (prev) => ({
    ...prev!,
    title: 'Picked',
  }));
  await waitFor(() => expect(h2(view.el)).toBe('Picked a'));
  expect(picks).toBe(before + 1);
  expect(view.el.textContent).not.toContain('loading');
  view.unmount();
});

test('select reads cached data without suspending, and keeps the parts that did not change', async () => {
  using _dom = domCleanup();
  const trpc = make([cacheLink({ staleTime: 60_000 })]);
  const list = trpc.post.list.query({ limit: 2, order: 'asc' });
  await list;
  const seen: Array<ReadonlyArray<{ id: string; tags: string[] }>> = [];
  function Ids() {
    const rows = use(
      useQuery(list, {
        select: (posts) => posts.map((p) => ({ id: p.id, tags: p.tags })),
      }),
    );
    seen.push(rows);
    return <p>{rows.map((row) => row.id).join(',')}</p>;
  }
  const view = mount(<Ids />);
  await waitFor(() => expect(view.el.textContent).toBe('1,2'));
  expect(seen).toHaveLength(1);

  db.posts.get('2')!.tags = ['c'];
  await trpc.post.list.invalidate();
  await waitFor(() => expect(seen).toHaveLength(2));
  expect(seen[1]![0]).toBe(seen[0]![0]);
  expect(seen[1]![1]).not.toBe(seen[0]![1]);
  view.unmount();
});

test('select failures and failed loads reach the error boundary', async () => {
  using _dom = domCleanup();
  const trpc = make([cacheLink({ staleTime: 60_000 })]);
  function Throws(props: { post: QueryPromise<Post>; when: string }) {
    const title = use(
      useQuery(props.post, {
        select: (post) => {
          if (post.title === props.when) throw new Error(`no ${post.title}`);
          return post.title;
        },
      }),
    );
    return <h1>{title}</h1>;
  }
  const loaded = trpc.post.byId.query({ id: '1' });
  await loaded;
  const thrown = mount(
    <Boundary>
      <Throws post={loaded} when="Hello" />
    </Boundary>,
  );
  await waitFor(() => expect(thrown.el.textContent).toBe('no Hello'));
  thrown.unmount();

  const loading = trpc.post.byId.query({ id: '2' });
  const late = mount(
    <Boundary>
      <Throws post={loading} when="World" />
    </Boundary>,
  );
  await waitFor(() => expect(late.el.textContent).toBe('no World'));
  late.unmount();

  // A load that fails, read while pending and once it has failed.
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  const gated = make([
    cacheLink({ staleTime: 60_000 }),
    link((opts) =>
      Stream.unwrap(
        Effect.promise(() => gate).pipe(Effect.as(opts.next(opts.op))),
      ),
    ),
  ]);
  const missing = gated.post.byId.query({ id: 'missing' });
  const pendingView = mount(
    <Boundary>
      <Throws post={missing} when="" />
    </Boundary>,
  );
  await waitFor(() => expect(pendingView.el.textContent).toBe('loading'));
  open();
  const reason = await missing.then(
    () => '',
    (error: Error) => error.message,
  );
  await waitFor(() => expect(pendingView.el.textContent).toBe(reason));
  pendingView.unmount();
  const failed = mount(
    <Boundary>
      <Throws post={missing} when="" />
    </Boundary>,
  );
  await waitFor(() => expect(failed.el.textContent).toBe(reason));
  failed.unmount();
});

function Polled(props: {
  post: QueryPromise<Post>;
  every: Duration.Input | false;
}) {
  const post = use(useQuery(props.post, { refetchInterval: props.every }));
  return <h1>{post.title}</h1>;
}

test('refetchInterval polls while mounted, and stops on unmount', async () => {
  using _dom = domCleanup();
  const trpc = make([cacheLink({ staleTime: 60_000 })]);
  const post = trpc.post.byId.query({ id: '1' });
  const view = mount(<Polled post={post} every="5 millis" />);
  await waitFor(() => expect(h1(view.el)).toBe('Hello'));
  db.posts.get('1')!.title = 'Polled';
  await waitFor(() => expect(h1(view.el)).toBe('Polled'));
  view.unmount();
  const calls = db.calls.length;
  await tick(20);
  expect(db.calls).toHaveLength(calls);

  const off = mount(<Polled post={post} every={false} />);
  await tick(20);
  expect(db.calls).toHaveLength(calls);
  off.unmount();
});

test('refetchInterval waits while the page is hidden, and refetches once it is visible', async () => {
  using _dom = domCleanup();
  const trpc = make([cacheLink({ staleTime: 60_000 })]);
  const post = trpc.post.byId.query({ id: '1' });
  await post;
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'hidden',
  });
  const view = mount(<Polled post={post} every={5} />);
  await waitFor(() => expect(h1(view.el)).toBe('Hello'));
  db.posts.get('1')!.title = 'Visible';
  await tick(30);
  // Another hidden-to-hidden change doesn't wake it.
  document.dispatchEvent(new Event('visibilitychange'));
  await tick(5);
  expect(db.calls).toEqual(['byId:1']);
  delete (document as { visibilityState?: unknown }).visibilityState;
  document.dispatchEvent(new Event('visibilitychange'));
  await waitFor(() => expect(h1(view.el)).toBe('Visible'));

  // Unmounting while it waits removes its listener.
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'hidden',
  });
  await tick(20);
  const calls = db.calls.length;
  view.unmount();
  delete (document as { visibilityState?: unknown }).visibilityState;
  document.dispatchEvent(new Event('visibilitychange'));
  await tick(20);
  expect(db.calls).toHaveLength(calls);
});

test("useQuery() only takes a React client's query promise", async () => {
  using _dom = domCleanup();
  const foreign = Promise.resolve() as unknown as QueryPromise<Post>;
  const view = mount(
    <Boundary>
      <Title post={foreign} />
    </Boundary>,
  );
  await waitFor(() =>
    expect(view.el.textContent).toBe(
      "useQuery() takes a promise from a React client's .query()",
    ),
  );
  view.unmount();
});
