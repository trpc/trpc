# Procedures

## Input and output

`.input()` and `.output()` take a Standard Schema (Zod, Valibot, ArkType) or an Effect Schema. Several `.input()` calls merge.

```ts
t.procedure
  .input(z.object({ id: z.string() }))
  .output(PostSchema)
  .query(({ input }) => db.post.find(input.id));
```

The resolver returns the output schema's input type and the client gets its output type, so transforms run on the server. An invalid input fails with a `BAD_REQUEST` error whose `data.issues` lists the problems. It is a typed (`defined`) error, so the client sees the issues in production too.

To type and document a result without running the schema, pass `{ validate: false }`. Since no transform runs, the resolver and the client both get the schema's input type, and OpenAPI describes that side:

```ts
t.procedure
  .output(PostSchema, { validate: false })
  .query(() => db.post.find(id));
```

## Files

`File` and `Blob` values can sit anywhere in an input. `httpLink` sends that call alone (outside a batch) as `multipart/form-data`, and the handler rebuilds them before validation. `maxBodySize` covers the whole body.

```ts
t.procedure
  .input(z.object({ postId: z.string(), cover: z.instanceof(File) }))
  .mutation(({ input }) => storage.put(input.postId, input.cover));

await client.setCover.mutate({ postId: '1', cover: file });
```

`wsLink` and `messagePortLink` don't send files; the call fails with a `BAD_REQUEST`. File outputs aren't supported over RPC yet. Over [OpenAPI](./openapi.md), a `File` or `Blob` output is the response body. For large uploads, use presigned URLs.

## Errors

There is one error class, `TrpcError`. Return or throw `error({ code })` from a resolver or a middleware. Errors a procedure declares get typed constructors, typed `data` and an OpenAPI entry:

```ts
const byId = t.procedure
  .errors({
    NOT_FOUND: { data: z.object({ id: z.string() }) },
    GONE: { status: 410, message: 'This post was removed' },
  })
  .input(z.object({ id: z.string() }))
  .query(
    ({ input, errors }) =>
      db.post.find(input.id) ?? errors.NOT_FOUND({ data: { id: input.id } }),
  );
```

On the client, `error.defined` is true for declared errors (narrow on `code` next) and false for anything else: thrown errors, network failures, aborts. Unexpected errors' messages are masked unless `NODE_ENV` is `development` or `test`, or `exposeUnexpectedErrors: true`. There is no `errorFormatter`.

## Middleware

```ts
const authed = t.procedure.use(({ ctx, next }) =>
  ctx.user
    ? next({ ctx: { user: ctx.user } })
    : error({ code: 'UNAUTHORIZED' }),
);
```

`next({ ctx })` adds to the ctx; `ok(value)` short-circuits with a result. Middleware is per procedure: build base procedures and share them. Routers take none. `t.middleware(fn)` types a middleware once for reuse.

`trpcdev/middleware` has lifecycle helpers, each an ordinary middleware:

```ts
import { onError, onFinish } from 'trpcdev/middleware';

const observed = t.procedure
  .use(onFinish((result, { path }) => metrics.count(path, result.ok)))
  .use(onError((err, { path }) => log.warn(path, err.code)));
```

## Effect

A resolver can return an `Effect` or a `Stream`. Its failures become errors, and the services it needs become the handler's required `layer`:

```ts
class PostRepo extends Context.Service<
  PostRepo,
  { find: (id: string) => Effect.Effect<Post> }
>()('PostRepo') {}

const byId = t.procedure
  .input(z.object({ id: z.string() }))
  .query(({ input }) =>
    Effect.gen(function* () {
      const repo = yield* PostRepo;
      return yield* repo.find(input.id);
    }),
  );

createFetchHandler({ router: { byId }, layer: PostRepoLive });
```

`t.middleware.effect<{ provides: S }>()(fn)` writes a middleware whose `next()` is an `Effect`, so it can provide services:

```ts
const withUser = t.middleware.effect<{ provides: CurrentUser }>()(
  ({ ctx, next }) => next().pipe(Effect.provideService(CurrentUser, ctx.user)),
);
```

Every call runs in an Effect span named `trpc.<path>`, with `rpc.system`, `rpc.method` and `trpc.type` attributes, plus `trpc.error.code` when it fails. Spans opened in resolvers nest under it. Put an OpenTelemetry tracer in the handler's `layer` (`@effect/opentelemetry`) to export them.

### Work after the response

`Effect.forkDetach` starts a fiber that keeps running after the call returns, on a long-lived server:

```ts
t.procedure.mutation(({ input }) =>
  Effect.gen(function* () {
    const user = yield* Users.create(input);
    yield* Effect.forkDetach(Mailer.welcome(user));
    return user;
  }),
);
```

Serverless runtimes may freeze the instance once the response is sent. There, hand the promise to the platform: `ctx.waitUntil()` on Workers (see [Platforms](./platforms.md)), `after()` in Next.js, `waitUntil` from `@vercel/functions` on Vercel.

## Calling procedures on the server

```ts
import { call, createRouterClient } from 'trpcdev/server';

const caller = createRouterClient(appRouter, { ctx: { user } });
await caller.post.byId.query({ id: '1' });

await call(appRouter.post.byId, { id: '1' }, { ctx: { user } });
```

`localLink({ router })` does the same inside a client's link chain. For React Server Actions, see [Server Actions and RSC](./actions-and-rsc.md).
