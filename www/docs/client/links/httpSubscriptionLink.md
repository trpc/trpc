---
id: httpSubscriptionLink
title: HTTP Subscription Link
sidebar_label: httpSubscriptionLink
slug: /client/links/httpSubscriptionLink
---

`httpSubscriptionLink` is a [**terminating link**](./overview.md#the-terminating-link) that's uses [Server-sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) for subscriptions.

SSE is a good option for real-time as it's a bit easier to deal with than WebSockets and handles things like reconnecting and continuing where it left off automatically.

## Usage

For a full example, see [our full-stack SSE example](https://github.com/trpc/next-prisma-sse-subscriptions).

## Setup

:::info
If your client's environment doesn't support EventSource, you need an [EventSource polyfill](https://www.npmjs.com/package/event-source-polyfill).
:::

To use `httpSubscriptionLink`, you need to use a [splitLink](./splitLink.mdx) to make it explicit that we want to use SSE for subscriptions.

```ts title="client/index.ts"
import type { TRPCLink } from '@trpc/client';
import {
  httpBatchLink,
  loggerLink,
  splitLink,
  unstable_httpSubscriptionLink,
} from '@trpc/client';

const trpcClient = createTRPCClient<AppRouter>({
  /**
   * @link https://trpc.io/docs/v11/client/links
   */
  links: [
    // adds pretty logs to your console in development and logs errors in production
    loggerLink(),
    splitLink({
      // uses the httpSubscriptionLink for subscriptions
      condition: (op) => op.type === 'subscription',
      true: unstable_httpSubscriptionLink({
        url: `/api/trpc`,
      }),
      false: httpBatchLink({
        url: `/api/trpc`,
      }),
    }),
  ],
});
```

## `httpSubscriptionLink` Options

```ts
type HTTPSubscriptionLinkOptions<TRoot extends AnyClientTypes> = {
  /**
   * The URL to connect to (can be a function that returns a URL)
   */
  url: string | (() => MaybePromise<string>);
  /**
   * EventSource options
   */
  eventSourceOptions?: EventSourceInit;
  /**
   * Data transformer
   * @link https://trpc.io/docs/v11/data-transformers
   **/
  transformer?: DataTransformerOptions;
};
```
