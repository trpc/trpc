# Open trpc/trpc issues against vNext

2026-10-15. Question: which open issues on `trpc/trpc` does vNext already answer, and which should we still consider?

Method: `gh issue list --repo trpc/trpc --state open --limit 1000 --json number,title,body,labels,reactionGroups,comments` returned 144 issues. Each one was read and checked against `next/` code and `.agent-docs/decisions/`. Type claims were checked with `pnpm vp lint` (tsgolint), because Vitest's typecheck doesn't cover `expectTypeOf` in these files.

## Fixed while reviewing

- #7626, sync validation: Standard Schema results, resolvers and `provide` values that aren't promises no longer go through a promise. A procedure with no async step runs under `Effect.runSync` (`procedures.test.ts`).
- #6997 and #6800, "excessively deep" types: a recursive `JsonValue` output failed in vNext too. `Deserialized<T>` now returns plain data (no thenables, iterables or functions) as it is, which also keeps branded tuples identical (#6500) (`basics.test.ts`).
- SSE keep-alives: the `fetch-sse` decision promised them but the handler sent none. Both the RPC and OpenAPI handlers now send `: ping` every 15 s (`sse.pingMs`).
- #1937, #7180, #6670, files over RPC: `File` and `Blob` anywhere in an input, sent by `httpLink` as `multipart/form-data` (proposal 11 (f)). The output side of Q11.6 is still open (`files.test.ts`).
- #7022, tracing: every call runs in a `trpc.<path>` server span with `rpc.method`, `trpc.type` and `trpc.error.code` (`effect.test.ts`).
- #7064, per-call reconnect: `{ reconnect: false }` on a subscription call fails with `NETWORK_ERROR` instead of rerunning it.
- #6664, the React context: `createTrpcContext()` returns `context` for bridges (React and Preact).
- #5534, #7446, bodies already read: `toHttpEffect` rebuilds the body from `req.body` after `express.json()`, `text()` or `raw()`, and otherwise fails with a 500 that names the cause instead of a misleading validation error (`platforms.test.ts`).
- #6996 (related): JSONL and SSE decoding no longer need `TextDecoderStream`, which Hermes lacks. The SSE parser also handled a `\r\n` split across chunks as two line ends.
- WebSocket heartbeat: `wsLink` pings (`keepAlive`), and a connection that stops answering reconnects (`websockets.test.ts`).
- #7436, work after the response: `docs/procedures.md` documents `Effect.forkDetach` (tested) and the platforms' `waitUntil`. `docs/platforms.md` shows how a Workers `createContext` reaches `env` and `ctx` (a `WeakMap` keyed by the request).
- #6771 and Next control flow: `redirect()`, `notFound()` and dynamic-API errors (a string `digest`) were wrapped as `INTERNAL_SERVER_ERROR` by actions and in-process callers, and RSC dehydration redacted them. They now pass through unchanged (`actions.test.ts`, `rsc.test.tsx`).
- #7021, offline mutations: no helper needed. `mutationOptions()` carries `mutationKey` and `mutationFn`, so `setMutationDefaults(o.mutationKey, o)` lets a restored client resume paused mutations. Documented, and tested through dehydrate, JSON and hydrate (`core.test.ts`).
- #6306, structural sharing: `queryOptions()` and `infiniteOptions()` keep equal `Date`, `Map`, `Set`, `URL` and typed-array values across refetches (`sharing.test.ts`, `core.test.ts`).
- Layers that provide no services (a tracer, a logger) were rejected by the `layer` option types.

## Already answered by vNext

| Issue                                    | Ask                                                   | vNext                                                                                                        |
| ---------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| #3297 (314 reactions)                    | RSC                                                   | `@trpcdev/tanstack-react-query/rsc`                                                                          |
| #3438, #6947                             | typed errors; handled vs unhandled                    | `.errors()`, `defined`, masking of unexpected errors                                                         |
| #1963                                    | `ctx` in input parsers                                | `.input(({ ctx }) => schema)`                                                                                |
| #3958                                    | dependency injection                                  | Effect services, `.provide()`, `layer`                                                                       |
| #4066                                    | middleware overrides the result                       | `ok(value)` short-circuits                                                                                   |
| #4191, #5110                             | typed standalone middleware                           | `t.middleware()`, `middleware.effect<{ input }>()`                                                           |
| #6978                                    | resolver returns the output schema's input (codecs)   | default `.output()` typing; `{ validate: false }`                                                            |
| #5004, #6835, #5933, #6998               | publish `AppRouter`, portable types                   | contracts, `toContract()` JSON, `trpcdev/internal` for declaration emit                                      |
| #7030, #2468                             | testing harness, mocks                                | `trpcdev/testing`; `implement()` a contract with stubs and use `localLink`                                   |
| #4757, #7091                             | call one procedure; caller shaped like the client     | `call()`; `createRouterClient()` has the client's shape                                                      |
| #3629, #6779                             | TanStack adapters beyond React                        | core plus React, Preact, Solid, Svelte, Vue, Angular and Lit packages                                        |
| #6154, #6232, #6364, #4889, #5940, #5493 | more `useUtils` helpers                               | none needed: `queryKey()`, `queryFilter()`, `mutationKey()` with TanStack's own `QueryClient` APIs and hooks |
| #7183, #7266, #6195, #6188               | hook option types                                     | TanStack's hooks take `queryOptions()` as they are                                                           |
| #6868                                    | subscription as `AsyncIterable`                       | `subscribe()` returns one                                                                                    |
| #6936                                    | `lastEventId` hardcoded in input                      | it's a resolver option and a call option, not input                                                          |
| #6950                                    | headers for SSE                                       | the client reads SSE with `fetch`                                                                            |
| #4122                                    | resume with the latest id after a WebSocket reconnect | `wsLink` resends the last `tracked()` id                                                                     |
| #7439                                    | `wsLink` ignores `signal`                             | aborts send `abort`; tested in `websockets.test.ts`                                                          |
| #4774                                    | WebSocket retry storm when `createContext` fails      | backoff with 5 attempts, and connection errors fail every call                                               |
| #6819                                    | stream content type                                   | `application/jsonl`                                                                                          |
| #6999, #6708                             | custom HTTP shapes, `x-www-form-urlencoded`           | `trpcdev/openapi` (routes, forms, bracket notation)                                                          |
| #5752                                    | `.` blocked by firewalls                              | decided: `.` stays (Q10.2); OpenAPI routes use `/`                                                           |
| #6325                                    | `Deno.serve`                                          | `handler.fetch` and `handler.websocket` (`docs/platforms.md`)                                                |
| #5484, #4257                             | no unstable imports; inspect routers                  | `trpcdev/extend` (`flattenRoutes`, `resolveProcedure`)                                                       |
| #6467                                    | next-safe-action                                      | `trpcdev/actions` (`createAction`, `createCallable`)                                                         |
| #5876                                    | prefetch without blocking                             | `hydrationOptions()` dehydrates pending queries; async iterables still can't cross into Client Components    |
| #5581                                    | proxies answering with non-tRPC JSON                  | a `PARSE_ERROR` that keeps the status and the cause                                                          |
| #6895                                    | Safari and streamed uploads                           | the client never streams request bodies                                                                      |

## Worth considering

Ordered by demand and fit.

1. **Query key prefix** (#6555, #5251, #4153). Two tRPC APIs sharing one `QueryClient` produce clashing keys. Something like `createTrpcQueryUtils(client, { keyPrefix })` would give `[[prefix, ...path], …]`. This changes the key shape in `tanstack-query-keys.md`, so it needs a call.
2. **Invalidation declared on mutations** (#5264, #3468, #6715). For example `.meta({ invalidates: ['post'] })` read by a TanStack `MutationCache` `onSuccess` helper. It fits as an opt-in helper, not as router config.
3. **Middleware that reshapes input** (#6892). `next({ input })` typed like `next({ ctx })`.
4. **`fetch` sees the operations** (#4184). `httpLink({ fetch })` could get `{ ops }` as a third argument for SSR cookie forwarding. `headers({ op })` covers most of it.
5. **Publisher backends** (#5618). The `memory` layer is per process. Redis, Postgres `LISTEN` or Durable Object layers behind the same `PublisherShape` would let subscriptions run across instances.
6. **TanStack DB** (#6891). `queryOptions()` should plug into `queryCollectionOptions` as it is; worth a test and a docs example.
7. **Adapters, recorded as later**: Lambda API Gateway and Lambda@Edge (#4978), Cloudflare hibernation, Firebase callable (#6388), WebTransport (#6971), raw TCP (#5995). The socket core is generic over connections, so the last two are a transport each.

## Not pursuing

- #6717 parsing on another thread; #4308 procedures without a type; #5966 router-level arguments; #6882 named builder methods (`.concat()` plugins cover composition); #6867 a serializer per type (`longQuery: 'post'` covers long URLs); #3628 Observables (`AsyncIterable` and Effect `Stream` instead).
- v11-only bugs and docs: Next pages router (#4649, #4650), `useUtils` and legacy React typing (#6721, #6521, #6595, #6724), the v11 adapters (#7502, #4734, #6057), examples and website docs (#3548, #3847, #4109, #5430, #5602, #5625, #5643, #5826, #5882, #5883, #6135, #6138, #6313, #6551, #6586, #6741, #6864, #6935, #7596), and repo chores (#162, #2855, #4460, #5867).
- Community threads: #1290, #1599.

## Checked later

- Already answered:
  - #4306: a handler whose `createContext` lacks what some procedure's ctx needs is a type error. The router's context is the intersection of its procedures' contexts (checked with tsgolint).
  - #7378: chained `.use()` middlewares merge their ctx without annotations.
  - #6407: an async generator's output types as `AsyncIterable` of what it yields.
  - #6862: `infiniteOptions({ input: (pageParam) => … })` maps the page param explicitly, so no `cursor: undefined` is injected into the input.
  - #6962: a subscription the server ends sets the `SubscriptionObserver` to `idle`, whatever the link.
  - #6097: `loggerLink({ log })` takes a custom logger, and the default logs the input and result values.
  - #5113: a link can rewrite `op.path`, so one client can cover routers on different servers with different contexts. The recipe is in `docs/client.md`, tested in `links.test.ts`.
  - #5455: RSC caching is per request (React `cache()`), so a ctx-dependent query can't leak between users.
- Worth considering:
  - #5846: a mutation whose output is an `AsyncIterable` resolves `useMutation`'s `data` to the iterable. TanStack has `streamedQuery` but no mutation counterpart. A `streamedMutationOptions()` could collect chunks into `data`.
  - #4829: there are no Next data-cache tags. With `'use cache'`, `cacheTag(...trpc.post.pathKey())` style tags (path prefixes, then path and input) would match TanStack's key hierarchy. Worth a docs recipe once `'use cache'` is stable.
  - #6996: the `TextDecoderStream` dependency is gone, but streaming hasn't been tried on a React Native device.
