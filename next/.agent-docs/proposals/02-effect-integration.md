# 02 — Effect integration model

| Status     | Area                 | Depends on | oRPC parity rows  |
| ---------- | -------------------- | ---------- | ----------------- |
| `proposed` | server, client, core | 01         | — (cross-cutting) |

## Summary

The [brief](../decisions/brief.md) asks for three things that pull in different directions:

1. All logic in tRPC is written in Effect.
2. First-class Effect support for users.
3. "You shouldn't need to know Effect to use tRPC."

This proposal defines three layers. Effect is used for the internals. The default user-facing surface is Promise-based and Effect-free. An opt-in Effect surface lets handlers, middleware and clients speak Effect natively, including typed errors from the `E` channel and services from the `R` channel.

## Today (v11)

There is no Effect. The only mention is a comment in `parser.ts` about Effect function schemas. Links run on a custom observable implementation (`@trpc/server/observable`). Streaming, abort handling and retries are hand-written.

## Goals

- Promise users never import from `effect`. Hover types, error messages and docs never show Effect types to them.
- Effect users can write `Effect.fn(function* …)` handlers whose typed failures become typed client errors with no extra declarations.
- Effect users can require services (`Context.Service`) and provide them once per endpoint with a `Layer`.
- One runtime model: interruption, abort signals, timeouts, retries and streaming all go through Effect internally.
- Bundle size stays acceptable for browser clients.

## The three layers

| Layer               | Who sees it        | What it is                                                                                                                                                                                  |
| ------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Internals**       | contributors       | Execution pipeline, protocol codecs, serializer, links, streaming, retries: all `Effect`/`Stream`                                                                                           |
| **Promise surface** | everyone (default) | Async handlers and middleware, `Promise`/`AsyncIterable` client calls, error classes. Effect is a peer dependency ([effect-dependency](../decisions/effect-dependency.md)), never imported. |
| **Effect surface**  | opt-in             | Handlers/middleware returning `Effect`/`Stream`, Effect Schema validators, an Effect client returning `Effect`/`Stream`, Layers for services and platform                                   |

## Decision areas

### (a) How Effect handlers plug into the builder

```ts
// Promise user: no Effect anywhere
export const byId = t.procedure
  .input(z.object({ id: z.string() }))
  .query(async ({ ctx, input }) => ctx.db.post.find(input.id));

// Effect user: the handler returns an Effect
class PostRepo extends Context.Service<
  PostRepo,
  {
    find: (id: string) => Effect.Effect<Post, PostNotFound>;
  }
>()('PostRepo') {}

export const byIdEffect = t.procedure
  .input(Schema.Struct({ id: Schema.String }))
  .query(
    Effect.fn('post.byId')(function* ({ input }) {
      const repo = yield* PostRepo;
      return yield* repo.find(input.id); // E = PostNotFound → typed on the client (07)
    }),
  );
```

- **A1 — Same builder, detect at runtime.** The resolver may return `T | Promise<T> | Effect<T, E, R>` (and `AsyncIterable`/`Stream` for streams). The runtime checks with `Effect.isEffect` / `Stream.isStream`.
  - ✅ One builder, one mental model. Mixing Promise and Effect procedures in one router is trivial.
  - ❌ Overloads need care so that Promise users' hovers and errors do not mention `Effect`.
- **A2 — Separate Effect flavour.** For example `t.effect.procedure…query(…)` or `initTRPC.effect()`.
  - ✅ Cleaner types; the Promise flavour never references Effect types.
  - ❌ Two builders to document. Moving a procedure between flavours is a rewrite.

  ```ts
  // A2: Promise procedures stay on t.procedure; Effect procedures use their own builder
  export const byId = t.procedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => ctx.db.post.find(input.id));

  export const byIdEffect = t.effect.procedure // or a root from initTRPC.effect()
    .input(Schema.Struct({ id: Schema.String }))
    .query(
      Effect.fn('post.byId')(function* ({ input }) {
        const repo = yield* PostRepo;
        return yield* repo.find(input.id);
      }),
    );
  ```

- **A3 — Generator sugar** (on top of A1 or A2). A sync `function*` resolver is treated as `Effect.gen`, while `async function*` stays a stream: `.query(function* ({ input }) { const repo = yield* PostRepo; … })`.
  - ✅ Shortest Effect syntax.
  - ❌ Magic. It is distinguishable at runtime, but the typing must replicate `Effect.gen`'s inference, and it can be confused with async-generator subscriptions.

  ```ts
  // A3: sync generator = Effect.gen
  export const byIdGen = t.procedure
    .input(Schema.Struct({ id: Schema.String }))
    .query(function* ({ input }) {
      const repo = yield* PostRepo;
      return yield* repo.find(input.id);
    });

  // async generator = stream, as today
  export const onPost = t.procedure.subscription(async function* ({ signal }) {
    for await (const [post] of on(ee, 'post', { signal })) yield post;
  });
  ```

### (b) Services (the `R` channel)

- **S1 — Inferred.** Each procedure's `R` is inferred and the router type carries the union. The endpoint must provide a `Layer` covering it.
  - ✅ Zero declarations.
  - ❌ Computing unions across big routers costs type-checking time. Lazy routers complicate it further.

  ```ts
  // S1: nothing declared; each procedure's R is inferred
  const t = initTRPC<{ ctx: Ctx }>();
  export const appRouter = {
    post: { byId: byIdEffect }, // R = PostRepo
    mail: { send: sendEffect }, // R = Mailer
  }; // router R = PostRepo | Mailer

  createHandler({ router: appRouter, layer: PostRepo.layer }); // type error here: Mailer is not provided
  ```

- **S2 — Declared at the root.** `initTRPC<{ ctx: Ctx; services: PostRepo | Mailer }>()`. Resolvers may only require declared services (checked where the procedure is defined), and the endpoint must provide `Layer<PostRepo | Mailer>`.
  - ✅ Cheap types, explicit wiring, good error locality.
  - ❌ One more thing to declare.

  ```ts
  // S2
  const t = initTRPC<{ ctx: Ctx; services: PostRepo | Mailer }>();

  export const charge = t.procedure.mutation(
    Effect.fn(function* () {
      const billing = yield* Billing; // type error here: Billing is not a declared service
      return yield* billing.charge();
    }),
  );
  ```

```ts
const handler = createHandler({
  router: appRouter,
  layer: Layer.mergeAll(PostRepo.layer, Mailer.layer), // required iff services are declared
  createContext: ({ request }) => ({ headers: request.headers }),
});
```

> **Spike (2026-10-09):** [`notes/effect-services-typing.md`](../notes/effect-services-typing.md).
>
> - S1's router-wide union is cheap: about 9% more instantiations than S2 and no measurable check time at 1k–2k procedures. The cost concern above doesn't hold.
> - Both reject an incomplete `layer`. An explicit check is needed to name the missing service, because `Layer`'s own variance error is unreadable.
> - S2 needs the declared set to reach `createHandler`, and plain-object routers (08 A) don't carry it.

### (c) `ctx` versus services

Keep `ctx` as the universal dependency-injection mechanism, since Promise users need it. Services are an _additional_ channel for Effect users. Middleware may provide services as well as context (`Effect.provideService`). This mirrors `effect/rpc`'s `RpcMiddleware` with `provides`. See 06.

```ts
export const myPost = t.procedure
  .input(Schema.Struct({ id: Schema.String }))
  .query(
    Effect.fn(function* ({ ctx, input }) {
      const repo = yield* PostRepo; // service: Effect users only
      const post = yield* repo.find(input.id);
      if (post.authorId !== ctx.user.id)
        return yield* error({ code: 'FORBIDDEN' }); // ctx: everyone
      return post;
    }),
  );
```

### (d) Mapping the `E` channel to wire errors

- `TRPCError` failures, and anything 07 makes "declarable", become typed client errors.
- **Open:** other failures (arbitrary tagged errors) could either:
  - (i) be treated as undeclared `INTERNAL_SERVER_ERROR`, logged and excluded from the client union; or
  - (ii) be a **compile-time error** until they are mapped (for example with `Effect.catchTag` to a `TRPCError`).

  Option (ii) is stricter and avoids silently swallowing typed failures.

  ```ts
  class PostNotFound extends Schema.TaggedError<PostNotFound>()(
    'PostNotFound',
    { id: Schema.String },
  ) {}

  const find = Effect.fn(function* ({ input }: { input: { id: string } }) {
    const repo = yield* PostRepo;
    return yield* repo.find(input.id); // E = PostNotFound
  });

  // d.i: compiles; the client sees INTERNAL_SERVER_ERROR (defined: false) and the failure is logged
  t.procedure.input(Schema.Struct({ id: Schema.String })).query(find);

  // d.ii: the line above is a type error; map the failure first
  t.procedure
    .input(Schema.Struct({ id: Schema.String }))
    .query((opts) =>
      find(opts).pipe(
        Effect.catchTag('PostNotFound', (e) =>
          error({ code: 'NOT_FOUND', data: { id: e.id } }),
        ),
      ),
    );
  ```

- Defects (`Effect.die`, thrown exceptions) are always `INTERNAL_SERVER_ERROR`. Interruption maps to client abort or `CLIENT_CLOSED_REQUEST`.

### (e) Runtime and lifecycle

- Promise users run on an internal default runtime, so there is nothing to configure.
- Effect users pass a `layer` (built into a `ManagedRuntime` per handler) or a `runtime` they own. `handler.dispose()` releases resources.
- Request `AbortSignal` interrupts the fiber. `Effect.runPromise(effect, { signal })` already supports this.
- Tracing: every procedure call runs in `Effect.withSpan('trpc.<path>')`, so `@effect/opentelemetry` works without extra tRPC code. That covers oRPC's OpenTelemetry integration.

```ts
// Promise users: nothing to configure
const handler = createHandler({ router: appRouter, createContext });

// Effect users: a layer (built into a ManagedRuntime per handler) …
const handler = createHandler({
  router: appRouter,
  createContext,
  layer: AppLayer,
});
// … or a runtime they own
const runtime = ManagedRuntime.make(AppLayer);
const handler = createHandler({ router: appRouter, createContext, runtime });

await handler.dispose(); // releases the layer's resources
```

### (f) Effect client

```ts
import { TRPCClient } from '@trpc12/trpc/effect';

const program = Effect.gen(function* () {
  const client = yield* TRPCClient.make<AppRouter>({
    links: [httpLink({ url })],
  });
  const post = yield* client.post.byId.query({ id: '1' }); // Effect<Post, TRPCClientError<…>>
  yield* client.onPost.subscribe().pipe(Stream.runForEach(Console.log)); // Stream
});
```

It lives in `@trpc12/trpc/effect`. Per the [brief](../decisions/brief.md), anything without an external dependency other than Effect belongs in `@trpc12/trpc` (01).

### (g) Bundle size

- Effect core is ~6.3 KB min+gzip for a minimal program, and ~15 KB with Schema (`MIGRATION.md`).
- Keep `Schema` and `effect/http` **out of the client's default path**.
- Set a size budget after the first spike, and enforce it in CI with a bundle fixture (Effect's `packages/tools/bundle` is the model).

> **Spike (2026-10-09):** [`notes/effect-client-bundle-size.md`](../notes/effect-client-bundle-size.md). With a minimal Effect client (Promise or Effect surface), Effect's runtime is most of the size: 8.8 KB min+gzip, vs 5.7 KB for v11's `httpBatchLink` client. A full client (retry, SSE, danSON streaming) is 23.7 KB vs 12.9 KB for v11. Streaming danSON (`Queue`) is the most expensive single piece. On 4.0.2, Schema is ~22 KB rather than 15 KB. Includes candidate budgets.

### (h) Effect version policy

- `effect` is a peer dependency, `^4` (01).
  - **Decided ([effect-dependency](../decisions/effect-dependency.md)):** a peer dependency, `^4.0.0`.
- Our **public** types use only `@stability stable` Effect APIs.
- Internal use of `@stability unstable` modules (`effect/http`, `effect/rpc`, …) is allowed only behind our own abstractions, with a CI job that tests against the latest Effect minor.

```jsonc
// @trpc12/trpc/package.json
{ "peerDependencies": { "effect": "^4.0.0" } }
```

## Recommendation

- **A1** (same builder, runtime detection), with dedicated overload signatures so that Promise-only usage never surfaces Effect in hovers. Revisit A3 after v1.
- **S2** (declared services). It keeps types cheap and wiring explicit.
- Strict `E` mapping (**d.ii**). A typed failure that is not mapped is a compile error, because silently dropping typed errors defeats the point of Effect.
- An Effect client in `@trpc12/trpc/effect`.
- Bundle budget and Effect-version CI job as described above.

## Questions

- **Q2.1** Same builder with runtime detection (A1), or a separate Effect flavour (A2)? Add generator sugar (A3) now or later?
- **Q2.2** Services inferred (S1) or declared at the root (S2)?
- **Q2.3** Unmapped typed Effect failures: undeclared `INTERNAL_SERVER_ERROR` (d.i) or a compile error (d.ii)?
- **Q2.4** May internals use `@stability unstable` Effect modules (pinned and tested), or stable modules only?

## Decision

- **Q2.1:** [ ] A1 · [ ] A2 · generator sugar: [ ] now · [ ] later · [ ] never
- **Q2.2:** [ ] S1 inferred · [ ] S2 declared
- **Q2.3:** [ ] d.i undeclared · [ ] d.ii compile error
- **Q2.4:** [ ] stable only · [ ] unstable allowed internally
- **Notes:**
