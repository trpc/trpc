---
title: Lifecycle hooks
description: '`onStart`, `onSuccess`, `onError` and `onFinish`, for logging and metrics.'
section: Middleware
order: 1
---

`@trpc12/trpc/middleware` has lifecycle helpers, each an ordinary middleware:

```ts twoslash
// ---cut-start---
import { t } from './server.ts';
declare const metrics: { count(path: string, ok: boolean): void };
declare const log: { warn(path: string, code: string): void };
// ---cut-end---
import { onError, onFinish } from '@trpc12/trpc/middleware';

const observed = t.procedure
  .use(onFinish((result, opts) => metrics.count(opts.path, result.ok)))
  .use(onError((err, opts) => log.warn(opts.path, err.code)));
```

`opts.meta` and `opts.input` are typed from the procedure. `opts.ctx` is `unknown` unless you pass its type, `onError<{ user: User }>((err, opts) => …)`; a key the procedure's `ctx` lacks then becomes a requirement, as for [middleware from a package](../server/middleware.md#middleware-for-packages).

`onStart` runs before the rest of the chain, `onSuccess` with the result when the rest succeeds (for a subscription, once the stream is set up), `onError` with the error when it fails, and `onFinish` with the outcome either way. Put them on a base procedure to cover every procedure built from it ([Middleware](../server/middleware.md)).

For spans rather than logs, put a tracer in the handler's `layer`: every call already runs in a `trpc.<path>` span ([Tracing](../server/effect.md#tracing)).

## Credits

The four hooks follow [oRPC](https://orpc.dev)'s `onStart`, `onSuccess`, `onError` and `onFinish` interceptors.
