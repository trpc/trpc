---
id: overview
title: Links Overview
sidebar_label: "Links"
slug: /client/links
section: "Client Usage"
order: 30
skill:
  name: links
  package: "@trpc/client"
  type: core
  requires:
    - client-setup
  description: "Configure the tRPC client link chain: httpLink, httpBatchLink,
    httpBatchStreamLink, splitLink, loggerLink, wsLink, createWSClient,
    httpSubscriptionLink, unstable_localLink, retryLink. Choose the right
    terminating link, route subscriptions or non-batched calls with splitLink,
    pass per-operation context, and write custom links. Link options: url,
    headers, transformer, maxURLLength, maxItems, methodOverride,
    connectionParams, EventSource ponyfill."
  references:
    - client/links/httpBatchLink
    - client/links/httpLink
    - client/links/httpBatchStreamLink
    - client/links/httpSubscriptionLink
    - client/links/wsLink
    - client/links/localLink
    - client/links/splitLink
    - client/links/loggerLink
    - client/links/retryLink
---

Links enable you to customize the flow of data between the tRPC Client and Server. A link should do only one thing, which can be either a self-contained modification to a tRPC operation (query, mutation, or subscription) or a side-effect based on the operation (such as logging).

You can compose links together into an array that you can provide to the tRPC client configuration via the `links` property, which represents a link chain. This means that the tRPC client will execute the links in the order they are added to the `links` array when doing a request and will execute them again in reverse when it's handling a response. Here's a visual representation of the link chain:

<div align="center" style="margin-bottom: 12px">
  <img src="/v11/img/links-diagram.svg" style="background: white" alt="tRPC Link Diagram"/>
  <small>tRPC Link Diagram. Based on <a href="https://www.apollographql.com/docs/react/api/link/introduction/" target="_blank">Apollo's</a>.</small>
</div>

```ts twoslash title='utils/trpc.ts'
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import { createTRPCClient, httpBatchLink, loggerLink } from '@trpc/client';
import type { AppRouter } from './server';

export const trpc = createTRPCClient<AppRouter>({
  links: [
    loggerLink(),
    httpBatchLink({
      url: 'http://localhost:3000',
    }),
  ],
});
```

## Creating a custom link

A link is a function that follows the `TRPCLink` type. Each link is composed of three parts:

1. The link returns a function that has no parameters. This is the setup phase where the link is initialized — it happens once per app and is useful for storing caches or other state.
2. The function in step 1 returns another function that receives an object with two properties: `op` which is the `Operation` that is being executed by the client, and `next` which is the function we use to call the next link down the chain.
3. The function in step 2 returns a final function that returns the `observable` function provided by `@trpc/server`. The `observable` accepts a function that receives an `observer` which helps our link notify the next link up the chain how they should handle the operation result. In this function, we can just return `next(op)` and leave it as is, or we can subscribe to `next`, which enables our link to handle the operation result.

### Example

```tsx twoslash title='utils/customLink.ts'
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: customLink.ts
// ---cut---
import { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { AppRouter } from './server';

export const customLink: TRPCLink<AppRouter> = () => {
  // here we just got initialized in the app - this happens once per app
  // useful for storing cache for instance
  return ({ next, op }) => {
    // this is when passing the result to the next link

    // each link needs to return an observable which propagates results
    return observable((observer) => {
      console.log('performing operation:', op);
      const unsubscribe = next(op).subscribe({
        next(value) {
          console.log('we received value', value);
          observer.next(value);
        },
        error(err) {
          console.log('we received error', err);
          observer.error(err);
        },
        complete() {
          observer.complete();
        },
      });

      return unsubscribe;
    });
  };
};
```

### References

If you need a more real reference for creating your custom link, you can check out some of the built-in links tRPC provides on [GitHub](https://github.com/trpc/trpc/tree/main/packages/client/src/links).

## The terminating link

The **terminating link** is the last link in a link chain. Instead of calling the `next` function, the terminating link is responsible for sending your composed tRPC operation to the tRPC server and returning an `OperationResultEnvelope`.

The `links` array that you add to the tRPC client config should have at least one link, and that link should be a terminating link. If `links` don't have a terminating link at the end of them, the tRPC operation will not be sent to the tRPC server.

[`httpBatchLink`](./links/httpBatchLink.md) is the recommended terminating link by tRPC. Pick another one depending on your needs:

| Link | Use it for |
| --- | --- |
| [`httpBatchLink`](./links/httpBatchLink.md) | Queries and mutations. Calls made together, for example in a `Promise.all`, are sent as one HTTP request. |
| [`httpLink`](./links/httpLink.md) | One HTTP request per call, for example to [skip batching](./links/splitLink.md#disable-batching-for-certain-requests) or to send [`FormData` and binary inputs](../server/non-json-content-types.md). |
| [`httpBatchStreamLink`](./links/httpBatchStreamLink.md) | Batching, but each response is streamed as soon as it's ready. Required for procedures that return async generators or promises nested in the output. |
| [`httpSubscriptionLink`](./links/httpSubscriptionLink.md) | Subscriptions over Server-sent Events. |
| [`wsLink`](./links/wsLink.md) | Any operation over a WebSocket. |
| [`unstable_localLink`](./links/localLink.md) | Calling a router in the same process, without HTTP. |

The HTTP links don't handle subscriptions, so to use subscriptions alongside them, route by operation type with a [`splitLink`](./links/splitLink.md):

```ts twoslash title='utils/trpc.ts'
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import {
  createTRPCClient,
  httpBatchLink,
  httpSubscriptionLink,
  loggerLink,
  splitLink,
} from '@trpc/client';
import type { AppRouter } from './server';

export const trpc = createTRPCClient<AppRouter>({
  links: [
    loggerLink(),
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: httpSubscriptionLink({ url: 'http://localhost:3000' }),
      false: httpBatchLink({ url: 'http://localhost:3000' }),
    }),
  ],
});
```

## Managing context

As an operation moves along your link chain, it maintains a context that each link can read and modify. This allows links to pass metadata along the chain that other links use in their execution logic.

Obtain the current context object and modify it by accessing `op.context`.

You can set the context object's initial value for a particular operation by providing the context parameter to the `query` or `useQuery` hook (or `mutation`, `subscription`, etc.).

For an example use case, see [Disable batching for certain requests](/docs/client/links/splitLink#disable-batching-for-certain-requests).

## Common mistakes

- **No terminating link at the end of the chain.** Calls fail with `No more links to execute - did you forget to add an ending link?`. Links listed after the terminating link never run, so put `loggerLink`, `retryLink` and your own links before it.
- **A `splitLink` branch without a terminating link.** Each branch is its own chain, so each one needs to end in a terminating link.
- **Sending subscriptions through `httpLink`, `httpBatchLink` or `httpBatchStreamLink`.** They throw on subscriptions. Route them to `httpSubscriptionLink` or `wsLink` with a `splitLink`, as shown in [The terminating link](#the-terminating-link).
- **Returning an async generator from a query through `httpLink` or `httpBatchLink`.** The server responds with `Cannot use stream-like response in non-streaming request - use httpBatchStreamLink`.
- **Reading `op` in a batch link's `headers` callback.** `httpBatchLink` and `httpBatchStreamLink` call `headers({ opList })` once per batch, with all its operations. Only `httpLink` gets a single `{ op }`.
- **Unbounded batches.** `maxURLLength` and `maxItems` default to `Infinity`. If long URLs hit limits in your server or CDN, set `maxURLLength`. If the server sets `maxBatchSize`, set `maxItems` to the same or a lower value, or larger batches are rejected with `400 Bad Request`. See [`httpBatchLink`](./links/httpBatchLink.md#setting-a-maximum-url-length).
- **Forgetting the transformer on one link.** If your server uses a [data transformer](../server/data-transformers.md), every terminating link needs the same `transformer`, in every `splitLink` branch.
