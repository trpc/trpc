---
title: Built-in middleware
label: Overview
description: The middleware in @trpc12/trpc/middleware, for logging, rate limits, locks and durable calls, and how to apply it.
section: Middleware
order: 0
---

`@trpc12/trpc/middleware` has middleware for common jobs. Each one is ordinary [middleware](../server/middleware.md): apply it with `.use()` on a procedure or a base procedure, and give the handler the layer it needs, if any.

```ts twoslash
// ---cut-start---
import { t } from './server.ts';
// ---cut-end---
import { onError } from '@trpc12/trpc/middleware';

const logged = t.procedure.use(
  onError((err, opts) => console.error(opts.path, err.code)),
);
```

| Middleware                        | Does                                                                                                                             | Needs on the handler                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [Lifecycle hooks](./lifecycle.md) | `onStart`, `onSuccess`, `onError` and `onFinish` run code around each call, for logs and metrics                                 | nothing                                                             |
| [Rate limiting](./rate-limit.md)  | `rateLimit()` fails calls past a limit per key, and sets the `RateLimit` headers                                                 | a `RateLimiter` layer, in memory or Redis                           |
| [Locks](./lock.md)                | `experimental_lock()` runs calls with the same key one at a time, across instances                                               | an `experimental_Locker` layer, in memory, Redis or Durable Objects |
| [Durable calls](./durable.md)     | `experimental_durable()` keeps a call's result, so a client that lost the response gets it instead of running the mutation twice | a `BackingPersistence` layer                                        |

To add middleware, context, meta and errors to every procedure of an app from a package, see [Extensions](../server/extensions.md).
