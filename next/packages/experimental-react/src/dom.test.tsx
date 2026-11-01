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
  useMutation,
  useQuery,
  useQueryState,
  type QueryPromise,
} from '@trpc12/experimental-react';
import {
  link,
  localLink,
  routerType,
  TrpcError,
  type AnyLink,
} from '@trpc12/trpc/client';
import { error, initTrpc } from '@trpc12/trpc/server';
import { experimental_createProgressiveJson } from '@trpc12/trpc/transformer';
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

const t = initTrpc();

const transformer = experimental_createProgressiveJson();

const make = <const L extends ReadonlyArray<AnyLink>>(
  links: L,
  isServer = false,
) =>
  createReactClient({
    router: routerType<AppRouter>(),
    links: [...links, localLink({ router, transformer })],
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

/** Renders `hook` in a component and reads its latest result. */
function renderHook<T>(hook: () => T) {
  const box = { current: undefined as T };
  function Probe() {
    box.current = hook();
    return null;
  }
  const view = mount(<Probe />);
  return Object.assign(box, { unmount: view.unmount });
}

const local = t.router({
  item: {
    claim: t.procedure.mutation(() =>
      error({ code: 'CONFLICT', data: { reason: 'taken' } }),
    ),
  },
});

test('useMutation tracks the latest call: pending, then data or the typed error', async () => {
  using _dom = domCleanup();
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  const trpc = make([
    link((opts) =>
      Stream.unwrap(
        Effect.promise(() => gate).pipe(Effect.as(opts.next(opts.op))),
      ),
    ),
  ]);
  const rename = renderHook(() => useMutation(trpc.post.rename));
  await waitFor(() => expect(rename.current.status).toBe('idle'));
  const mutate = rename.current.mutate;

  const done = rename.current.mutate({ id: '1', title: 'Renamed' });
  await waitFor(() => expect(rename.current.isPending).toBe(true));
  expect(rename.current.input).toEqual({ id: '1', title: 'Renamed' });
  open();
  expect(await done).toBe('Renamed');
  await waitFor(() => expect(rename.current.status).toBe('success'));
  expect(rename.current.data).toBe('Renamed');
  expect(rename.current.isPending).toBe(false);
  expect(rename.current.mutate).toBe(mutate);

  const claims = createReactClient({
    router: routerType<typeof local>(),
    links: [localLink({ router: local })],
  });
  const claim = renderHook(() => useMutation(claims.item.claim));
  await waitFor(() => expect(claim.current.status).toBe('idle'));
  // The hook handles the rejection: an ignored call fails nothing.
  void claim.current.mutate();
  await waitFor(() => expect(claim.current.status).toBe('error'));
  const err = claim.current.error;
  expect(err?.defined && err.code === 'CONFLICT' && err.data.reason).toBe(
    'taken',
  );
  await expect(claim.current.mutate()).rejects.toBeInstanceOf(TrpcError);

  claim.current.reset();
  await waitFor(() => expect(claim.current.status).toBe('idle'));
  expect(claim.current.error).toBeUndefined();
  rename.unmount();
  claim.unmount();
});

test('useMutation: only the latest call updates the state, and reset() drops the one in flight', async () => {
  using _dom = domCleanup();
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  const trpc = make([
    link((opts) =>
      opts.op.input && (opts.op.input as { title: string }).title === 'Slow'
        ? Stream.unwrap(
            Effect.promise(() => gate).pipe(Effect.as(opts.next(opts.op))),
          )
        : opts.next(opts.op),
    ),
  ]);
  const rename = renderHook(() => useMutation(trpc.post.rename));
  await waitFor(() => expect(rename.current.status).toBe('idle'));
  const slow = rename.current.mutate({ id: '1', title: 'Slow' });
  await rename.current.mutate({ id: '1', title: 'Fast' });
  await waitFor(() => expect(rename.current.data).toBe('Fast'));
  open();
  await slow;
  await tick(5);
  expect(rename.current.data).toBe('Fast');

  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const later = createReactClient({
    router: routerType<typeof local>(),
    links: [
      link((opts) =>
        Stream.unwrap(
          Effect.promise(() => held).pipe(Effect.as(opts.next(opts.op))),
        ),
      ),
      localLink({ router: local }),
    ],
  });
  const reset = renderHook(() => useMutation(later.item.claim));
  await waitFor(() => expect(reset.current.status).toBe('idle'));
  const dropped = reset.current.mutate();
  await waitFor(() => expect(reset.current.isPending).toBe(true));
  reset.current.reset();
  release();
  await expect(dropped).rejects.toBeInstanceOf(TrpcError);
  await tick(5);
  expect(reset.current.status).toBe('idle');
  rename.unmount();
  reset.unmount();
});

test('useMutation invalidates paths, query keys, or what a function of the input and data picks', async () => {
  using _dom = domCleanup();
  const trpc = make([cacheLink({ staleTime: 60_000 })]);
  const one = trpc.post.byId.query({ id: '1' });
  const two = trpc.post.byId.query({ id: '2' });
  const count = trpc.post.count.query();
  await Promise.all([one, two, count]);
  const unmounts = [one, two, count].map((p) =>
    trpc.store.mount(trpc.store.entryOf(p)!),
  );
  const reset = () => (db.calls = []);

  reset();
  const byKey = renderHook(() =>
    useMutation(trpc.post.rename, {
      invalidates: (opts) =>
        opts.data === 'Keyed'
          ? trpc.post.byId.queryKey({ id: opts.input.id })
          : [],
    }),
  );
  await waitFor(() => expect(byKey.current.status).toBe('idle'));
  await byKey.current.mutate({ id: '1', title: 'Keyed' });
  // Resolved after the refetch.
  expect(trpc.post.byId.getData({ id: '1' })?.title).toBe('Keyed');
  expect(db.calls).toEqual(['rename:1', 'byId:1']);

  reset();
  const byPath = renderHook(() =>
    useMutation(trpc.post.rename, { invalidates: 'post.byId' }),
  );
  await waitFor(() => expect(byPath.current.status).toBe('idle'));
  await byPath.current.mutate({ id: '2', title: 'Pathed' });
  expect([...db.calls].sort()).toEqual(['byId:1', 'byId:2', 'rename:2']);

  reset();
  const many = renderHook(() =>
    useMutation(trpc.post.rename, {
      invalidates: [
        trpc.post.count.queryKey(),
        trpc.post.byId.queryKey({ id: '2' }),
      ],
    }),
  );
  await waitFor(() => expect(many.current.status).toBe('idle'));
  await many.current.mutate({ id: '2', title: 'Many' });
  expect([...db.calls].sort()).toEqual(['byId:2', 'count', 'rename:2']);

  reset();
  const none = renderHook(() =>
    useMutation(trpc.post.rename, { invalidates: [] }),
  );
  await waitFor(() => expect(none.current.status).toBe('idle'));
  await none.current.mutate({ id: '1', title: 'None' });
  const plain = renderHook(() => useMutation(trpc.post.rename));
  await waitFor(() => expect(plain.current.status).toBe('idle'));
  await plain.current.mutate({ id: '1', title: 'Plain' });
  expect(db.calls).toEqual(['rename:1', 'rename:1']);

  for (const unmount of unmounts) unmount();
  for (const view of [byKey, byPath, many, none, plain]) view.unmount();
});

test("useMutation's invalidates replaces invalidateOnMutationLink's filter for its calls", async () => {
  using _dom = domCleanup();
  const trpc = make(standardLinks({ staleTime: 60_000 }));
  const one = trpc.post.byId.query({ id: '1' });
  const list = trpc.post.list.query({ limit: 2, order: 'asc' });
  await Promise.all([one, list]);
  const unmounts = [one, list].map((p) =>
    trpc.store.mount(trpc.store.entryOf(p)!),
  );
  db.calls = [];
  const narrow = renderHook(() =>
    useMutation(trpc.post.rename, {
      invalidates: trpc.post.byId.queryKey({ id: '1' }),
    }),
  );
  await waitFor(() => expect(narrow.current.status).toBe('idle'));
  const signal = new AbortController().signal;
  await narrow.current.mutate({ id: '1', title: 'Narrow' }, { signal });
  expect(db.calls).toEqual(['rename:1', 'byId:1']);

  // Without it, the link's own filter: every query.
  db.calls = [];
  const wide = renderHook(() => useMutation(trpc.post.rename));
  await waitFor(() => expect(wide.current.status).toBe('idle'));
  await wide.current.mutate({ id: '1', title: 'Wide' });
  expect([...db.calls].sort()).toEqual(['byId:1', 'list', 'rename:1']);
  for (const unmount of unmounts) unmount();
  narrow.unmount();
  wide.unmount();
  trpc.store.dispose();
});

test("useMutation() only takes a React client's mutation", async () => {
  using _dom = domCleanup();
  const trpc = make([]);
  function Plain() {
    useMutation(trpc.client.post.rename);
    return null;
  }
  const view = mount(
    <Boundary>
      <Plain />
    </Boundary>,
  );
  await waitFor(() =>
    expect(view.el.textContent).toBe(
      "useMutation() takes a React client's mutation, such as trpc.post.create",
    ),
  );
  view.unmount();
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
