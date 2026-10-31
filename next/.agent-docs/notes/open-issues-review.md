# Open trpc/trpc issues against vNext

2026-10-15. Question: which open issues on `trpc/trpc` does vNext already answer, and which should we still consider?

Method: `gh issue list --repo trpc/trpc --state open --limit 1000 --json number,title,body,labels,reactionGroups,comments` returned 144 issues. Each one was read and checked against `next/` code and `.agent-docs/decisions/`. Type claims were checked with `pnpm vp lint` (tsgolint), because Vitest's typecheck doesn't cover `expectTypeOf` in these files.

## Fixed while reviewing

- #7626, sync validation: Standard Schema results, resolvers and `provide` values that aren't promises no longer go through a promise. A procedure with no async step runs under `Effect.runSync` (`procedures.test.ts`).
- #6997 and #6800, "excessively deep" types: a recursive `JsonValue` output failed in vNext too. `Deserialized<T>` now returns plain data (no thenables, iterables or functions) as it is, which also keeps branded tuples identical (#6500) (`basics.test.ts`).
- SSE keep-alives: the `fetch-sse` decision promised them but the handler sent none. Both the RPC and OpenAPI handlers now send `: ping` every 15 s (`sse.pingInterval`).
- #1937, #7180, #6670, files over RPC: `File` and `Blob` anywhere in an input, sent by `httpLink` as `multipart/form-data` (proposal 11 (f)). Outputs since the second round (below).
- #7022, tracing: every call runs in a `trpc.<path>` server span with `rpc.method`, `trpc.type` and `trpc.error.code` (`effect.test.ts`).
- #7064, per-call reconnect: `{ reconnect: false }` on a subscription call fails with `NETWORK_ERROR` instead of rerunning it.
- #6664, the React context: `createTrpcContext()` returns `context` for bridges (React and Preact).
- #5534, #7446, bodies already read: `toHttpEffect` rebuilds the body from `req.body` after `express.json()`, `text()` or `raw()`, and otherwise fails with a 500 that names the cause instead of a misleading validation error (`platforms.test.ts`).
- #6996 (related): JSONL and SSE decoding no longer need `TextDecoderStream`, which Hermes lacks. The SSE parser also handled a `\r\n` split across chunks as two line ends.
- WebSocket heartbeat: `wsLink` pings (`keepAlive`), and a connection that stops answering reconnects (`websockets.test.ts`).
- #7436, work after the response: `www/docs/server/effect.md` documents `Effect.forkDetach` (tested) and the platforms' `waitUntil`. Workers' `env` and `ctx` reach `createContext` as the handler's typed platform argument (`handler.fetch(request, { env, ctx })`), which replaced a `WeakMap`-keyed-by-request recipe.
- #6771 and Next control flow: `redirect()`, `notFound()` and dynamic-API errors (a string `digest`) were wrapped as `INTERNAL_SERVER_ERROR` by actions and in-process callers, and RSC dehydration redacted them. They now pass through unchanged (`actions.test.ts`, `rsc.test.tsx`).
- #7021, offline mutations: no helper needed. `mutationOptions()` carries `mutationKey` and `mutationFn`, so `setMutationDefaults(o.mutationKey, o)` lets a restored client resume paused mutations. Documented, and tested through dehydrate, JSON and hydrate (`core.test.ts`).
- #6306, structural sharing: `queryOptions()` and `infiniteOptions()` keep equal `Date`, `Map`, `Set`, `URL` and typed-array values across refetches (`sharing.test.ts`, `core.test.ts`).
- Layers that provide no services (a tracer, a logger) were rejected by the `layer` option types.

## Already answered by vNext

| Issue                                    | Ask                                                   | vNext                                                                                                        |
| ---------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| #3297 (314 reactions)                    | RSC                                                   | `@trpc12/tanstack-react-query/rsc`                                                                           |
| #3438, #6947                             | typed errors; handled vs unhandled                    | `.errors()`, `defined`, masking of unexpected errors                                                         |
| #1963                                    | `ctx` in input parsers                                | `.input(({ ctx }) => schema)`                                                                                |
| #3958                                    | dependency injection                                  | Effect services, `.provide()`, `layer`                                                                       |
| #4066                                    | middleware overrides the result                       | `ok(value)` short-circuits                                                                                   |
| #4191, #5110                             | typed standalone middleware                           | `t.middleware()`, `middleware.effect<{ input }>()`                                                           |
| #6978                                    | resolver returns the output schema's input (codecs)   | default `.output()` typing; `{ validate: false }`                                                            |
| #5004, #6835, #5933, #6998               | publish `AppRouter`, portable types                   | contracts, `experimental_toContract()` JSON, `@trpc12/trpc/internal` for declaration emit                    |
| #7030, #2468                             | testing harness, mocks                                | `@trpc12/trpc/testing`; `implement()` a contract with stubs and use `localLink`                              |
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
| #6999, #6708                             | custom HTTP shapes, `x-www-form-urlencoded`           | `@trpc12/trpc/openapi` (routes, forms, bracket notation)                                                     |
| #5752                                    | `.` blocked by firewalls                              | decided: `.` stays (Q10.2); OpenAPI routes use `/`                                                           |
| #6325                                    | `Deno.serve`                                          | `handler.fetch` and `handler.websocket` (`www/docs/adapters/deno.md`)                                        |
| #5484, #4257                             | no unstable imports; inspect routers                  | `@trpc12/trpc/extend` (`flattenRoutes`, `resolveProcedure`)                                                  |
| #6467                                    | next-safe-action                                      | `@trpc12/trpc/actions` (`createAction`, `createCallable`)                                                    |
| #5876                                    | prefetch without blocking                             | `hydrationOptions()` dehydrates pending queries; async iterables still can't cross into Client Components    |
| #5581                                    | proxies answering with non-tRPC JSON                  | a `PARSE_ERROR` that keeps the status and the cause                                                          |
| #6895                                    | Safari and streamed uploads                           | the client never streams request bodies                                                                      |

## Decided and built (second round)

A human answered the "Worth considering" list; each answer is a `decisions/` file.

- Query key prefix (#6555, #5251, #4153): `keyPrefix` on `createTrpcQueryUtils`, `createTrpcContext` and `createTrpcRsc` (`query-key-prefix.md`).
- Invalidation declared on mutations (#5264, #3468, #6715): later, maybe as a link or plugin (`declared-invalidation-later.md`).
- Middleware that reshapes input (#6892): `next({ input })`, typed like `next({ ctx })` (`middleware-input.md`).
- `fetch` sees the operations (#4184): no third `fetch` argument. An `init` call option merged onto `httpLink({ init })`, which can be a callback of `{ ops }`; calls with different inits batch apart (`link-init.md`). Plus a named `switchLink` whose name is a call option that forces a branch (`switch-link.md`).
- Publisher backends (#5618): no packages; recipes on Effect's `Redis` and `@effect/sql-pg`, and a Durable Object one, in `www/docs/subscriptions/backends.md` (`publisher-backends.md`).
- Cloudflare hibernation: `createHibernatingWebSockets()` (`cloudflare-hibernation.md`).
- Streamed mutations (#5846): `streamedMutationOptions()`, interruptible with `abortWhenUnobserved` or a per-call `signal` ([note](./interruptible-streamed-mutations.md), `interruptible-streamed-mutations.md`).
- File outputs (Q11.6): raw body for an unbatched root `File`, streamed chunks elsewhere (`files.md`).
- Typed platform argument on `handler.fetch` (`handler-platform.md`).

## Still worth considering

1. **TanStack DB** (#6891). `queryOptions()` should plug into `queryCollectionOptions` as it is; worth a test and a docs example. Built since: `packages/tanstack-query/src/db.test.ts`, `www/docs/integrations/tanstack-query.md` (TanStack DB), `tanstack-db-collections.md`.
2. **Adapters, recorded as later**: Lambda API Gateway and Lambda@Edge (#4978, built since: `@trpc12/trpc/aws-lambda`, `aws-lambda-adapter.md`), Firebase callable (#6388, built since as a recipe: `firebase-callable-recipe.md`), WebTransport (#6971, not built: `webtransport-not-yet.md`), raw TCP (#5995, built since: `@trpc12/trpc/socket`, `socketLink`, `raw-socket-transport.md`). The socket core is generic over connections, so the last two are a transport each.

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
  - #5113: a link can rewrite `op.path`, so one client can cover routers on different servers with different contexts. The recipe is in `www/docs/client/links.md`, tested in `links.test.ts`.
  - #5455: RSC caching is per request (React `cache()`), so a ctx-dependent query can't leak between users.
- Worth considering:
  - #4829: there are no Next data-cache tags. With `'use cache'`, `cacheTag(...trpc.post.pathKey())` style tags (path prefixes, then path and input) would match TanStack's key hierarchy. Worth a docs recipe once `'use cache'` is stable. Built since: `cacheTags`/`revalidationTag`, `next-cache-tags.md`.
  - #6996: the `TextDecoderStream` dependency is gone, but streaming hasn't been tried on a React Native device.

## Third round (2026-10-17): open PRs and newer issues

`gh pr list --repo trpc/trpc --state open --limit 200` returned 89 PRs. Each one that changes behaviour was checked against vNext: by reading the code, with a probe test, or with a type check. The same pass covered the issues the first round had not, plus the ones opened since.

### Fixed in vNext

- Slow clients (#7661, which only cancels on disconnect): a streamed query, deferred value, batch or subscription over HTTP read its generator into memory as fast as it could. A probe paused the client: the server had pulled all 200,000 1 KB items. Every internal queue on that path is bounded now, OpenAPI's SSE body is pulled, and the v11 interop's JSONL batch waits too. The same probe stops at about 5,000 items (socket buffers), and the generator's `finally` runs when the client leaves (`streamed-responses-backpressure.md`). WebSockets still buffer; that's an open question in the same file.
- #7555: a path parameter with a malformed escape (`/things/%E0%A4%A`) was a 500 in the OpenAPI handler; now it's a 400 `BAD_REQUEST`. The RPC handler already answered 404.
- #7614: content types are matched by media type, case and parameters ignored. Case already worked, but `application/json-seq` was read as JSON (`hasMediaType` in `internal/protocol.ts`).
- #7612: the TanStack and React integration packages are marked `sideEffects: false`, like `@trpc12/trpc`.
- #4448, #7398, #7611 (`abortOnUnmount`): queries always pass TanStack's `signal`, so an unobserved query cancels. Documented in `www/docs/integrations/tanstack-query.md` and the migration guide; a per-query opt-out is an open question (`tanstack-query-signal.md`).
- #6740: the RSC docs read an unawaited `prefetch()` with `useQuery`, which can render loading on the server and data in the browser. They now say `useSuspenseQuery`, or to await the query.
- #7388: `useSuspenseInfiniteQuery({ ...infiniteOptions(…), select })` types the selected data. It already worked, since vNext hands TanStack its own options, and is now tested.

### Already answered by vNext

| PR or issue                       | Ask                                                       | vNext                                                                                                                  |
| --------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| #7663, #7664, #7665               | the request signal aborts after a normal response         | the signal aborts only when the call is interrupted; a probe saw no aborts after normal responses                      |
| #7666                             | SSE `maxDurationMs` timer left running                    | there is no such timer                                                                                                 |
| #7628                             | untracked SSE events inherit the last id                  | the client parser resets `id` per event, and both links keep the last tracked one                                      |
| #7447                             | Express 5 leaves `req.body` undefined                     | `parsedBody` checks `readableEnded`, so an unread body is streamed                                                     |
| #7668                             | a shared error instance formatted once                    | `withDefined` copies errors                                                                                            |
| #7667                             | lazy routes lost when composing routers                   | lazy routes are copied by reference                                                                                    |
| #7435, #7406, #7480, #7654        | WebSocket ids and subscription bookkeeping                | ids are registered before any await, deleted only by their owner, and must be numbers                                  |
| #7503, #7529                      | keep-alive registered twice                               | one keep-alive fiber per connection                                                                                    |
| #7213, #7607                      | stray rejections and leaked subscriptions on retry        | Effect streams are structured, so retries clean up                                                                     |
| #7413                             | batch stream not aborted on unsubscribe                   | a batch aborts once every call in it has aborted or settled                                                            |
| #7606                             | abort listeners kept after a request                      | `AbortSignal.any`                                                                                                      |
| #7623                             | falsy inputs dropped from query keys                      | keys drop only `undefined`                                                                                             |
| #7374, #7594                      | `skipToken`                                               | handled in `queryOptions`, `infiniteOptions` and `subscriptionOptions`                                                 |
| #7655                             | link `context` for subscriptions                          | `context` reaches the links                                                                                            |
| #7620, #6962                      | `onStopped`, idle after the server ends                   | answered in the first round                                                                                            |
| #7660, #7656, #7428               | `Serialize` of records, branded tuples, `AnyRouter` proxy | checked with tsc                                                                                                       |
| #7662                             | portable inferred types                                   | the `tooling/portability` fixture                                                                                      |
| #7377, #4306                      | routers with incompatible contexts                        | a type error (first round)                                                                                             |
| #7361, #6862                      | `cursor` in infinite inputs                               | `input: (pageParam) => …`                                                                                              |
| #7345, #7258, #7384, #6819        | the batch stream's content type                           | `application/jsonl`, or frames when asked for                                                                          |
| #7627, #7626                      | sync validation first                                     | sync schemas run without a promise (first round)                                                                       |
| #7461, #6868                      | `iterate()` on subscriptions                              | subscriptions are `AsyncIterable`                                                                                      |
| #7182, #6849, #6742               | `FormData`, typed errors, Solid                           | files in inputs and outputs, `.errors()`, `@trpc12/experimental-tanstack-solid-query`                                  |
| #7318, #7388, #7616, #7621, #7428 | v11 React Query hook types                                | vNext has no hooks of its own; TanStack's types apply                                                                  |
| #6681                             | type-instantiation benchmarks                             | `tooling/bench` measures tsc instantiations                                                                            |
| #7362                             | the automatic JSX runtime                                 | `"jsx": "react-jsx"` everywhere                                                                                        |
| #3708, #4876                      | forwarding headers; typed link context                    | `headers` and `context` call options; `createRouterClient({ ctx })`                                                    |
| #4317                             | cancelling a mutation                                     | a `signal` call option, which interrupts the server                                                                    |
| #4924, #4956                      | `setMutationDefaults`; TanStack options                   | `mutationOptions()` carries `mutationKey` and `mutationFn`; options are TanStack's own                                 |
| #5959                             | a type for each procedure's function, for mocks           | `TrpcClient<AppRouter>['post']['byId']['query']`                                                                       |
| #6153, #6977                      | masking unexpected errors; `error.cause`                  | `mask-unexpected-errors.md`; `cause` stays on the server                                                               |
| #6203                             | plugins that add meta keys                                | root extensions (`t.concat(ext)`) add meta keys, and builders require them                                             |
| #6308                             | generic types for passing utils around                    | `QueryProcedureUtils`, `MutationProcedureUtils` and `SubscriptionProcedureUtils` are exported                          |
| #6772                             | the response handle and a typed platform                  | `response` and `handler.fetch(request, platform)`                                                                      |
| #5787                             | extending outputs                                         | a second `.output()`, a plugin's included, is a type error (human); merging is left open (`builder-and-procedures.md`) |

### Open questions, recorded in decisions

- #7608 and #4734, a reconnect message before shutdown: there is none; subscriptions resume on a new connection, but in-flight queries fail. Add a graceful drain? (`subscriptions.md`)
- WebSocket backpressure, found while fixing HTTP's (`streamed-responses-backpressure.md`).

### Worth considering

- #6260, a link on Angular's `HttpClient`, for its interceptors and SSR transfer cache. `httpLink({ fetch })` takes a `fetch`, and `HttpClient` isn't one; an adapter (`HttpClient` as a `fetch`) would be a recipe, not a link.

### Not pursuing

- #7339: optimistic updates showing stale data after invalidation; unconfirmed, and TanStack's cache does the invalidating in vNext.
- #7175, #7176, #7429: Observables (`AsyncIterable` and Effect `Stream` instead). #7121 and #7494 are empty or unrelated.
- #7609, #7610, #6703, #6984: v11 examples. #7162, #7320, #7321, #7399, #7418, #7565, #7589, #7605, #7613, #7615, #7619, #6827, #7672: v11 docs and the website. #7364, #7417, #7602: v11 skill reviews.
- #7227, #7454, #7625, #7629, #7634, #7635, #7637, #7639, #7648, #7649, #7650, #7652, #7653, #7674, #7675: v11 repo chores and dependency bumps.

## Fourth round (2026-10-31): `main`'s merged fixes, after the sync

The 56 commits the 2026-10-31 sync brought from `main` (`d756e591a..9959a177b`) were checked against `next/`, skipping the ones the rounds above answered.

- Fixed in vNext:
  - #7707, an unexpected error made in another realm (`node:vm`, an iframe) fails `instanceof Error`, so `exposeUnexpectedErrors` showed "Internal server error" instead of its message (`isErrorLike`, `errors.test.ts`). Its `cause` already kept its own name and stack.
  - #7691, in the v11 interop only: an untracked SSE event after a tracked one inherited its id in a v11 client. The interop writes v11's `restore-id` frames ([`v11-stream-cancel-and-interop-parity.md`](../decisions/v11-stream-cancel-and-interop-parity.md)). vNext's own links reset the id per event.
  - #7748, bins pointing at files the build doesn't make: `tooling/pack/pack.test.ts` checks each `bin` is built, under `files`, with a shebang.
- Already answered:
  - #7729, #7731, `share()`'s fan-out and teardown: `dedupeLink` is `Stream.share` over an `RcMap`, and its tests cover a peer leaving, errors reaching every caller and a call after the end.
  - #7706 is #5534, #7699 is #7666, #7709 is #6057 (v11 adapters), #7683 is in the interop already.
- Not pursuing yet:
  - The rest of #7748's `verify-packed` (installing the packed tarballs together and type-checking every entry point with `skipLibCheck: false` under `nodenext` and `bundler`): `tooling/portability` compiles against the sources, so nothing checks the published declarations. Worth porting before the first publish.
  - #7675's publish gate: `next/` doesn't publish yet. #7726's Bun 1.4.4, #7694, #7695, #7658: CI and links `next/` doesn't share.
