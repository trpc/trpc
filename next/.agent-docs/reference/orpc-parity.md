# oRPC parity matrix

**Goal from `ideas.md`:** feature parity with [orpc.dev/docs/comparison](https://orpc.dev/docs/comparison). Any API decision that could stop us from getting there must be flagged and confirmed by Alex before it is accepted.

Source: `.repos/orpc/apps/content/docs/comparison.md` (oRPC `v1.15.5`). The oRPC and tRPC columns are copied from that table. The tRPC column is oRPC's assessment of v11 and may lag behind recent v11 work.

Legend: ✅ first-class · 🟡 partial / third-party · 🛑 not supported. **Risk** marks the decisions that could block us.

## The comparison table

| Feature                                   | oRPC | tRPC v11 | vNext plan                                                            | Proposals  | Risk: decisions that would block it                                                            |
| ----------------------------------------- | ---- | -------- | --------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| End-to-end typesafe input/output          | ✅   | ✅       | Keep                                                                  | 04, 05     | —                                                                                              |
| End-to-end typesafe errors                | ✅   | 🟡¹      | Returned/inferred errors + optional declared map, narrowing on client | 07, 16     | Having only formatter-style errors without client narrowing helpers (`isDefinedError`, `safe`) |
| End-to-end typesafe File/Blob             | ✅   | 🟡       | `File`/`Blob` anywhere in input; binary responses                     | 11         | A JSON-only serializer or transport; files limited to top-level `FormData` inputs (as in v11)  |
| End-to-end typesafe streaming             | ✅   | ✅       | Keep (async iterables / Effect `Stream`)                              | 14         | —                                                                                              |
| TanStack Query integration (React)        | ✅   | ✅       | Keep                                                                  | 19         | —                                                                                              |
| TanStack Query integration (Vue)          | ✅   | 🛑       | Framework-agnostic options/keys utilities                             | 19         | A React-only integration built on hooks and providers                                          |
| TanStack Query integration (Solid)        | ✅   | 🛑       | Same as Vue                                                           | 19         | Same as Vue                                                                                    |
| TanStack Query integration (Svelte)       | ✅   | 🛑       | Same as Vue                                                           | 19         | Same as Vue                                                                                    |
| TanStack Query integration (Angular)      | ✅   | 🛑       | Same as Vue                                                           | 19         | Same as Vue                                                                                    |
| Vue Pinia Colada integration              | ✅   | 🛑       | Small package after TanStack Query                                    | 19         | —                                                                                              |
| With contract-first approach              | ✅   | 🛑       | Contract builder + `implement()`                                      | 03, 09     | **A data model where a procedure cannot exist without a handler**                              |
| Without contract-first approach           | ✅   | ✅       | Keep (default)                                                        | 03         | —                                                                                              |
| OpenAPI support                           | ✅   | 🟡       | OpenAPI handler + spec generation from the same router                | 10, 11, 18 | **Router-level (global) transformer**; procedures that cannot declare HTTP method/path         |
| OpenAPI support for multiple schema libs  | ✅   | 🛑       | Standard JSON Schema (`~standard.jsonSchema`), Effect Schema natively | 05, 18     | Hard-coding one validator library                                                              |
| OpenAPI bracket notation                  | ✅   | 🛑       | Supported by the OpenAPI handler and link                             | 18         | —                                                                                              |
| Server Actions support                    | ✅   | ✅²      | `action(procedure)` wrapper                                           | 15         | —                                                                                              |
| Lazy router                               | ✅   | ✅       | Keep                                                                  | 08         | OpenAPI + lazy routers need a prefix or a contract to route without loading                    |
| Native types (Date, URL, Set, Map, …)     | ✅   | 🟡       | Built-in danSON-based serializer by default                           | 11         | No default rich serializer (requiring superjson)                                               |
| Streaming response (SSE)                  | ✅   | ✅       | Keep                                                                  | 14         | —                                                                                              |
| Standard Schema (Zod, Valibot, ArkType…)  | ✅   | ✅       | Standard Schema only (+ Effect Schema)                                | 05         | —                                                                                              |
| Built-in plugins (CORS, CSRF, Retry, …)   | ✅   | 🛑       | First-party server plugins and client links                           | 13, 17     | —                                                                                              |
| Batch requests                            | ✅   | ✅       | Keep (opt-in, streamed)                                               | 10, 13, 17 | —                                                                                              |
| WebSockets                                | ✅   | ✅       | Keep                                                                  | 12, 14     | —                                                                                              |
| Cloudflare WebSocket hibernation          | ✅   | 🛑       | Stateless WebSocket message handling                                  | 12, 14     | A WebSocket server that keeps subscription state only in process memory                        |
| Nest.js integration                       | ✅   | 🟡       | Later, built on contracts                                             | 09         | No contract-first                                                                              |
| Message Port (Electron, browser, workers) | ✅   | 🟡       | Transport-agnostic handler with a message-port adapter                | 10, 12     | **A protocol or handler that assumes HTTP**                                                    |

¹ v11 recently gained per-procedure `.errors()` formatters ([#7591](https://github.com/trpc/trpc/pull/7591)) and `safe()` on the client. oRPC's table predates this.
² Experimental (`experimental_caller`, `experimental_nextAppDirCaller`).

## Status in the v12 build (`next/`)

What the packages ship today, each row covered by integration tests with real clients. Unreviewed calls are the `(agent)` decisions: `pnpm decisions --who agent`.

| Row                                                              | Status | Where                                                                                                                                                                                            |
| ---------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| End-to-end typesafe input/output                                 | ✅     | Standard Schema and Effect Schema inputs and outputs; `test/integration/basics.test.ts`                                                                                                          |
| End-to-end typesafe errors                                       | ✅     | Errors are inferred from returns and Effect failures; `.errors()` is optional; `safe()`, `isDefinedError`, `catchTag` on `_tag` ([inferred-errors](../decisions/inferred-errors.md))             |
| End-to-end typesafe File/Blob                                    | ✅     | `File`/`Blob` at any depth through danSON; raw file responses ([files](../decisions/files.md))                                                                                                   |
| End-to-end typesafe streaming                                    | ✅     | Async generators and Effect `Stream`s, validated with `stream(Item, Return?)`                                                                                                                    |
| TanStack Query (React, Vue, Solid, Svelte, Angular, Preact, Lit) | ✅     | `@trpcdev/tanstack-query` plus `@trpcdev/tanstack-{react,vue,solid,svelte,angular,preact,lit}-query` (`createTrpcContext`, subscriptions); React Server Components via `createTrpcRsc`           |
| Streamed and live TanStack queries                               | ✅     | `streamedOptions`, `liveOptions`, `streamedMutationOptions({ abortWhenUnobserved })`                                                                                                             |
| Vue Pinia Colada integration                                     | 🛑     | Not built                                                                                                                                                                                        |
| With contract-first approach                                     | ✅     | `trpcdev/contract` + `t.implement(contract)`                                                                                                                                                     |
| OpenAPI support                                                  | ✅     | `trpcdev/openapi`: `createOpenApiHandler`, `generateOpenApi`, `.route()`, `openApiLink`; `trpcdev/openapi/typescript`: `generateOpenApiFromTypes` for inferred errors and schema-less procedures |
| OpenAPI support for multiple schema libs                         | ✅     | Standard JSON Schema (`~standard.jsonSchema`) and Effect Schema                                                                                                                                  |
| OpenAPI bracket notation                                         | ✅     | `parseBracketNotation`, `toBracketNotation` in the handler and `openApiLink`                                                                                                                     |
| OpenAPI reference UI (Scalar/Swagger)                            | ✅     | `openApiReference()` Effect HTTP middleware                                                                                                                                                      |
| Smart coercion for OpenAPI inputs                                | ✅     | `coerceBySchema` for query strings, forms and path params                                                                                                                                        |
| OpenAPI → contract (Hey API plugin)                              | 🛑     | Not built                                                                                                                                                                                        |
| Server Actions support                                           | ✅     | `trpcdev/actions`: `createAction`, `createCallable`                                                                                                                                              |
| Lazy router                                                      | ✅     | `lazy()`, `loadRouter()`                                                                                                                                                                         |
| Native types (Date, URL, Set, Map, …)                            | ✅     | danSON by default; replaceable serializers with JSON-form client types ([replaceable-serializers](../decisions/replaceable-serializers.md))                                                      |
| Streaming response (SSE)                                         | ✅     | Fetch-streamed SSE subscriptions with `tracked()` resume                                                                                                                                         |
| Standard Schema                                                  | ✅     | Zod, Valibot, ArkType through Standard Schema                                                                                                                                                    |
| Built-in plugins (CORS, CSRF, Retry, …)                          | 🟡     | Effect HTTP middleware (`cors`), `retryLink`, `dedupeLink`, lifecycle middleware; CSRF is the JSON content-type rule                                                                             |
| Batch requests                                                   | ✅     | Opt-in streamed batching (`batch: true`)                                                                                                                                                         |
| WebSockets                                                       | ✅     | `wsLink` + `handler.websocket(ws)`; `trpcdev/http` upgrades on Effect's `HttpServer`                                                                                                             |
| Cloudflare WebSocket hibernation                                 | ✅     | `trpcdev/cloudflare`: `createHibernatingWebSockets`, `hibernatingPublisher` ([cloudflare-hibernation](../decisions/cloudflare-hibernation.md))                                                   |
| Publisher helpers (memory, Redis, Durable Objects, resume)       | ✅     | `Publisher` service, `makeMemoryPublisher`, recipes for Redis and Postgres, `hibernatingPublisher`                                                                                               |
| Message Port (Electron, browser, workers)                        | ✅     | `messagePortLink` + `handler.messagePort(port)`                                                                                                                                                  |
| Nest.js integration                                              | 🛑     | Not built; contracts are the base it would use                                                                                                                                                   |
| Leading-middleware dedupe                                        | 🟡     | Client-side `dedupeLink`; no server middleware dedupe                                                                                                                                            |
| Request/response validation on the client                        | 🛑     | Not built                                                                                                                                                                                        |
| OpenTelemetry, logging integrations                              | 🛑     | Not built                                                                                                                                                                                        |
| Rate limit helpers                                               | 🛑     | Not built                                                                                                                                                                                        |

## The decisions that matter most for parity

These are the bold rows above. Get them right and every other row is incremental work:

1. **Split contract from implementation in the procedure data model** (03, 09). Contract-first, OpenAPI links, NestJS and client-side validation all depend on it.
2. **Put serialization on endpoints, not on the router** (11). One router must be servable by an RPC endpoint (rich serializer) _and_ an OpenAPI endpoint (plain JSON) at the same time.
3. **Keep the protocol and handler transport-agnostic** (10, 12). HTTP, WebSocket and MessagePort share one message model.
4. **Allow per-procedure HTTP routing metadata** (04, 18): `.route({ method, path, … })`.

## oRPC features outside the table

oRPC ships these beyond the comparison rows. They are not parity requirements, but each one should be considered:

| Feature                                                         | oRPC location                                              | Suggested priority           | Proposal |
| --------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------- | -------- |
| Typed client context per call (`ClientContext`)                 | `client/rpc-link.md`                                       | v1                           | 16, 17   |
| `DynamicLink` (choose a link per call)                          | `client/dynamic-link.md`                                   | v1 (≈ `splitLink`)           | 17       |
| `createSafeClient`, `isDefinedError`                            | `client/error-handling.md`                                 | v1                           | 07, 16   |
| Middleware with typed input / `mapInput`, output short-circuit  | `middleware.md`                                            | v1                           | 06       |
| Built-in `onStart/onSuccess/onError/onFinish` middleware        | `middleware.md`                                            | v1                           | 06       |
| Leading-middleware dedupe                                       | `best-practices/dedupe-middleware.md`                      | maybe                        | 06       |
| `eventIterator(schema)` validation, `withEventMeta`             | `event-iterator.md`                                        | v1                           | 14       |
| Publisher helpers (memory, Redis, durable objects, with resume) | `helpers/publisher.md`, `integrations/durable-iterator.md` | later                        | 14       |
| Streamed and live TanStack queries                              | `integrations/tanstack-query.md`                           | v1                           | 19       |
| OpenTelemetry, Pino, Sentry integrations                        | `integrations/*`                                           | later (Effect tracing helps) | 02, 13   |
| Rate limit helpers                                              | `helpers/ratelimit.md`                                     | later                        | 13       |
| Cookie, signing, encryption helpers                             | `helpers/*`                                                | no (out of scope)            | —        |
| Smart coercion for OpenAPI inputs                               | `openapi/plugins/smart-coercion.md`                        | v1 with OpenAPI              | 18       |
| OpenAPI reference UI (Scalar/Swagger)                           | `openapi/plugins/openapi-reference.md`                     | v1 with OpenAPI              | 18       |
| OpenAPI → contract (Hey API plugin)                             | `openapi/openapi-to-contract.md`                           | later                        | 09, 18   |
| Request/response validation on the client (with contract)       | `plugins/request-validation.md`, `response-validation.md`  | later                        | 13, 17   |
| `.callable()` procedures, `call()` helper                       | `client/server-side.md`                                    | v1                           | 15       |
| `createFormAction`, `useServerAction`, optimistic actions       | `server-action.md`                                         | v1 / later                   | 15, 20   |
| AI SDK and Better Auth integrations                             | `integrations/*`                                           | later (docs/recipes)         | —        |

## Maintenance

- When a proposal's decision changes a row's plan, update the row in the same commit.
- If a decision would turn a row's plan into 🛑, the agent must stop and ask Alex (see `../approach.md`).
- Re-check against the upstream comparison page when bumping the vendored oRPC version.
