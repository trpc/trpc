import { QueryClient } from '@tanstack/svelte-query';
import { mount, unmount } from 'svelte';
import { expect, test } from 'vite-plus/test';
import { listen } from '../../server.ts';
import { checkPage } from '../check-page.ts';
import { makeClient } from '../trpc.ts';
import App from './App.svelte';

test('the Svelte page reads the poll, votes and ticks', async () => {
  await using server = await listen();
  const el = document.body.appendChild(document.createElement('div'));
  const app = mount(App, {
    target: el,
    props: { client: makeClient(server.url), queryClient: new QueryClient() },
  });
  using _app = { [Symbol.dispose]: () => unmount(app) };
  await checkPage(el, 'svelte');
  expect(el.querySelector('button')?.textContent?.trim()).toBe(
    'Vote for Svelte',
  );
});
