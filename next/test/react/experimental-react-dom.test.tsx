// @vitest-environment happy-dom
import {
  cacheLink,
  createReactClient,
  dehydrate,
  hydrate,
  refetchOnWindowFocusLink,
  standardLinks,
  structuralSharingLink,
  useQuery,
  useQueryState,
  type QueryPromise,
} from '@trpc12/experimental-react';
import { localLink, routerType, type AnyLink } from '@trpc12/trpc/client';
import { createSerializer } from '@trpc12/trpc/serializer';
import { Suspense, use, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { prerender } from 'react-dom/static';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import {
  db,
  router,
  tick,
  waitFor,
  type AppRouter,
  type Post,
} from './fixtures.ts';

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

let warnings: string[] = [];
beforeEach(() => {
  db.reset();
  warnings = [];
  vi.spyOn(console, 'error').mockImplementation((message: unknown) => {
    warnings.push(String(message));
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

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
  const trpc = make([]);
  const post = trpc.post.byId.query({ id: '1' }); // the loader
  const view = mount(<Title post={post} />);
  await waitFor(() => expect(h1(view.el)).toBe('Hello'));
  expect(db.calls).toEqual(['byId:1']);
  expect(warnings.filter((w) => w.includes('uncached promise'))).toEqual([]);
  view.unmount();
});

test('setData and refetches re-render; an unchanged refetch with structural sharing does not', async () => {
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
  const trpc = make([cacheLink(), refetchOnWindowFocusLink()]);
  const post = trpc.post.byId.query({ id: '1' });
  const view = mount(
    <>
      <Title post={post} />
      <Fetching post={post} />
    </>,
  );
  await waitFor(() => expect(h1(view.el)).toBe('Hello'));
  db.posts.get('1')!.title = 'Refocused';
  document.dispatchEvent(new Event('visibilitychange'));
  await waitFor(() => expect(h1(view.el)).toBe('Refocused'));
  expect(view.el.querySelector('p')?.textContent).toBe('idle');
  expect(db.calls).toEqual(['byId:1', 'byId:1']);
  view.unmount();
  trpc.store.dispose();
});

test('server render, dehydrate, then hydrateRoot in the browser without a request', async () => {
  const server = make(standardLinks(), true);
  const app = (trpc: typeof server) => (
    <Suspense fallback={<p>loading</p>}>
      <Title post={trpc.post.byId.query({ id: '1' })} />
    </Suspense>
  );
  const { prelude } = await prerender(app(server));
  const html = await new Response(prelude).text();
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
  expect(warnings).toEqual([]);
  root.unmount();
  browser.store.dispose();
});
