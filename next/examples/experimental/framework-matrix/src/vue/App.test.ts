import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { expect, onTestFinished, test } from 'vite-plus/test';
import { createApp } from 'vue';
import { listen } from '../../server.ts';
import { checkPage } from '../check-page.ts';
import { makeClient } from '../trpc.ts';
import { App, TrpcPlugin } from './App.ts';

test('the Vue page reads the poll, votes and ticks', async () => {
  const server = await listen();
  onTestFinished(() => server[Symbol.asyncDispose]());
  const el = document.body.appendChild(document.createElement('div'));
  const app = createApp(App)
    .use(VueQueryPlugin, { queryClient: new QueryClient() })
    .use(TrpcPlugin, { client: makeClient(server.url) });
  app.mount(el);
  onTestFinished(() => app.unmount());
  await checkPage(el, 'vue');
  expect(el.querySelector('button')?.textContent).toBe('Vote for Vue');
});
