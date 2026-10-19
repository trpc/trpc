import { QueryClient } from '@tanstack/solid-query';
import { render } from 'solid-js/web';
import { expect, test } from 'vite-plus/test';
import { listen } from '../../server.ts';
import { checkPage } from '../check-page.ts';
import { makeClient } from '../trpc.ts';
import { App } from './App.tsx';

test('the Solid page reads the poll, votes and ticks', async () => {
  await using server = await listen();
  const el = document.body.appendChild(document.createElement('div'));
  const dispose = render(
    () => (
      <App client={makeClient(server.url)} queryClient={new QueryClient()} />
    ),
    el,
  );
  using _app = { [Symbol.dispose]: dispose };
  await checkPage(el, 'solid');
  expect(el.querySelector('button')?.textContent?.trim()).toBe(
    'Vote for Solid',
  );
});
