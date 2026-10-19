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
  httpLink,
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
    httpLink({ url: 'http://localhost:3000/trpc', batch: true }),
  ],
});
```

An operation goes through the links in order and its results come back the other way. Here the logger sees each call once, and identical queries are shared before the retries, so a retried query is still one request for every caller.

`links` takes at least one link, since the last one sends the request. An empty array is a type error, and so is an array type that may be empty (`AnyLink[]`). A spread before or after a link counts. A chain built elsewhere keeps its links' types written `as const`, and a function that takes one constrains it with `AtLeastOneLink`:

```ts twoslash
// @errors: 2345
// ---cut-start---
import type { AppRouter } from './server.ts';
// ---cut-end---
import {
  createTrpcClient,
  dedupeLink,
  httpLink,
  routerType,
  type AtLeastOneLink,
} from '@trpc12/trpc/client';

const shared = [dedupeLink()];
const chain = [...shared, httpLink({ url: '/trpc' })] as const;
createTrpcClient({ router: routerType<AppRouter>(), links: chain });

const clientWith = <const L extends AtLeastOneLink>(links: L) =>
  createTrpcClient({ router: routerType<AppRouter>(), links });
clientWith([]);
```

## Terminating links

| Link                            | Carries calls                                                          |
| ------------------------------- | ---------------------------------------------------------------------- |
| [`httpLink`](./links/http.md)   | Over HTTP: queries as `GET`, mutations as `POST`, subscriptions as SSE |
| [`wsLink`](./links/ws.md)       | Over one WebSocket                                                     |
| [`localLink`](./links/local.md) | To a router in the same process                                        |

## Links in the middle

| Link                              | Does                                                            |
| --------------------------------- | --------------------------------------------------------------- |
| [`splitLink`](./links/split.md)   | Picks one of two chains per call                                |
| [`switchLink`](./links/switch.md) | Picks one of several named chains, and a call can force one     |
| [`retryLink`](./links/retry.md)   | Retries failed calls                                            |
| [`dedupeLink`](./links/dedupe.md) | Lets a call join an identical one that hasn't sent anything yet |
| [`loggerLink`](./links/logger.md) | Logs every operation, its results and its errors                |

## Call options

A link declares the call options it reads (`dedupe` for `dedupeLink`, a `switchLink`'s name), and a client made with `router:` types them on every call next to `signal`, so a call takes an option only when a link in its chain reads it ([The client](./overview.md#call-options)). The terminating links also declare the [link codes](./errors.md#errors-from-the-links) they fail calls with, and the client's types follow:

| Link        | Call options                                          | Link codes                                            | Also                                                                             |
| ----------- | ----------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `httpLink`  | `headers`, `init`, `batch`, `reconnect`, `onResponse` | `NETWORK_ERROR`, `BAD_RESPONSE`, `STREAM_INTERRUPTED` | No `.subscribe()` with `subscriptions: false`; `batch: true` makes calls batched |
| `wsLink`    | `reconnect`                                           | `NETWORK_ERROR`, `BAD_RESPONSE`, `STREAM_INTERRUPTED` |                                                                                  |
| `localLink` | none                                                  | none                                                  |                                                                                  |

A `splitLink` or `switchLink` takes the options and codes of every branch, and drops a method only when no branch carries it. Every one of these links types outputs in its serializer's form, and a chain takes its form from its first link that declares one.

`link(({ op, next }) => stream)` writes a link of your own, with the call options it reads, the errors it fails with and what it needs from the links after it ([Custom links](./custom-links.md)).
