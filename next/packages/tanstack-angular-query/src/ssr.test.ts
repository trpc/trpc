import '@angular/compiler';
import { Component, provideZonelessChangeDetection } from '@angular/core';
import {
  bootstrapApplication,
  type BootstrapContext,
} from '@angular/platform-browser';
import {
  provideServerRendering,
  renderApplication,
} from '@angular/platform-server';
import {
  injectQuery,
  provideTanStackQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import {
  createTrpcContext,
  createTrpcQueryUtils,
  hydrationOptions,
  injectSubscription,
} from '@trpc12/tanstack-angular-query';
import { createRouterClient } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import {
  appRouter,
  createApp,
  db,
  type AppClient,
  serializer,
} from '../../tanstack-query/src/fixtures/app.ts';

const trpcContext = createTrpcContext<AppClient>();

const Page = Component({
  selector: 'app-root',
  template: `<h1>{{ post.data()?.createdAt?.toISOString()?.slice(0, 10) }}</h1><p>{{ added.status() }}</p>`,
})(
  class {
    trpc = trpcContext.injectTrpc();
    post = injectQuery(() =>
      this.trpc.post.byId.queryOptions({ input: { id: '3' } }),
    );
    added = injectSubscription(() =>
      this.trpc.post.onAdd.subscriptionOptions(),
    );
  },
);

test('server render with prefetched data and no subscription', async () => {
  await using _app = await createApp();
  const queryClient = new QueryClient({
    defaultOptions: {
      ...hydrationOptions({ serializer }),
      queries: { staleTime: 30_000 },
    },
  });
  const client = createRouterClient(appRouter, { ctx: { locale: null } });
  await queryClient.query(
    createTrpcQueryUtils({ client }).post.byId.queryOptions({
      input: { id: '3' },
    }),
  );
  const html = await renderApplication(
    (context: BootstrapContext) =>
      bootstrapApplication(
        Page,
        {
          providers: [
            provideServerRendering(),
            provideZonelessChangeDetection(),
            provideTanStackQuery(queryClient),
            trpcContext.provideTrpc(client),
          ],
        },
        context,
      ),
    { document: '<app-root></app-root>', url: '/' },
  );
  expect(html).toContain('<h1>2026-01-04</h1><p>idle</p>');
  expect(db.listeners.size).toBe(0);
  expect(db.calls).toEqual(['post.byId:3']);
});
