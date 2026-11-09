// @vitest-environment happy-dom
import {
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { isTrpcError, matchError, TrpcError } from '@trpc12/trpc/client';
import { act, Suspense, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vite-plus/test';
import type { ErrorBoundaryResetDetails } from './error-boundary.ts';
import {
  AuthBoundary,
  createApp,
  OfflineBoundary,
  RootBoundary,
  StaleBoundary,
  useAuthBoundary,
  useStaleBoundary,
} from './fixtures/error-boundary.ts';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type App = ReturnType<typeof createApp>;

/** The title is component state, so a remount loses it. */
function RenameDoc(props: { app: App; title: string }) {
  const [title, setTitle] = useState('');
  const rename = useMutation(
    useAuthBoundary().mutation(props.app.trpc.doc.rename.mutationOptions()),
  );
  const message = rename.error
    ? matchError(rename.error, {
        TITLE_TAKEN: () => 'That title is taken',
        BAD_REQUEST: () => 'Check the title',
      })
    : rename.data
      ? `Renamed to ${rename.data.title}`
      : rename.isPending
        ? 'Saving'
        : '';
  return (
    <form>
      <button id="type" onClick={() => setTitle(props.title)} type="button" />
      <button
        id="rename"
        onClick={() => rename.mutate({ id: '1', title })}
        type="button"
      />
      <p id="message">{message}</p>
    </form>
  );
}

function DocTitle(props: { app: App; id: string }) {
  const doc = useQuery(
    useAuthBoundary().query(
      props.app.trpc.doc.byId.queryOptions({ input: { id: props.id } }),
    ),
  );
  if (doc.error) {
    return (
      <h1 id="title">
        {matchError(doc.error, {
          NOT_FOUND: () => 'No such doc',
          BAD_REQUEST: () => 'Bad id',
        })}
      </h1>
    );
  }
  return <h1 id="title">{doc.data?.title ?? 'loading'}</h1>;
}

const boundaries = (children: ReactNode) => (
  <RootBoundary>
    <OfflineBoundary>
      <AuthBoundary>{children}</AuthBoundary>
    </OfflineBoundary>
  </RootBoundary>
);

async function mount(ui: ReactNode) {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const el = document.createElement('div');
  document.body.append(el);
  const root = createRoot(el);
  const unmount = () => {
    act(() => root.unmount());
    el.remove();
  };
  try {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
      );
    });
  } catch (error) {
    unmount();
    throw error;
  }
  return {
    text: (selector: string) => el.querySelector(selector)?.textContent,
    hidden: (selector: string) =>
      el.querySelector<HTMLElement>(selector)?.style.display === 'none',
    click: (selector: string) =>
      act(async () => {
        el.querySelector<HTMLElement>(selector)?.click();
      }),
    settle: () => act(() => new Promise((resolve) => setTimeout(resolve, 20))),
    [Symbol.dispose]: unmount,
  };
}

test('the component handles what no boundary owns', async () => {
  await using app = createApp();
  using ui = await mount(boundaries(<RenameDoc app={app} title="Taken" />));
  await ui.click('#type');
  await ui.click('#rename');
  await ui.settle();
  expect(ui.text('#message')).toBe('That title is taken');
  expect(ui.text('#sign-in')).toBeUndefined();
});

test('an owned mutation error is held: the form stays mounted behind the fallback, and reset sends it again', async () => {
  await using app = createApp();
  app.state.user = undefined;
  using ui = await mount(boundaries(<RenameDoc app={app} title="Fresh" />));
  await ui.click('#type');
  await ui.click('#rename');
  await ui.settle();
  expect(ui.text('#sign-in')).toBe('Sign in');
  expect(ui.text('#message')).toBe('Saving');
  expect(ui.hidden('form')).toBe(true);

  app.state.user = 'ada';
  await ui.click('#sign-in-retry');
  await ui.settle();
  expect(ui.text('#sign-in')).toBeUndefined();
  expect(ui.hidden('form')).toBe(false);
  // The title came from state, so the form was never remounted.
  expect(ui.text('#message')).toBe('Renamed to Fresh');
});

test('one reset sends every mutation the boundary holds', async () => {
  await using app = createApp();
  app.state.user = undefined;
  const renamed: string[] = [];
  function RenameBoth() {
    const rename = useMutation(
      useAuthBoundary().mutation(app.trpc.doc.rename.mutationOptions()),
    );
    const send = (id: string, title: string) =>
      rename.mutateAsync({ id, title }).then((doc) => renamed.push(doc.title));
    return (
      <button
        id="rename"
        onClick={() => {
          void send('1', 'A');
          void send('2', 'B');
        }}
        type="button"
      />
    );
  }
  using ui = await mount(boundaries(<RenameBoth />));
  await ui.click('#rename');
  await ui.settle();
  expect(ui.text('#sign-in')).toBe('Sign in');

  app.state.user = 'ada';
  await ui.click('#sign-in-retry');
  await ui.settle();
  expect([...renamed].sort()).toEqual(['A', 'B']);
});

test('a held mutation rejects with its error when its boundary unmounts', async () => {
  await using app = createApp();
  app.state.user = undefined;
  const seen: unknown[] = [];
  function Rename() {
    const rename = useMutation(
      useAuthBoundary().mutation(app.trpc.doc.rename.mutationOptions()),
    );
    return (
      <button
        id="rename"
        onClick={() =>
          rename
            .mutateAsync({ id: '1', title: 'x' })
            .catch((error: unknown) => seen.push(error))
        }
        type="button"
      />
    );
  }
  {
    using ui = await mount(boundaries(<Rename />));
    await ui.click('#rename');
    await ui.settle();
    expect(ui.text('#sign-in')).toBe('Sign in');
    expect(seen).toEqual([]);
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(seen).toSatisfy(
    ([error]: unknown[]) => isTrpcError(error) && error.code === 'UNAUTHORIZED',
  );
});

test('a network failure passes the Auth boundary, stops at Offline, and reset refetches', async () => {
  await using app = createApp();
  app.state.online = false;
  using ui = await mount(boundaries(<DocTitle app={app} id="1" />));
  await ui.settle();
  expect(ui.text('#offline')).toBe('You are offline');

  app.state.online = true;
  await ui.click('#offline-retry');
  await ui.settle();
  expect(ui.text('#title')).toBe('Hello');
});

test("useInfiniteQuery's owned errors reach their boundary through infiniteQuery()", async () => {
  await using app = createApp();
  app.state.user = undefined;
  function Titles() {
    const titles = useInfiniteQuery(
      useAuthBoundary().infiniteQuery(
        app.trpc.doc.titles.infiniteOptions({
          input: (cursor: number) => ({ cursor }),
          initialPageParam: 0,
          getNextPageParam: (page) => page.next,
        }),
      ),
    );
    return <p id="titles">{titles.data?.pages.map((p) => p.title).join()}</p>;
  }
  using ui = await mount(boundaries(<Titles />));
  await ui.settle();
  expect(ui.text('#sign-in')).toBe('Sign in');

  app.state.user = 'ada';
  await ui.click('#sign-in-retry');
  await ui.settle();
  expect(ui.text('#titles')).toBe('Hello');
});

test('a thrown server error is unexpected and reaches Root', async () => {
  await using app = createApp();
  using ui = await mount(boundaries(<RenameDoc app={app} title="crash" />));
  await ui.click('#type');
  await ui.click('#rename');
  await ui.settle();
  expect(ui.text('#crashed')).toBe('Something went wrong');
});

test('a crash while rendering reaches Root too', async () => {
  function Broken(): ReactNode {
    throw new TypeError('x is undefined');
  }
  using ui = await mount(boundaries(<Broken />));
  expect(ui.text('#crashed')).toBe('Something went wrong');
});

test("a framework's control flow (an error with a digest) passes Root", async () => {
  function Redirect(): ReactNode {
    throw Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT',
    });
  }
  await expect(mount(boundaries(<Redirect />))).rejects.toThrow(
    'NEXT_REDIRECT',
  );
});

test('a defined NOT_FOUND from a query stays in the component', async () => {
  await using app = createApp();
  using ui = await mount(boundaries(<DocTitle app={app} id="404" />));
  await ui.settle();
  expect(ui.text('#title')).toBe('No such doc');
});

test("a tag claim takes one failure: a stale client's missing procedure, not the doc's own NOT_FOUND", async () => {
  await using app = createApp();
  function History() {
    const stale = useStaleBoundary();
    useQuery(
      stale.query(app.trpc.doc.history.queryOptions({ input: { id: '1' } })),
    );
    const doc = useQuery(
      stale.query(app.trpc.doc.byId.queryOptions({ input: { id: '404' } })),
    );
    return <p id="doc">{doc.error?._tag}</p>;
  }
  {
    using ui = await mount(
      boundaries(
        <StaleBoundary>
          <History />
        </StaleBoundary>,
      ),
    );
    await ui.settle();
    expect(ui.text('#stale')).toBe('Reload: ProcedureNotFound');
  }
  function Doc() {
    const doc = useQuery(
      useStaleBoundary().query(
        app.trpc.doc.byId.queryOptions({ input: { id: '404' } }),
      ),
    );
    return <p id="doc">{doc.error?._tag}</p>;
  }
  using ui = await mount(
    boundaries(
      <StaleBoundary>
        <Doc />
      </StaleBoundary>,
    ),
  );
  await ui.settle();
  expect(ui.text('#doc')).toBe('NotFound');
});

test("a mutation is held by its hook's chain, not by a boundary mounted under the hook's own", async () => {
  await using app = createApp();
  function Archive() {
    const archive = useMutation(
      useAuthBoundary().mutation(app.trpc.doc.archive.mutationOptions()),
    );
    return (
      <button
        id="archive"
        onClick={() => archive.mutate({ id: '1' })}
        type="button"
      >
        {archive.error?._tag}
      </button>
    );
  }
  using ui = await mount(
    boundaries(
      <StaleBoundary>
        <Archive />
      </StaleBoundary>,
    ),
  );
  await ui.click('#archive');
  await ui.settle();
  // Stale claims ProcedureNotFound but isn't above Auth; Root's unexpected is.
  expect(ui.text('#stale')).toBeUndefined();
  expect(ui.text('#crashed')).toBe('Something went wrong');
});

test('a changed resetKeys entry resets the boundary and refetches', async () => {
  await using app = createApp();
  app.state.user = undefined;
  const resets: ErrorBoundaryResetDetails[] = [];
  function Page() {
    const [user, setUser] = useState<string>();
    return (
      <>
        <button
          id="sign-in-elsewhere"
          onClick={() => {
            app.state.user = 'ada';
            setUser('ada');
          }}
          type="button"
        />
        <RootBoundary>
          <OfflineBoundary>
            <AuthBoundary
              resetKeys={[user]}
              onReset={(details) => resets.push(details)}
            >
              <DocTitle app={app} id="1" />
            </AuthBoundary>
          </OfflineBoundary>
        </RootBoundary>
      </>
    );
  }
  using ui = await mount(<Page />);
  await ui.settle();
  expect(ui.text('#sign-in')).toBe('Sign in');

  await ui.click('#sign-in-elsewhere');
  await ui.settle();
  expect(ui.text('#title')).toBe('Hello');
  expect(resets).toEqual([
    { reason: 'keys', prev: [undefined], next: ['ada'] },
  ]);
});

test('onError reports what the boundary renders a fallback for, not what it passes up', async () => {
  await using app = createApp();
  app.state.online = false;
  const auth: unknown[] = [];
  const offline: Array<string | null | undefined> = [];
  using ui = await mount(
    <RootBoundary>
      <OfflineBoundary onError={(_, info) => offline.push(info.componentStack)}>
        <AuthBoundary onError={(error) => auth.push(error)}>
          <DocTitle app={app} id="1" />
        </AuthBoundary>
      </OfflineBoundary>
    </RootBoundary>,
  );
  await ui.settle();
  expect(ui.text('#offline')).toBe('You are offline');
  expect(auth).toEqual([]);
  expect(offline).toEqual([expect.stringContaining('DocTitle')]);
});

test('the hook throws outside its boundary, naming it', async () => {
  await using app = createApp();
  await expect(mount(<DocTitle app={app} id="1" />)).rejects.toThrow(
    "The Auth error boundary's hook found no <AuthBoundary> above it: wrap the tree in <AuthBoundary>",
  );
});

test('a boundary throws without its parent above it', async () => {
  await using app = createApp();
  await expect(
    mount(
      <AuthBoundary>
        <DocTitle app={app} id="1" />
      </AuthBoundary>,
    ),
  ).rejects.toThrow(
    '<AuthBoundary> needs <OfflineBoundary>, its parent, above it',
  );
});

test("the options' own throwOnError still throws what no boundary owns, to unexpected", async () => {
  await using app = createApp();
  function Thrower() {
    useQuery(
      useAuthBoundary().query({
        ...app.trpc.doc.byId.queryOptions({ input: { id: '404' } }),
        throwOnError: (error) => error.code === 'NOT_FOUND',
      }),
    );
    return null;
  }
  using ui = await mount(boundaries(<Thrower />));
  await ui.settle();
  expect(ui.text('#crashed')).toBe('Something went wrong');
});

test("a mutation's own throwOnError throws what no boundary owns too", async () => {
  await using app = createApp();
  function Rename() {
    const rename = useMutation(
      useAuthBoundary().mutation({
        ...app.trpc.doc.rename.mutationOptions(),
        throwOnError: (error) => error.code === 'TITLE_TAKEN',
      }),
    );
    return (
      <button
        id="rename"
        onClick={() => rename.mutate({ id: '1', title: 'Taken' })}
        type="button"
      />
    );
  }
  using ui = await mount(boundaries(<Rename />));
  await ui.click('#rename');
  await ui.settle();
  expect(ui.text('#crashed')).toBe('Something went wrong');
});

test("useSuspenseQuery's owned errors reach their boundary as they are, and reset refetches", async () => {
  await using app = createApp();
  app.state.user = undefined;
  function SuspenseTitle(props: { id: string }) {
    const doc = useSuspenseQuery(
      app.trpc.doc.byId.queryOptions({ input: { id: props.id } }),
    );
    return <h1 id="title">{doc.data.title}</h1>;
  }
  using ui = await mount(
    boundaries(
      <Suspense fallback={<p id="loading" />}>
        <SuspenseTitle id="1" />
      </Suspense>,
    ),
  );
  await ui.settle();
  expect(ui.text('#sign-in')).toBe('Sign in');

  app.state.user = 'ada';
  await ui.click('#sign-in-retry');
  await ui.settle();
  expect(ui.text('#title')).toBe('Hello');
});

test("useSuspenseQuery's unowned errors go to unexpected", async () => {
  await using app = createApp();
  function SuspenseTitle() {
    useSuspenseQuery(app.trpc.doc.byId.queryOptions({ input: { id: '404' } }));
    return null;
  }
  using ui = await mount(
    boundaries(
      <Suspense fallback={null}>
        <SuspenseTitle />
      </Suspense>,
    ),
  );
  await ui.settle();
  expect(ui.text('#crashed')).toBe('Something went wrong');
});

test('owns() says whether the boundary or one above it owns an error', async () => {
  const seen: boolean[] = [];
  function Probe() {
    const auth = useAuthBoundary();
    seen.push(
      auth.owns(new TrpcError({ code: 'UNAUTHORIZED' })),
      auth.owns(new TrpcError({ code: 'NETWORK_ERROR' })),
      auth.owns(new TrpcError({ code: 'NOT_FOUND' })),
      auth.owns(new TrpcError({ code: 'NOT_FOUND', defined: true })),
      auth.owns(new TypeError('x')),
    );
    return null;
  }
  using _ui = await mount(boundaries(<Probe />));
  expect(seen.slice(0, 5)).toEqual([true, true, true, false, false]);
});
