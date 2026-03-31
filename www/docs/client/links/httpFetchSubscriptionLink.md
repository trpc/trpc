---
id: httpFetchSubscriptionLink
title: HTTP Fetch Subscription Link
sidebar_label: HTTP Fetch Subscription Link
slug: /client/links/httpFetchSubscriptionLink
---

`httpFetchSubscriptionLink` is a [**terminating link**](./overview.md#the-terminating-link) that uses a fetch-driven [Server-sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) (SSE) transport for subscriptions.

Use it when you need features that the browser `EventSource` API does not support directly, such as dynamic headers, `credentials: 'include'`, or a custom fetch implementation.

## Setup

`httpFetchSubscriptionLink` is intended for subscriptions, so pair it with [`splitLink`](./splitLink.mdx) just like `httpSubscriptionLink`.

```ts twoslash title="client/index.ts"
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
declare function getSignature(op: any): Promise<string>;
declare function getToken(): Promise<string>;

// ---cut---
import {
  createTRPCClient,
  httpBatchLink,
  httpFetchSubscriptionLink,
  splitLink,
} from '@trpc/client';
import type { AppRouter } from './server';

const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: httpFetchSubscriptionLink({
        url: 'http://localhost:3000',
        headers: async ({ op }) => {
          const token = await getToken();
          const signature = await getSignature(op);
          return {
            authorization: `Bearer ${token}`,
            'x-signature': signature,
          };
        },
        credentials: 'include',
      }),
      false: httpBatchLink({
        url: 'http://localhost:3000',
      }),
    }),
  ],
});
```

## Options

`httpFetchSubscriptionLink` accepts the same URL, transformer, and `connectionParams` options as `httpSubscriptionLink`, plus:

- `fetch` for a custom fetch implementation
- `headers` for static or per-operation request headers
- `credentials` for fetch credentials mode

The `headers()` and `credentials` callbacks are re-evaluated whenever the subscription reconnects, so refreshed auth state is picked up automatically.

## Relation to `httpSubscriptionLink`

`httpSubscriptionLink` remains the EventSource-based SSE link. Prefer it when the native `EventSource` API or a ponyfill already matches your needs. Choose `httpFetchSubscriptionLink` when you need fetch-specific request control.
