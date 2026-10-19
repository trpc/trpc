# oRPC parity matrix

**Goal from the [brief](../decisions/brief.md):** feature parity with [orpc.dev/docs/comparison](https://orpc.dev/docs/comparison). Any API decision that could stop us from getting there must be flagged and confirmed by a human before it is accepted. Since round two, parity tracks oRPC v2's table ([orpc-v2-parity](../decisions/orpc-v2-parity.md)).

Source: oRPC v2's `apps/content/docs/comparison.mdx` (vendored at `.repos/orpc`), row for row and in its groups. The oRPC and tRPC v11 columns are copied from it; the v11 column is oRPC's assessment and may lag behind v11. The v12 column is what `next/` ships, each row covered by integration tests with real clients. Unreviewed calls are the `(agent)` decisions: `pnpm decisions --who agent`.

Legend: ✅ first-class · 🟡 partial / third-party · 🛑 not supported. `experimental_` exports may still change ([stability-jsdoc-tags](../decisions/stability-jsdoc-tags.md)).

## Type safety

| Feature                                          | oRPC | v11 | v12 | Where                                                                                                                                                                                |
| ------------------------------------------------ | ---- | --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| End-to-end typesafe input/output                 | ✅   | ✅  | ✅  | Standard Schema and Effect Schema inputs and outputs; `packages/trpc/src/server/basics.test.ts`                                                                                      |
| End-to-end typesafe errors                       | ✅   | 🟡  | ✅  | Errors are inferred from returns and Effect failures; `.errors()` is optional; `safe()`, `isDefinedError`, `catchTag` on `_tag` ([inferred-errors](../decisions/inferred-errors.md)) |
| End-to-end typesafe File/Blob                    | ✅   | 🟡  | ✅  | `File`/`Blob` at any depth through danSON; raw file responses ([files](../decisions/files.md))                                                                                       |
| End-to-end typesafe Server-Sent Events           | ✅   | ✅  | ✅  | Fetch-streamed SSE subscriptions with `tracked()` resume; async generators and Effect `Stream`s validated with `stream(Item, Return?)`                                               |
| End-to-end typesafe `ReadableStream<Uint8Array>` | ✅   | 🛑  | 🟡  | Outputs, with danSON: the client gets a typed `ReadableStream<Uint8Array>` whose chunks travel as values in the JSONL stream, not as a raw body. No stream inputs                    |
| Typesafe at scale                                | ✅   | ✅  | 🟡  | 3,000 procedures check in 1.16s, but that's 23% slower than v11 and 66% slower than oRPC ([benchmarks](../notes/benchmarks.md))                                                      |

## API design and OpenAPI

| Feature                                  | oRPC | v11 | v12 | Where                                                                                                                                                                                                                                                                                        |
| ---------------------------------------- | ---- | --- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implementation-first approach            | ✅   | ✅  | ✅  | The default                                                                                                                                                                                                                                                                                  |
| Contract-first approach                  | ✅   | 🛑  | ✅  | `@trpc12/trpc/contract` + `t.implement(contract)`; implementer-wide `.use()` / `.provide()`, meta checked against `t`                                                                                                                                                                        |
| OpenAPI spec generation                  | ✅   | 🟡  | ✅  | `@trpc12/trpc/openapi`: `experimental_createOpenApiHandler`, `experimental_generateOpenApi`, the `experimental_openapi()` extension's `route` meta, `experimental_openApiLink`; `@trpc12/trpc/openapi/typescript`: `generateOpenApiFromTypes` for inferred errors and schema-less procedures |
| Standard Schema (Zod, Valibot, ArkType…) | ✅   | ✅  | ✅  | Standard Schema, plus Effect Schema; OpenAPI through Standard JSON Schema (`~standard.jsonSchema`)                                                                                                                                                                                           |
| Native types (Date, URL, Set, Map, …)    | ✅   | 🟡  | ✅  | Plain JSON by default, danSON with `createSerializer()` ([serializer](../decisions/serializer.md))                                                                                                                                                                                           |
| Custom serializers                       | ✅   | ✅  | ✅  | `createSyncSerializer(superjson)`, devalue or your own, with JSON-form client types ([replaceable-serializers](../decisions/replaceable-serializers.md))                                                                                                                                     |
| Bracket notation                         | ✅   | 🛑  | ✅  | `experimental_parseBracketNotation`, `experimental_toBracketNotation` in the handler and `experimental_openApiLink`                                                                                                                                                                          |
| Lazy router                              | ✅   | ✅  | ✅  | `lazy()`, `loadRouter()`                                                                                                                                                                                                                                                                     |

## Integrations and ecosystem

| Feature                                                  | oRPC | v11 | v12 | Where                                                                                                                                                                                                               |
| -------------------------------------------------------- | ---- | --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WebSockets                                               | ✅   | ✅  | ✅  | `wsLink` + `handler.websocket(ws)`; `@trpc12/trpc/http` upgrades on Effect's `HttpServer`                                                                                                                           |
| Hibernation APIs (Cloudflare WebSocket Hibernation, …)   | ✅   | 🛑  | ✅  | `@trpc12/trpc/cloudflare`: `experimental_createHibernatingWebSockets`, `experimental_hibernatingPublisher` ([cloudflare-hibernation](../decisions/cloudflare-hibernation.md))                                       |
| Message Port (Electron, browser extensions, workers, …)  | ✅   | 🟡  | ✅  | `experimental_messagePortLink` + `handler.messagePort(port)`                                                                                                                                                        |
| Batch requests                                           | ✅   | ✅  | ✅  | Opt-in streamed batching (`batch: true`)                                                                                                                                                                            |
| Pub/Sub publisher (Redis, Upstash, Durable Objects, …)   | ✅   | 🟡  | ✅  | `Publisher` service with resume, in memory and in Durable Objects; Redis and Postgres as Effect guides ([publisher-backends](../decisions/publisher-backends.md))                                                   |
| Rate limiting (Redis, Upstash, Cloudflare, …)            | ✅   | 🛑  | 🟡  | `rateLimit()` over Effect's `RateLimiter` (memory and Redis stores), typed `RateLimited`, `RateLimit-*` headers; no Upstash or Cloudflare store ([rate-limit](../decisions/rate-limit-on-effect-ratelimiter.md))    |
| Locking (Redis, Upstash, Durable Objects, …)             | ✅   | 🛑  | ✅  | `experimental_lock()` over the `experimental_Locker` service: memory, Redis (Effect's `Redis`, which can wrap Upstash) and Durable Objects ([locking](../decisions/locking-on-effect-services.md))                  |
| Client plugins and interceptors                          | ✅   | ✅  | ✅  | Links, with typed per-call context and options ([links](../decisions/links.md))                                                                                                                                     |
| TanStack Query integration (React)                       | ✅   | ✅  | ✅  | `@trpc12/tanstack-react-query`; React Server Components via `createTrpcRsc`                                                                                                                                         |
| TanStack Query integration (Vue, Solid, Svelte, Angular) | ✅   | 🟡  | ✅  | `@trpc12/tanstack-{vue,solid,svelte,angular}-query`, plus Preact and Lit; streamed and live queries                                                                                                                 |
| SWR and Pinia Colada integrations                        | ✅   | 🟡  | 🛑  | Not planned: "later or never" ([integration-packages](../decisions/integration-packages.md)); `@trpc12/experimental-react` covers `use()` without TanStack ([react-use-package](../decisions/react-use-package.md)) |
| AI SDK integration                                       | ✅   | 🛑  | ✅  | A tested recipe in `docs/integrations/ai-sdk.md` ([ai-sdk-and-better-auth-recipes](../decisions/ai-sdk-and-better-auth-recipes.md))                                                                                 |
| Next.js Server Actions support                           | ✅   | ✅  | ✅  | `@trpc12/trpc/actions`: `experimental_createAction`, `experimental_createCallable` ([action-state](../decisions/action-state.md))                                                                                   |
| Built-in plugins (CORS, CSRF, Retry, …)                  | ✅   | 🛑  | 🟡  | Effect HTTP middleware (`cors`), `retryLink`, `dedupeLink`, lifecycle middleware; CSRF is the JSON content-type rule                                                                                                |
| Built-in helpers (cookie, encryption, signing, …)        | ✅   | 🛑  | 🛑  | Out of scope (round two); `experimental_connectionToken` signs claims for Durable Objects                                                                                                                           |
| NestJS integration                                       | ✅   | 🟡  | ✅  | `@trpc12/nest`: `@experimental_Implement(contract)`, `experimental_TrpcModule` ([nest-integration](../decisions/nest-integration.md))                                                                               |
| OpenTelemetry integration                                | ✅   | 🛑  | ✅  | Effect's `Tracer` layers; client and server `trpc.<path>` spans share a trace via `traceparent` ([tracing](../decisions/tracing-across-client-and-server.md))                                                       |
| Cloudflare Workers Traces integration                    | ✅   | 🛑  | ✅  | `experimental_workersTracer()`, an Effect `Tracer` on Workers' custom spans ([workers-traces](../decisions/workers-traces-tracer.md))                                                                               |

## Performance

oRPC's table compares oRPC v2 with v11 (and Hono). `pnpm bench` measures the same way with v12 added; method and caveats in [`../notes/benchmarks.md`](../notes/benchmarks.md).

| Metric                                    | oRPC v2           | v11               | v12                 |
| ----------------------------------------- | ----------------- | ----------------- | ------------------- |
| RPC over HTTP (req/s avg)                 | 59,940            | 13,165            | 46,576              |
| Type-check, 3,000 procedures (check time) | 0.70s             | 0.92s             | 0.83s               |
| Type-check, 3,000 procedures (memory)     | 237 MB            | 262 MB            | 322 MB              |
| Client bundle (minified / gzip)           | 27.1 kB / 9.6 kB  | 36.4 kB / 11.8 kB | 86.1 kB / 28.9 kB   |
| Node server bundle (minified / gzip)      | 41.3 kB / 13.2 kB | 53.1 kB / 17.3 kB | 345.0 kB / 110.7 kB |

- v12 beats v11 on throughput and check time, and trails oRPC on every row.
- The floors are Effect's: its `HttpServer` alone does about 69k req/s; its declarations take about 65 MB of the type-check memory; the Effect APIs the client runs on are about 20 kB gzipped, and a one-element `Stream`, which every link returns, is 10.7 kB on its own. CI reports the client's gzip sizes, without ceilings, against the human's targets (18 kB minimal JSON, 25 kB full; [`../notes/benchmarks.md`](../notes/benchmarks.md#budgets)).

Not measured yet: RPC over WebSocket, OpenAPI over HTTP, Clinic profiles.

## The decisions that matter most for parity

Get these right and every other row is incremental work:

1. **Split contract from implementation in the procedure data model** (03, 09). Contract-first, OpenAPI links, NestJS and client-side validation all depend on it.
2. **Put serialization on endpoints, not on the router** (11). One router must be servable by an RPC endpoint (rich serializer) _and_ an OpenAPI endpoint (plain JSON) at the same time.
3. **Keep the protocol and handler transport-agnostic** (10, 12). HTTP, WebSocket and MessagePort share one message model.
4. **Allow per-procedure HTTP routing metadata** (04, 18): `.meta({ route: { method, path, … } })` under the `experimental_openapi()` root extension ([root-extensions](../decisions/root-extensions.md)).

## Beyond the table

oRPC features outside the comparison rows, and v12 features oRPC lacks:

| Feature                                                  | Status                                                                                                                                                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typed client context per call, `DynamicLink`             | done (links declare `context`; `switchLink`, `splitLink`)                                                                                                                                                                                     |
| `createSafeClient`, `isDefinedError`                     | done (`safe()`, `isDefinedError`)                                                                                                                                                                                                             |
| Middleware with typed input, output short-circuit        | done (`t.middleware`, `next({ input })`)                                                                                                                                                                                                      |
| Built-in `onStart/onSuccess/onError/onFinish` middleware | done (`@trpc12/trpc/middleware`)                                                                                                                                                                                                              |
| Leading-middleware dedupe                                | done (`.concat()`; client-side `dedupeLink`)                                                                                                                                                                                                  |
| Smart coercion, reference UI, OpenAPI → contract         | done (`experimental_coerceBySchema`, `experimental_openApiReference()`, `experimental_generateContractFromOpenApi()`)                                                                                                                         |
| Request/response validation on the client                | done (`experimental_validationLink({ contract })`)                                                                                                                                                                                            |
| `.callable()`, `call()`, form actions                    | done (`call()`; `experimental_createAction` takes `FormData` and `useActionState`'s call)                                                                                                                                                     |
| Durable/resumable calls (beyond oRPC)                    | `experimental_durable()` keeps results (streamed outputs as frames) by call id on Effect `BackingPersistence`; `experimental_durableLink` retries with the id and resumes streams mid-stream ([durable-calls](../decisions/durable-calls.md)) |
| React `use()` without TanStack (beyond oRPC)             | `@trpc12/experimental-react` and `@trpc12/experimental-react-atom` ([react-use-package](../decisions/react-use-package.md))                                                                                                                   |
| Migration codemod (beyond oRPC)                          | `@trpc12/upgrade`: `trpc12-upgrade [--write]` rewrites v11 imports and APIs ([v11-codemod](../decisions/v11-codemod.md))                                                                                                                      |

## Maintenance

- When a decision changes a row, update the row in the same commit.
- If a decision would turn a row into 🛑, the agent must stop and ask a human (see `../approach.md`).
- Re-check against `comparison.mdx` when bumping the vendored oRPC version, and re-run `pnpm bench` when the Performance rows could have moved.
