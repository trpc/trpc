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

### Streamed outputs

A query or mutation can return an async generator or an Effect `Stream`. To validate each item, wrap the item schema in `stream()`; a second schema validates the generator's return value, which the client gets as the iterator's final value:

```ts
import { stream } from 'trpcdev/server';

const chat = t.procedure
  .output(stream(Token, Summary))
  .mutation(async function* () {
    yield { text: 'He' };
    yield { text: 'llo' };
    return { tokens: 2 };
  });

const it = await client.chat.mutate(); // AsyncIterable<Token, Summary>
```

A plain `.output(Item)` on a streaming resolver is a type error that points to `stream()`. An invalid item fails the stream with `INTERNAL_SERVER_ERROR` after the items before it have been delivered. Streams nested inside an object output aren't validated.

## Files

`File` and `Blob` values can sit anywhere in an input. `httpLink` sends that call alone (outside a batch) as `multipart/form-data`, and the handler rebuilds them before validation. `maxBodySize` covers the whole body.

```ts
t.procedure
  .input(z.object({ postId: z.string(), cover: z.instanceof(File) }))
  .mutation(({ input }) => storage.put(input.postId, input.cover));

await client.setCover.mutate({ postId: '1', cover: file });
```

`wsLink` and `messagePortLink` don't send files; the call fails with a `BAD_REQUEST`. For large uploads, use presigned URLs.

Outputs can hold files too, over every link:

```ts
t.procedure
  .input(z.object({ id: z.string() }))
  .query(
    ({ input }) =>
      new File([csv(input.id)], 'report.csv', { type: 'text/csv' }),
  );

const report = await client.report.query({ id }); // File
```

- When a `File` or `Blob` is the whole output of a call that isn't batched, `httpLink` gets it as the response body, with its `content-type` and a `content-disposition` naming the file, so the URL works as a download link too.
- Anywhere else (nested in an object, yielded by an async iterable, or in a batch), its bytes stream after the rest of the output as base64 chunks. The value holding it resolves once they've arrived, so a nested `File` is a `File`, not a promise. A file that appears twice is sent once.
- Over [OpenAPI](./openapi.md), a `File` or `Blob` output is the response body.

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

Any string is a code. The built-in ones (`NOT_FOUND`, `UNAUTHORIZED`, …) have their HTTP status; a custom code is a 400 unless you pass `status`:

```ts
error({ code: 'OUT_OF_STOCK' }); // 400
error({ code: 'OUT_OF_STOCK', status: 409 }); // 409
```

An error's `_tag` is its code, so Effect code narrows with `catchTag`:

```ts
Effect.catchTag('NOT_FOUND', () => Effect.succeed(null));
```

## Middleware

```ts
const authed = t.procedure.use(({ ctx, next }) =>
  ctx.user
    ? next({ ctx: { user: ctx.user } })
    : error({ code: 'UNAUTHORIZED' }),
);
```

`next({ ctx })` adds to the ctx; `ok(value)` short-circuits with a result. `next({ input })` replaces the input for the steps after it, and the resolver's `input` takes its type:

```ts
t.procedure
  .input(z.object({ slug: z.string() }))
  .use(async ({ input, next }) =>
    next({ input: { post: await posts.bySlug(input.slug) } }),
  )
  .query(({ input }) => input.post.title); // input: { post: Post }
```

The client still sends the schema's input. A later `.input()` parses the raw call input again, merged over the replaced one when both are objects.

Middleware is per procedure: build base procedures and share them. Routers take none. `t.middleware(fn)` types a middleware once for reuse.

`trpcdev/middleware` has lifecycle helpers, each an ordinary middleware:

```ts
import { onError, onFinish } from 'trpcdev/middleware';

const observed = t.procedure
  .use(onFinish((result, { path }) => metrics.count(path, result.ok)))
  .use(onError((err, { path }) => log.warn(path, err.code)));
```

## Responses

`response` sets the call's headers and status; Effect code uses the `Response` service over the same handle:

```ts
import { Response } from 'trpcdev/server';

t.procedure.mutation(({ response }) => {
  response.headers.append('set-cookie', 'session=…; HttpOnly');
  response.status = 201;
});

t.procedure.query(() =>
  Effect.gen(function* () {
    yield* Response.setHeader('cache-control', 'max-age=60');
    return yield* loadPosts;
  }),
);
```

In a batch, headers merge (`set-cookie` appends) and each call keeps its own status.

A procedure can also return its own response, an `HttpServerResponse` from `effect/http` or a web `Response`, for redirects, proxied upstreams or downloads. It's sent as is, with the handle's headers added, and the client's output is the web `Response`:

```ts
const report = t.procedure.query(() =>
  HttpServerResponse.text(toCsv(rows), { contentType: 'text/csv' }),
);
const res = await client.report.query(); // Response
```

Only an unbatched HTTP call can carry one: in a batch, over WebSockets or in-process, the call fails with `BAD_REQUEST`. With `httpLink({ batch: true })`, send such procedures through a `splitLink` to an unbatched link.

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

A failure that isn't a `TrpcError` is a type error until it is mapped (`Effect.catchTag`), so internals like a database error's query never reach clients. Mark the errors clients may see by making them `TrpcError.Tagged` classes; yielding or throwing one sends it typed, with its `data` validated first:

```ts
class PostNotFound extends TrpcError.Tagged('POST_NOT_FOUND', {
  status: 404,
  data: Schema.Struct({ id: Schema.String }),
}) {}

t.procedure.query(({ input }) =>
  Effect.gen(function* () {
    const post = yield* repo.find(input.id);
    if (!post) return yield* new PostNotFound({ id: input.id });
    return post;
  }),
);
```

`.errors({ POST_NOT_FOUND: PostNotFound })` documents one in OpenAPI.

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
