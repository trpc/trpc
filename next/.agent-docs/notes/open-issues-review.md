# Open trpc/trpc issues against vNext

2026-10-15. Question: which open issues on `trpc/trpc` does vNext already answer, and which should we still consider?

Method: `gh issue list --repo trpc/trpc --state open --limit 1000 --json number,title,body,labels,reactionGroups,comments` returned 144 issues. Each one was read and checked against `next/` code and `.agent-docs/decisions/`. Type claims were checked with `pnpm vp lint` (tsgolint), because Vitest's typecheck doesn't cover `expectTypeOf` in these files.

## Fixed while reviewing

- #7626, sync validation: Standard Schema results, resolvers and `provide` values that aren't promises no longer go through a promise. A procedure with no async step runs under `Effect.runSync` (`procedures.test.ts`).
- #6997 and #6800, "excessively deep" types: a recursive `JsonValue` output failed in vNext too. `Deserialized<T>` now returns plain data (no thenables, iterables or functions) as it is, which also keeps branded tuples identical (#6500) (`basics.test.ts`).
- SSE keep-alives: the `fetch-sse` decision promised them but the handler sent none. It now sends `: ping` every 15 s (`sse.pingMs`).

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

1. **Files over RPC** (#1937 with 96 reactions, #7180, #6670, #7446). Proposal 11 (f) describes `File` and `Blob` as serializer types that reference `multipart/form-data` parts, anywhere in the input. Only OpenAPI handles files today; the RPC handler accepts JSON only. Q11.6 (nested inputs, outputs) is still open.
2. **Built-in tracing** (#7022). Procedures could run in `Effect.withSpan('trpc.<path>')`, with path, type and error code as attributes. Effect's OpenTelemetry layer would then export them with no extra wiring. Today it's one middleware.
3. **Query key prefix** (#6555, #5251, #4153). Two tRPC APIs sharing one `QueryClient` produce clashing keys. Something like `createTrpcQueryUtils(client, { keyPrefix })` would give `[[prefix, ...path], …]`. This changes the key shape in `tanstack-query-keys.md`, so it needs a call.
4. **Structural sharing for danSON types** (#6306). TanStack's `replaceEqualDeep` treats `Date`, `Map` and `Set` as new values, so a refetch with equal data re-renders. `hydrationOptions()` could set a `structuralSharing` that compares them.
5. **Invalidation declared on mutations** (#5264, #3468, #6715). For example `.meta({ invalidates: ['post'] })` read by a TanStack `MutationCache` `onSuccess` helper. It fits as an opt-in helper, not as router config.
6. **Offline and persisted mutations** (#7021). Paused mutations resume only if `setMutationDefaults(mutationKey, { mutationFn })` is registered. A `trpc.post.create.mutationDefaults()` helper would cover it.
7. **WebSocket heartbeat**. There's no ping/pong on `wsLink` or the socket server, and idle proxies drop quiet sockets. #7502 is v11's double ping on Fastify.
8. **OpenAPI SSE keep-alives**, the same as RPC's.
9. **Per-call subscription reconnect** (#7064). An untracked subscription reruns from scratch after a dropped connection, which repeats side effects. A link call option `reconnect: false` would fit the flattened call options.
10. **Middleware that reshapes input** (#6892). `next({ input })` typed like `next({ ctx })`.
11. **Deferred work after the response** (#7436). Document `Effect.forkDaemon` and the platform's `waitUntil` (Next's `after()`), or add a `waitUntil` to the handler options.
12. **Bodies already read** (#5534, #7446). An Express or Koa body parser that ran first leaves an empty stream. Check `request.bodyUsed` and the Node request's state, and fail with a clear `BAD_REQUEST` instead of hanging.
13. **`fetch` sees the operations** (#4184). `httpLink({ fetch })` could get `{ ops }` as a third argument for SSR cookie forwarding. `headers({ op })` covers most of it.
14. **Dehydrating errors under Next** (#6771). Next's dynamic-rendering errors must not be redacted. Document `shouldRedactErrors` next to `createTrpcRsc`.
15. **Publisher backends** (#5618). The `memory` layer is per process. Redis, Postgres `LISTEN` or Durable Object layers behind the same `PublisherShape` would let subscriptions run across instances.
16. **TanStack DB** (#6891). `queryOptions()` should plug into `queryCollectionOptions` as it is; worth a test and a docs example.
17. **The React context object** (#6664). Return it from `createTrpcContext()` for context bridges (react-three-fiber).
18. **Adapters, recorded as later**: Lambda API Gateway and Lambda@Edge (#4978), Cloudflare hibernation, Firebase callable (#6388), WebTransport (#6971), raw TCP (#5995). The socket core is generic over connections, so the last two are a transport each.

## Not pursuing

- #6717 parsing on another thread; #4308 procedures without a type; #5966 router-level arguments; #6882 named builder methods (`.concat()` plugins cover composition); #6867 a serializer per type (`longQuery: 'post'` covers long URLs); #3628 Observables (`AsyncIterable` and Effect `Stream` instead).
- v11-only bugs and docs: Next pages router (#4649, #4650), `useUtils` and legacy React typing (#6721, #6521, #6595, #6724), the v11 adapters (#7502, #4734, #6057), examples and website docs (#3548, #3847, #4109, #5430, #5602, #5625, #5643, #5826, #5882, #5883, #6135, #6138, #6313, #6551, #6586, #6741, #6864, #6935, #7596), and repo chores (#162, #2855, #4460, #5867).
- Community threads: #1290, #1599.

## Not checked yet

#4306 and #7378 (context conflicts and inference across middlewares), #5113 (one client for routers with different contexts), #5846 and #6407 (streamed outputs in `useMutation`), #6862 (infinite queries refetching without a cursor), #6962 (server-closed subscriptions in hook state), #6996 (streaming on React Native), #6097 (a plain loggerLink format), #4829 and #5455 (Next cache tags).
