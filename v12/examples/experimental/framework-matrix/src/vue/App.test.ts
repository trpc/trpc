import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { expect, test } from 'vite-plus/test';
import { createApp } from 'vue';
import { listen } from '../../server.ts';
import { checkPage } from '../check-page.ts';
import { makeClient } from '../trpc.ts';
import { App, TrpcPlugin } from './App.ts';

test('the Vue page reads the poll, votes and ticks', async () => {
  await using server = await listen();
  const el = document.body.appendChild(document.createElement('div'));
  const app = createApp(App)
    .use(VueQueryPlugin, { queryClient: new QueryClient() })
    .use(TrpcPlugin, { client: makeClient(server.url) });
  app.mount(el);
  using _app = { [Symbol.dispose]: () => app.unmount() };
  await checkPage(el, 'vue');
  expect(el.querySelector('button')?.textContent).toBe('Vote for Vue');
});
