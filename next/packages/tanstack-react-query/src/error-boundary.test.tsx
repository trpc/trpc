// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isTrpcError, matchError } from '@trpc12/trpc/client';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vite-plus/test';
import {
  AuthBoundary,
  createApp,
  OfflineBoundary,
  RootBoundary,
  useAuthBoundary,
} from './fixtures/error-boundary.ts';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type App = ReturnType<typeof createApp>;

function RenameDoc(props: { app: App; title: string }) {
  const rename = useAuthBoundary().useMutation(
    props.app.trpc.doc.rename.mutationOptions(),
  );
  const message = rename.error
    ? matchError(rename.error, {
        TITLE_TAKEN: () => 'That title is taken',
        BAD_REQUEST: () => 'Check the title',
      })
    : rename.data
      ? `Renamed to ${rename.data.title}`
      : '';
  return (
    <form>
      <button
        id="rename"
        onClick={() => rename.mutate({ id: '1', title: props.title })}
        type="button"
      />
      <p id="message">{message}</p>
    </form>
  );
}

function DocTitle(props: { app: App; id: string }) {
  const doc = useAuthBoundary().useQuery(
    props.app.trpc.doc.byId.queryOptions({ input: { id: props.id } }),
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
    root.unmount();
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
  await ui.click('#rename');
  await ui.settle();
  expect(ui.text('#message')).toBe('That title is taken');
  expect(ui.text('#sign-in')).toBeUndefined();
});

test('UNAUTHORIZED goes to the Auth boundary, and reset renders the tree again', async () => {
  await using app = createApp();
  app.state.user = undefined;
  using ui = await mount(boundaries(<RenameDoc app={app} title="Fresh" />));
  await ui.click('#rename');
  await ui.settle();
  expect(ui.text('#sign-in')).toBe('Sign in');
  expect(ui.text('#message')).toBeUndefined();

  app.state.user = 'ada';
  await ui.click('#sign-in-retry');
  await ui.click('#rename');
  await ui.settle();
  expect(ui.text('#message')).toBe('Renamed to Fresh');
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

test('a thrown server error is unexpected and reaches Root', async () => {
  await using app = createApp();
  using ui = await mount(boundaries(<RenameDoc app={app} title="crash" />));
  await ui.click('#rename');
  await ui.settle();
  expect(ui.text('#crashed')).toBe('Something went wrong');
});

test('a defined NOT_FOUND from a query stays in the component', async () => {
  await using app = createApp();
  using ui = await mount(boundaries(<DocTitle app={app} id="404" />));
  await ui.settle();
  expect(ui.text('#title')).toBe('No such doc');
});

test('the hook throws outside its boundary, naming it', async () => {
  await using app = createApp();
  await expect(
    mount(
      <RootBoundary>
        <OfflineBoundary>
          <DocTitle app={app} id="1" />
        </OfflineBoundary>
      </RootBoundary>,
    ),
  ).rejects.toThrow(
    "The Auth error boundary's hook found no <AuthBoundary> above it: wrap the tree in <AuthBoundary>",
  );
});

test('a boundary throws without its parent above it', async () => {
  await using app = createApp();
  await expect(
    mount(
      <RootBoundary>
        <AuthBoundary>
          <DocTitle app={app} id="1" />
        </AuthBoundary>
      </RootBoundary>,
    ),
  ).rejects.toThrow(
    '<AuthBoundary> needs <OfflineBoundary>, its parent, above it',
  );
});

test("the options' own throwOnError still throws what no boundary owns, past every boundary", async () => {
  await using app = createApp();
  function Thrower() {
    useAuthBoundary().useQuery({
      ...app.trpc.doc.byId.queryOptions({ input: { id: '404' } }),
      throwOnError: (error) => error.code === 'NOT_FOUND',
    });
    return null;
  }
  using ui = await mount(boundaries(<Thrower />));
  await expect(ui.settle()).rejects.toSatisfy(
    (error) => isTrpcError(error) && error.code === 'NOT_FOUND',
  );
});

test("a mutation's own throwOnError throws what no boundary owns too", async () => {
  await using app = createApp();
  function Rename() {
    const rename = useAuthBoundary().useMutation({
      ...app.trpc.doc.rename.mutationOptions(),
      throwOnError: (error) => error.code === 'TITLE_TAKEN',
    });
    return (
      <button
        id="rename"
        onClick={() => rename.mutate({ id: '1', title: 'Taken' })}
        type="button"
      />
    );
  }
  using ui = await mount(boundaries(<Rename />));
  const clickAndSettle = async () => {
    await ui.click('#rename');
    await ui.settle();
  };
  await expect(clickAndSettle()).rejects.toSatisfy(
    (error) => isTrpcError(error) && error.code === 'TITLE_TAKEN',
  );
});

test('owns() says whether the boundary or one above it owns an error', async () => {
  await using app = createApp();
  app.state.user = undefined;
  const seen: Array<[string, boolean]> = [];
  function Probe() {
    const auth = useAuthBoundary();
    const rename = auth.useMutation(app.trpc.doc.rename.mutationOptions());
    return (
      <button
        id="rename"
        onClick={() =>
          rename
            .mutateAsync({ id: '1', title: 'x' })
            .catch((error: unknown) => {
              if (isTrpcError(error)) seen.push([error.code, auth.owns(error)]);
            })
        }
        type="button"
      />
    );
  }
  using ui = await mount(boundaries(<Probe />));
  await ui.click('#rename');
  await ui.settle();
  expect(seen).toEqual([['UNAUTHORIZED', true]]);
});
