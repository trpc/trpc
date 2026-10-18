---
title: Effect
description: Resolvers that return Effects, services from the handler's layer, typed failures and tracing.
section: Server
order: 9
---

tRPC v12 is built on [Effect](https://effect.website), and using it is optional: resolvers can return plain values and promises. A resolver can also return an `Effect` or a `Stream`. Its failures become errors, and the services it needs become the handler's required `layer`:

```ts twoslash
// ---cut-start---
import { t, type Post } from './server.ts';
declare const PostRepoLive: import('effect').Layer.Layer<PostRepo>;
// ---cut-end---
import { createFetchHandler } from '@trpc12/trpc/server';
import { Context, Effect } from 'effect';
import { z } from 'zod';

class PostRepo extends Context.Service<
  PostRepo,
  { find: (id: string) => Effect.Effect<Post | undefined> }
>()('PostRepo') {}

const byId = t.procedure.input(z.object({ id: z.string() })).query((opts) =>
  Effect.gen(function* () {
    const repo = yield* PostRepo;
    return yield* repo.find(opts.input.id);
  }),
);

createFetchHandler({
  router: { byId },
  createContext: () => ({ user: null }),
  layer: PostRepoLive,
});
```

## Errors clients may see

A failure that isn't a `TrpcError` is a type error until it is mapped (`Effect.catchTag`), so internals like a database error's query never reach clients. Mark the errors clients may see by making them `TrpcError.Tagged` classes; yielding or throwing one sends it typed, with its `data` validated first:

```ts twoslash
// ---cut-start---
import { TrpcError } from '@trpc12/trpc/server';
import { Effect, Schema } from 'effect';
import { z } from 'zod';
import { t, type Post } from './server.ts';
declare const repo: { find: (id: string) => Effect.Effect<Post | undefined> };
// ---cut-end---
class PostNotFound extends TrpcError.Tagged('POST_NOT_FOUND', {
  status: 404,
  data: Schema.Struct({ id: Schema.String }),
}) {}

t.procedure.input(z.object({ id: z.string() })).query((opts) =>
  Effect.gen(function* () {
    const post = yield* repo.find(opts.input.id);
    if (!post) return yield* new PostNotFound({ id: opts.input.id });
    return post;
  }),
);
```

`.errors({ POST_NOT_FOUND: PostNotFound })` documents one in OpenAPI.

## Middleware that provides services

`t.middleware.effect<{ provides: S }>()(fn)` writes a middleware whose `next()` is an `Effect`, so it can provide services:

```ts twoslash
// ---cut-start---
import { Context, Effect } from 'effect';
import { t, type User } from './server.ts';
class CurrentUser extends Context.Service<CurrentUser, User | null>()(
  'CurrentUser',
) {}
// ---cut-end---
const withUser = t.middleware.effect<{ provides: CurrentUser }>()((opts) =>
  opts.next().pipe(Effect.provideService(CurrentUser, opts.ctx.user)),
);
```

## Tracing

Tracing is opt-in: put a tracer in the handler's `layer` (`@effect/opentelemetry`) and every call runs in an Effect span named `trpc.<path>`, with `rpc.system`, `rpc.method` and `trpc.type` attributes, plus `trpc.error.code` when it fails. Spans opened in middlewares and resolvers nest under it. Without a tracer, calls open no span, so requests don't pay for one.

The span continues the request's trace: the `http.server` span on Effect HTTP servers, or the incoming `traceparent` header on `handler.fetch`, so a traced client and the server share one trace ([Client tracing](../client/tracing.md)). A WebSocket or MessagePort call continues the trace in its message's `trace` field, and starts its own trace without one.

## Work after the response

`Effect.forkDetach` starts a fiber that keeps running after the call returns, on a long-lived server:

```ts twoslash
// ---cut-start---
import { Effect } from 'effect';
import { t, type User } from './server.ts';
declare const Users: { create: (input: unknown) => Effect.Effect<User> };
declare const Mailer: { welcome: (user: User) => Effect.Effect<void> };
// ---cut-end---
t.procedure.mutation((opts) =>
  Effect.gen(function* () {
    const user = yield* Users.create(opts.input);
    yield* Effect.forkDetach(Mailer.welcome(user));
    return user;
  }),
);
```

Serverless runtimes may freeze the instance once the response is sent. There, hand the promise to the platform: `ctx.waitUntil()` on Workers (see [Fetch runtimes](../adapters/fetch.md#platform-arguments)), `after()` in Next.js, `waitUntil` from `@vercel/functions` on Vercel.

## The Effect client

On the client side, `createEffectClient` returns an `Effect` per call and a `Stream` per subscription ([The Effect client](../client/effect.md)).
