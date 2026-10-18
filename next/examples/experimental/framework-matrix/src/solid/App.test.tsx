import { QueryClient } from '@tanstack/solid-query';
import { render } from 'solid-js/web';
import { expect, onTestFinished, test } from 'vite-plus/test';
import { listen } from '../../server.ts';
import { checkPage } from '../check-page.ts';
import { makeClient } from '../trpc.ts';
import { App } from './App.tsx';

test('the Solid page reads the poll, votes and ticks', async () => {
  const server = await listen();
  onTestFinished(() => server[Symbol.asyncDispose]());
  const el = document.body.appendChild(document.createElement('div'));
  const dispose = render(
    () => (
      <App client={makeClient(server.url)} queryClient={new QueryClient()} />
    ),
    el,
  );
  onTestFinished(dispose);
  await checkPage(el, 'solid');
  expect(el.querySelector('button')?.textContent?.trim()).toBe(
    'Vote for Solid',
  );
});
