// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement as h, type ReactNode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vite-plus/test';
import { matchError } from '../closed-errors/closed.ts';
import { AuthShell, createApp, OfflineShell, RootShell } from './app.ts';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type App = ReturnType<typeof createApp>;

function RenameDoc(props: { app: App; title: string }) {
  const rename = AuthShell.useMutation(
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
  return h(
    'form',
    null,
    h('button', {
      id: 'rename',
      type: 'button',
      onClick: () => rename.mutate({ id: '1', title: props.title }),
    }),
    h('p', { id: 'message' }, message),
  );
}

function DocTitle(props: { app: App; id: string }) {
  const doc = AuthShell.useQuery(
    props.app.trpc.doc.byId.queryOptions({ input: { id: props.id } }),
  );
  if (doc.error) {
    return h(
      'h1',
      { id: 'title' },
      matchError(doc.error, {
        NOT_FOUND: () => 'No such doc',
        BAD_REQUEST: () => 'Bad id',
      }),
    );
  }
  return h('h1', { id: 'title' }, doc.data?.title ?? 'loading');
}

const shells = (children: ReactNode) =>
  h(
    RootShell.Boundary,
    null,
    h(OfflineShell.Boundary, null, h(AuthShell.Boundary, null, children)),
  );

async function mount(ui: ReactNode) {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const el = document.createElement('div');
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(h(QueryClientProvider, { client: queryClient }, ui));
  });
  return {
    text: (selector: string) => el.querySelector(selector)?.textContent,
    click: (selector: string) =>
      act(async () => {
        el.querySelector<HTMLElement>(selector)?.click();
      }),
    settle: () => act(() => new Promise((resolve) => setTimeout(resolve, 20))),
    [Symbol.dispose]: () => {
      root.unmount();
      el.remove();
    },
  };
}

test('the component handles what no shell owns', async () => {
  await using app = createApp();
  using ui = await mount(shells(h(RenameDoc, { app, title: 'Taken' })));
  await ui.click('#rename');
  await ui.settle();
  expect(ui.text('#message')).toBe('That title is taken');
  expect(ui.text('#sign-in')).toBeUndefined();
});

test('UNAUTHORIZED goes to the Auth shell', async () => {
  await using app = createApp();
  app.state.user = undefined;
  using ui = await mount(shells(h(RenameDoc, { app, title: 'Fresh' })));
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

test('a network failure passes the Auth shell and stops at Offline', async () => {
  await using app = createApp();
  app.state.online = false;
  using ui = await mount(shells(h(DocTitle, { app, id: '1' })));
  await ui.settle();
  expect(ui.text('#offline')).toBe('You are offline');

  app.state.online = true;
  await ui.click('#offline-retry');
  await ui.settle();
  expect(ui.text('#title')).toBe('Hello');
});

test('a thrown server error is unexpected and reaches Root', async () => {
  await using app = createApp();
  using ui = await mount(shells(h(RenameDoc, { app, title: 'crash' })));
  await ui.click('#rename');
  await ui.settle();
  expect(ui.text('#crashed')).toBe('Something went wrong');
});

test('a defined NOT_FOUND from a query stays in the component', async () => {
  await using app = createApp();
  using ui = await mount(shells(h(DocTitle, { app, id: '404' })));
  await ui.settle();
  expect(ui.text('#title')).toBe('No such doc');
});

test("a shell's hooks need every shell in its chain mounted above", async () => {
  await using app = createApp();
  await expect(
    mount(h(RootShell.Boundary, null, h(DocTitle, { app, id: '1' }))),
  ).rejects.toThrow('Auth.useQuery needs <Auth.Boundary> above it');
});
