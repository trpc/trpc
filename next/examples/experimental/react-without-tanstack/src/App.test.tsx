import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, onTestFinished, test } from 'vite-plus/test';
import { listen } from '../server.ts';
import { App } from './App.tsx';
import { createClients, loadPage } from './trpc.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function waitFor(assertion: () => void, timeout = 3000) {
  const start = Date.now();
  for (;;) {
    try {
      return assertion();
    } catch (error) {
      if (Date.now() - start > timeout) throw error;
      await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    }
  }
}

const card = (name: string) =>
  document.querySelector<HTMLElement>(`[data-testid="${name}"]`)!;
const titles = (name: string) =>
  [...card(name).querySelectorAll('li > span')].map((li) => li.textContent);

async function addPost(name: string, title: string) {
  const form = card(name).querySelector('form')!;
  form.querySelector('input')!.value = title;
  // happy-dom throws building React's FormData without a submitter.
  await act(async () => form.requestSubmit(form.querySelector('button')));
}

test('both clients render the router, and each one’s mutation updates its list', async () => {
  const server = await listen();
  onTestFinished(() => server[Symbol.asyncDispose]());
  const clients = createClients(server.url);
  const root = createRoot(
    document.body.appendChild(document.createElement('div')),
  );
  onTestFinished(() => act(() => root.unmount()));
  await act(async () => {
    root.render(<App clients={clients} page={loadPage(clients)} />);
  });

  await waitFor(() => {
    expect(titles('suspense')).toEqual(['Read with use() and Suspense']);
    expect(titles('atoms')).toEqual(['Read with use() and Suspense']);
  });
  // danSON: the Date survived the wire.
  expect(card('suspense').querySelector('time')?.textContent).toBe(
    '1970-01-01',
  );

  await addPost('suspense', 'Added with mutate()');
  await waitFor(() =>
    expect(titles('suspense')).toEqual([
      'Read with use() and Suspense',
      'Added with mutate()',
    ]),
  );

  await addPost('atoms', 'Added with an atom');
  await waitFor(() =>
    expect(titles('atoms')).toEqual([
      'Read with use() and Suspense',
      'Added with mutate()',
      'Added with an atom',
    ]),
  );

  await waitFor(() =>
    expect(
      card('atoms').querySelector('[data-testid="clock"]')?.textContent,
    ).toMatch(/tick [2-9]/),
  );
});
