import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/solid-query';
import {
  createTrpcContext,
  createTrpcQueryUtils,
  hydrationOptions,
  useSubscription,
} from '@trpc12/tanstack-solid-query';
import {
  createComponent,
  escape,
  isServer,
  renderToString,
  ssr,
} from 'solid-js/web';
import type { JSX } from 'solid-js';
import { createRouterClient } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import {
  appRouter,
  createApp,
  db,
  type AppClient,
  serializer,
} from '../../tanstack-query/src/fixtures/app.ts';

const [TrpcProvider, useTrpc] = createTrpcContext<AppClient>();

test('runs with the server build', () => {
  expect(isServer).toBe(true);
});

test('server render with prefetched data and no subscription', async () => {
  await using _app = await createApp();
  const queryClient = new QueryClient({
    defaultOptions: hydrationOptions({ serializer }),
  });
  const client = createRouterClient(appRouter, { ctx: { locale: null } });
  await queryClient.query(
    createTrpcQueryUtils({ client }).post.byId.queryOptions({
      input: { id: '3' },
    }),
  );
  function Page(): JSX.Element {
    const trpc = useTrpc();
    const post = useQuery(() =>
      trpc.post.byId.queryOptions({ input: { id: '3' } }),
    );
    const added = useSubscription(() => trpc.post.onAdd.subscriptionOptions());
    return ssr(
      ['<h1>', '</h1><p>', '</p>'],
      escape(post.data?.createdAt.toISOString().slice(0, 10) ?? ''),
      escape(added.status),
    ) as unknown as JSX.Element;
  }
  const html = renderToString(() =>
    createComponent(QueryClientProvider, {
      client: queryClient,
      get children() {
        return createComponent(TrpcProvider, {
          client,
          get children() {
            return createComponent(Page, {});
          },
        });
      },
    }),
  );
  expect(html).toContain('<h1>2026-01-04</h1><p>idle</p>');
  expect(db.listeners.size).toBe(0);
  expect(db.calls).toEqual(['post.byId:3']);
});
