import { QueryClient } from '@tanstack/svelte-query';
import {
  createTrpcQueryUtils,
  hydrationOptions,
} from '@trpcdev/tanstack-svelte-query';
import { render } from 'svelte/server';
import { createRouterClient } from 'trpcdev/server';
import { expect, test } from 'vite-plus/test';
import { appRouter, createApp, db, serializer } from './fixtures/app.ts';
import Root from './svelte/Root.svelte';
import Ssr from './svelte/Ssr.svelte';

test('server render with prefetched data and no subscription', async () => {
  await using _app = await createApp();
  const queryClient = new QueryClient({
    defaultOptions: hydrationOptions({ serializer }),
  });
  const client = createRouterClient(appRouter, { ctx: { locale: null } });
  await queryClient.prefetchQuery(
    createTrpcQueryUtils({ client }).post.byId.queryOptions({
      input: { id: '3' },
    }),
  );
  const { body } = render(Root, {
    props: { queryClient, client, app: Ssr },
  });
  expect(body).toContain('<h1>2026-01-04</h1>');
  expect(body).toContain('<p>idle</p>');
  expect(db.listeners.size).toBe(0);
  expect(db.calls).toEqual(['post.byId:3']);
});
