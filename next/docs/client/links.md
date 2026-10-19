---
title: Links
description: A client's chain of links, the built-in ones, and the order they go in.
section: Client
order: 2
---

A client's `links` is a chain: each link gets the operation and the rest of the chain. The links in the middle route, retry, share or log operations; the last one, the terminating link, carries them to a server or runs them in process.

```ts twoslash
// ---cut-start---
import type { AppRouter } from './server.ts';
// ---cut-end---
import {
  createTrpcClient,
  dedupeLink,
  httpStreamLink,
  loggerLink,
  retryLink,
  routerType,
} from '@trpc12/trpc/client';

const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [
    loggerLink({ enabled: () => process.env.NODE_ENV === 'development' }),
    dedupeLink(),
    retryLink(),
    httpStreamLink({ url: 'http://localhost:3000/trpc', batch: true }),
  ],
});
```

An operation goes through the links in order and its results come back the other way. Here the logger sees each call once, and identical queries are shared before the retries, so a retried query is still one request for every caller.

## Terminating links

| Link                                               | Carries calls                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| [`httpLink`](./links/http.md)                      | Over HTTP with `fetch`: queries as `GET`, mutations as `POST`                |
| [`httpStreamLink`](./links/http.md#httpstreamlink) | Over HTTP, with batching, streamed outputs and subscriptions as SSE (Effect) |
| [`wsLink`](./links/ws.md)                          | Over one WebSocket                                                           |
| [`localLink`](./links/local.md)                    | To a router in the same process                                              |

## Links in the middle

| Link                              | Does                                                            |
| --------------------------------- | --------------------------------------------------------------- |
| [`splitLink`](./links/split.md)   | Picks one of two chains per call                                |
| [`switchLink`](./links/switch.md) | Picks one of several named chains, and a call can force one     |
| [`retryLink`](./links/retry.md)   | Retries failed calls                                            |
| [`dedupeLink`](./links/dedupe.md) | Lets a call join an identical one that hasn't sent anything yet |
| [`loggerLink`](./links/logger.md) | Logs every operation, its results and its errors                |

## Call options

A link declares the call options it reads (`dedupe` for `dedupeLink`, a `switchLink`'s name), and a client made with `router:` types them on every call, next to the built-in `signal`, `headers`, `init`, `batch` and `reconnect` ([The client](./overview.md#call-options)).

## Promise links and Effect links

`httpLink` is a Promise link: it returns a `Promise`, and a chain of Promise links bundles no Effect. The other built-in links are Effect links, which return an Effect `Stream`; the first one in a chain brings the Effect runtime, for it and the links after it. The two kinds mix in any order, in `createTrpcClient` and in [`createEffectClient`](./effect.md).

`link(({ op, next }) => stream)` writes a link of your own, with the call options it reads, the errors it fails with and what it needs from the links after it, and `promiseLink(({ op, next }) => promise)` one without Effect ([Custom links](./custom-links.md)).
