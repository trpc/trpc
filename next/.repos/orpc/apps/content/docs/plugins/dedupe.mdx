---
title: "Dedupe Plugin"
description: "Prevent redundant requests by deduplicating similar in-flight requests, reducing the number of requests sent to the server."
sidebar:
  label: "Dedupe"
---

## Overview

```ts
import { DedupeLinkPlugin } from '@orpc/client/plugins'

const link = new RPCLink({
  plugins: [
    new DedupeLinkPlugin({
      groups: [
        {
          condition: () => true,
          context: {}, // Context used for the rest of the request lifecycle
        },
      ],
    }),
  ],
})
```

:::info
The `link` can be any supported oRPC link, such as [RPCLink](/docs/rpc/link), [OpenAPILink](/docs/openapi/link), or a custom one.
:::

## Filter

By default, the plugin deduplicates `GET` and `QUERY` requests. You can customize this behavior by providing a `filter` function.

```ts
const link = new RPCLink({
  plugins: [
    new DedupeLinkPlugin({
      filter: ({ request }) => request.method === 'GET',
      groups: [
        {
          condition: () => true,
          context: {},
        },
      ],
    }),
  ],
})
```

:::warning
If you are using [RPC Link](/docs/rpc/link), you might need to [customize the request method](/docs/rpc/link#request-method) because it defaults to `POST`.
:::

:::tip
If your application does not need to run multiple mutation requests in parallel within the same [call stack](https://developer.mozilla.org/en-US/docs/Glossary/Call_stack), you can expand the filter to deduplicate **all** request types.
This can also help prevent duplicate mutation requests when users click actions too quickly.
:::

## Groups

Only requests in the same group are deduplicated together. Each group also defines a `context`, as described in [client context](/docs/client/client-side#client-context).

The following example deduplicates requests by cache policy:

```ts
interface ClientContext {
  cache?: RequestCache
}

const link = new RPCLink<ClientContext>({
  method: ({ context }) => {
    if (context?.cache) {
      return 'GET'
    }

    return 'POST'
  },
  plugins: [
    new DedupeLinkPlugin({
      groups: [
        {
          condition: ({ context }) => context?.cache === 'force-cache',
          context: { // used for the rest of the request lifecycle
            cache: 'force-cache',
          },
        },
        { // Fallback for all other requests. Keep this last.
          condition: () => true,
          context: {},
        },
      ],
    }),
  ],
  fetch: (url, init, { context }) => globalThis.fetch(url, {
    ...init,
    cache: context?.cache,
  }),
})
```

Now, calls made with `cache = 'force-cache'` use that cache setting whether they are deduplicated or sent individually.

## Wait Time

By default, only identical requests made in the same [event loop](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model#job_queue_and_event_loop) tick are deduplicated. Set `wait` to hold requests for a number of milliseconds, so identical requests made shortly after share one response.

```ts
const link = new RPCLink({
  plugins: [
    new DedupeLinkPlugin({
      wait: 10, // ms
      groups: [
        {
          condition: () => true,
          context: {},
        },
      ],
    }),
  ],
})
```

The wait starts when the first request is queued, so no request waits longer than `wait`, even while more keep arriving.

## Scope

On the server, requests from different users can be deduplicated together. If your transport reads per-request data (in `fetch`, `origin`, and so on), set `scope` to a value unique to the incoming request.

```ts
import { AsyncLocalStorage } from 'node:async_hooks'

const requestStorage = new AsyncLocalStorage<Request>() // set per incoming request

const link = new RPCLink({
  plugins: [
    new DedupeLinkPlugin({
      scope: () => requestStorage.getStore(),
      groups: [
        {
          condition: () => true,
          context: {},
        },
      ],
    }),
  ],
})
```

:::tip
Per-request data passed through the link's [`headers` option](/docs/rpc/link#url-and-header-options) is part of the deduplication key, so it is safe without `scope`.
:::

## Learn More

For implementation details, see the [source code](https://github.com/middleapi/orpc/blob/main/packages/client/src/plugins/dedupe.ts).
