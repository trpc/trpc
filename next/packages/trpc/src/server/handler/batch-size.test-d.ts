import { httpLink } from '@trpc12/trpc/client';
import { createV11Handler } from '@trpc12/trpc/interop';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { test } from 'vite-plus/test';

const t = initTrpc();
const router = t.router({ hello: t.procedure.query(() => 'hi') });

test('createFetchHandler batches only with an explicit maxItems', () => {
  createFetchHandler({ router });
  createFetchHandler({ router, batch: false });
  createFetchHandler({ router, batch: { maxItems: 100 } });
  // @ts-expect-error batching needs a size
  createFetchHandler({ router, batch: true });
  // @ts-expect-error batching needs a size
  createFetchHandler({ router, batch: {} });
});

test('createV11Handler needs batch: v11 links batch by default', () => {
  createV11Handler({ router, batch: false });
  createV11Handler({ router, batch: { maxItems: 100 } });
  // @ts-expect-error batch is required
  createV11Handler({ router });
  // @ts-expect-error batching needs a size
  createV11Handler({ router, batch: true });
  // @ts-expect-error batching needs a size
  createV11Handler({ router, batch: {} });
});

test('httpLink batches only with an explicit maxItems', () => {
  httpLink({ url: '/trpc' });
  httpLink({ url: '/trpc', batch: false });
  httpLink({ url: '/trpc', batch: { maxItems: 100 } });
  // @ts-expect-error batching needs a size
  httpLink({ url: '/trpc', batch: true });
  // @ts-expect-error batching needs a size
  httpLink({ url: '/trpc', batch: {} });
});
