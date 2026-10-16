# 17 — Links: Effect-based, typed and informing call options

| Status     | Area   | Depends on | oRPC parity rows                                                         |
| ---------- | ------ | ---------- | ------------------------------------------------------------------------ |
| `proposed` | client | 02, 10, 16 | Batch requests, WebSockets, Message Port, Built-in plugins (client side) |

## Summary

The [brief](../decisions/brief.md) asks for two things:

- "Links are rewritten in Effect instead of custom observables."
- "Links can inform the options of `.query()` calls."

**Recommendation:**

- The link chain runs on Effect internally.
- Links can be authored with a simple Promise/AsyncIterable API or with Effect.
- Each link declares the call options and context it reads. The client type is inferred from the links through an inference-friendly `createTRPCClient` signature.
- The HTTP links merge into one `httpLink`.

## Today (v11)

- **Links:** `TRPCLink = (runtime) => ({ op, next }) => Observable<OperationResultEnvelope, TRPCClientError>`, built on the custom `@trpc/server/observable`.
- **Built-in links:** `httpLink`, `httpBatchLink`, `httpBatchStreamLink`, `httpSubscriptionLink`, `wsLink`, `splitLink`, `loggerLink`, `retryLink` and `unstable_localLink`. `dedupeLink` exists but is not exported.
- **Call context:** `op.context` is `Record<string, unknown>`, so link-specific per-call options are untyped.
- **Prior experiment:** [#5498](https://github.com/trpc/trpc/pull/5498) let links declare a "decoration" (per-call options plus runtime additions), inferred through a curried `createTRPCClientOptions<AppRouter>()(() => ({ links }))`. It was never finished. See `../reference/prior-art.md`.

## Goals

- No custom observable implementation. Cancellation, retries, timeouts and streaming come from Effect.
- Writing a custom link (for example auth refresh) stays easy for people who do not know Effect.
- Per-call options from links are typed: `client.x.query(input, { ignoreCache: true })` only compiles with `cacheLink()` installed.
- Fewer, more capable transport links.

## Decision areas

### (a) Authoring API

- **L-A — Effect only:**

  ```ts
  const authLink = link(({ op, next }) =>
    Effect.gen(function* () {
      const token = yield* Effect.promise(getToken);
      return yield* next({
        ...op,
        context: {
          ...op.context,
          headers: { authorization: `Bearer ${token}` },
        },
      });
    }),
  );
  ```

- **L-B — Dual:** a Promise-based `link()` with an Effect variant, `link.effect()`.

  ```ts
  const authLink = link(async ({ op, next }) =>
    next({
      ...op,
      context: {
        ...op.context,
        headers: { authorization: `Bearer ${await getToken()}` },
      },
    }),
  );
  ```

  For streams, `next()` returns an async iterable in the Promise variant and a `Stream` in the Effect variant.

### (b) Operation result model

- **OR-A:** every operation returns a `Stream`. A query is a one-element stream. This gives the simplest link code and makes interceptors uniform.

  ```ts
  // OR-A: one path for queries, mutations and subscriptions
  // (`link.effect` is L-B's Effect variant; under L-A it is plain `link`)
  const logLink = link.effect(({ op, next }) =>
    next(op).pipe(Stream.tap((result) => Effect.log(op.path, result))),
  );
  ```

- **OR-B:** separate `request` (`Effect`) and `stream` (`Stream`) paths. This is more precise but doubles link code.

  ```ts
  // OR-B: the same link written twice
  const logLink = link.effect({
    request: ({ op, next }) =>
      next(op).pipe(Effect.tap((result) => Effect.log(op.path, result))),
    stream: ({ op, next }) =>
      next(op).pipe(Stream.tap((result) => Effect.log(op.path, result))),
  });
  ```

### (c) How links inform call options and context

Each link declares what it reads:

```ts
const cacheLink = (): TRPCLink<{ options: { ignoreCache?: boolean }; context: {} }> => …;
const httpLink = (opts): TRPCLink<{ context: { headers?: HeadersInit } }> => …;
```

The client merges the declarations of all links into its call-options type. The difficulty is that TypeScript has no partial type-argument inference, so `createTRPCClient<AppRouter>({ links })` cannot also infer the type of `links`. Candidates:

| Option                           | Shape                                                                                                  | Trade-offs                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-A** Curried                  | `createTRPCClient<AppRouter>()({ links })`                                                             | Explicit and works today ([#5498](https://github.com/trpc/trpc/pull/5498)). The `()()` call is odd                                                                         |
| **D-B** Second generic           | `createTRPCClient<AppRouter, typeof links>({ links })` with `const links = [...] satisfies TRPCLink[]` | Verbose. Easy to forget, which silently loses options                                                                                                                      |
| **D-C** Inferred `router` value  | `createTRPCClient({ router: type<AppRouter>(), links })` (also accepts a runtime contract, 09)         | Everything inferred, no explicit generics. Needs its own type-carrier helper: 05's `type<T>()` was dropped ([validation](../decisions/validation.md)). Unfamiliar at first |
| **D-D** Global `Register`        | `declare module … { interface Register { router: AppRouter } }`                                        | No generics at all. Global, so it breaks with multiple clients and libraries                                                                                               |
| **D-E** Return annotation (oRPC) | `const client: TRPCClient<AppRouter, LinksOf<typeof links>> = createTRPCClient({ links })`             | Explicit. The user writes the link type twice                                                                                                                              |

> **Spike (2026-10-09):** [`notes/link-call-options-typing.md`](../notes/link-call-options-typing.md). D-A and D-C type options and inline router-aware links with plain inference; D-B/D-E links cannot see the router; D-E is unsound unless checked. Merging costs ~7% instantiations on a 1k-procedure client. The link phantom must be invariant.

### (d) Where link-declared fields go

- **F-A:** top-level call options, `query(input, { ignoreCache: true })`. This is the nicest syntax, but there is a risk of name clashes between links.
- **F-B:** always under `context`, `query(input, { context: { ignoreCache: true } })`. Explicit and clash-free, like oRPC's `ClientContext`.

```ts
const client = createTRPCClient({
  router: type<AppRouter>(),
  links: [cacheLink(), httpLink({ url })],
});

// F-A
await client.post.byId.query({ id: '1' }, { signal, ignoreCache: true });
// F-B
await client.post.byId.query(
  { id: '1' },
  { signal, context: { ignoreCache: true } },
);
// both: httpLink's own context
await client.post.byId.query(
  { id: '1' },
  { context: { headers: { 'x-trace': traceId } } },
);
```

### (e) Built-in links

| Link              | Replaces                                                           | Notes                                                                                |
| ----------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `httpLink`        | httpLink, httpBatchLink, httpBatchStreamLink, httpSubscriptionLink | `batch?: { maxItems, maxURLLength } \| false`; streaming and SSE by negotiation (10) |
| `wsLink`          | wsLink + createWSClient                                            | Lazy connect, reconnect via `Schedule`, `connectionParams`                           |
| `messagePortLink` | new                                                                | Electron, workers, iframes                                                           |
| `localLink`       | unstable_localLink                                                 | In-process with serialization, for tests and SSR                                     |
| `splitLink`       | splitLink                                                          | Condition receives typed `op` and context; covers oRPC's `DynamicLink`               |
| `retryLink`       | retryLink                                                          | `{ retries, delay }` or an Effect `Schedule`; honours `retry-after`                  |
| `loggerLink`      | loggerLink                                                         |                                                                                      |
| `dedupeLink`      | internal dedupeLink                                                | Dedupe identical in-flight queries (**open**: on by default inside `httpLink`?)      |

```ts
import {
  createTRPCClient,
  dedupeLink,
  httpLink,
  localLink,
  loggerLink,
  messagePortLink,
  retryLink,
  splitLink,
  wsLink,
} from '@trpc12/trpc/client';

const client = createTRPCClient({
  router: type<AppRouter>(),
  links: [
    loggerLink(),
    dedupeLink(),
    retryLink({ retries: 3, delay: 1000 }), // or an Effect Schedule: Schedule.exponential('100 millis')
    splitLink({
      condition: (op) =>
        op.type === 'subscription' || op.context.transport === 'ws',
      true: wsLink({
        url: 'wss://api.example.com/trpc',
        connectionParams: async () => ({ token: await getToken() }),
      }),
      false: httpLink({
        url: '/trpc',
        batch: { maxItems: 10, maxURLLength: 2048 },
      }),
    }),
  ],
});

// tests and SSR: in-process, with serialization
createTRPCClient({
  router: type<AppRouter>(),
  links: [localLink({ router: appRouter, createContext })],
});
// Electron, workers, iframes
createTRPCClient({
  router: type<AppRouter>(),
  links: [messagePortLink({ port: worker })],
}); // option name TBD
```

## Recommendation

- **L-B** (dual authoring) on an Effect core.
- **OR-A** (everything is a `Stream`).
- **D-C** (`router: type<AppRouter>()`) as the primary form, plus **D-A** as an alternative for people who prefer explicit generics. Benchmark the type-checking cost of merging link declarations.
- **F-B** (link fields under `context`). Revisit F-A once clashes are understood.
- One `httpLink`.

> ⚠️ This shapes every client example in the docs. It is the most visible API change in the client.

## Questions

- **Q17.1** Link authoring: Effect only (L-A) or dual Promise/Effect (L-B)?
- **Q17.2** Operation model: everything is a `Stream` (OR-A) or a request/stream split (OR-B)?
- **Q17.3** Typing links into call options: D-A curried, D-B second generic, D-C `router: type<AppRouter>()`, D-D global `Register`, or D-E return annotation? Is `createTRPCClient<AppRouter>({ links })` without link inference still OK as an option?
- **Q17.4** Merge all HTTP links into one `httpLink`?
- **Q17.5** Link-declared fields top-level (F-A) or under `context` (F-B)?

## Decision

- **Q17.1:** [ ] L-A · [ ] L-B
- **Q17.2:** [ ] OR-A · [ ] OR-B
- **Q17.3:** [ ] D-A · [ ] D-B · [ ] D-C · [ ] D-D · [ ] D-E — keep plain `<AppRouter>` form: [ ] yes · [ ] no
- **Q17.4:** [ ] yes · [ ] no
- **Q17.5:** [ ] F-A · [ ] F-B
- **Notes:**
