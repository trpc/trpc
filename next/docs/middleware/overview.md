---
title: Built-in middleware
label: Overview
description: The middleware in @trpc12/trpc/middleware, for logs and metrics, and how to apply it.
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

| Middleware                        | Does                                                                                             | Needs on the handler |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------- |
| [Lifecycle hooks](./lifecycle.md) | `onStart`, `onSuccess`, `onError` and `onFinish` run code around each call, for logs and metrics | nothing              |

To add middleware, context, meta and errors to every procedure of an app from a package, see [Extensions](../server/extensions.md).
