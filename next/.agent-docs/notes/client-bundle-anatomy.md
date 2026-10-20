# Client bundle anatomy: where the minimal client's 39 kB goes

- **Date:** 2026-10-19
- **Question:** Why is the minimal client (`createTrpcClient` with `httpLink`) 39.2 kB gzipped when v11's is 11.8 kB and oRPC's 9.6 kB? Which modules does it bundle, and through which imports? What is the Effect floor for what the link does? What would splitting `httpLink` save? Human, 2026-10-19: "can you do some research and compare v11/orpc etc on what is taking so much fucking code? i know the floor of effect is quite small and Effect should HELP to write more strict code that doesn't take many bytes / feels like there's a bunch of accidental imports that aren't needed or maybe that the standard http link is just too big and need splitting up / don't action more than potential spikes etc".
- **Feeds:** [`orpc-v2-parity.md`](../decisions/orpc-v2-parity.md) (budgets), [`http-link-on-effect-http.md`](../decisions/http-link-on-effect-http.md), [`effect-apis-over-hand-rolled.md`](../decisions/effect-apis-over-hand-rolled.md), [`benchmarks.md`](./benchmarks.md#budgets). Follows [`effect-client-bundle-size.md`](./effect-client-bundle-size.md).
- **Code:** [`next/spikes/client-bundle/`](../../spikes/client-bundle/), run from `next/spikes`:
  - `node client-bundle/anatomy.ts <fixture> [--top n] [--json out] [--cuts a,b]`: per-module gzip share and the import chain that keeps each module.
  - `node client-bundle/floor.ts`: the Effect floor, one API at a time (`floor/steps.ts`).
  - `node client-bundle/cuts.ts [fixture]`: what each cut saves, alone and stacked, and what each feature costs on top of all of them.
- **Measured at:** `04bc573dd`. Nothing shipped changed.

## Method

- **Bundler:** the budget's own: `rolldown@1.2.13`, ESM, `platform: 'browser'`, tree-shaken, minified, `NODE_ENV=production`, gzip level 9; kB = 1000 bytes. `effect@4.0.2`, `@trpc/client@11.19.0`, `@orpc/client@2.0.0-beta.44`.
- **Per-module shares:** the bundle is built twice. The minified build gives the real total. Each module's rendered (tree-shaken) code from the unminified build is then minified on its own, and the total gzip is split in proportion to those sizes. Shares are estimates; they add up to the real total.
- **Cuts:** `patches.ts` patches the shipped sources as rolldown loads them, with exact string replacements that fail when the source drifts. Each cut stands in for a feature moving behind its own import. The raw-`fetch` cut keeps the transport's shape (`Reply`, scoped abort through `Scope.addFinalizer`, `Stream.fromReadableStream` bodies) and drops only `effect/http`.
- **Since:** SSE and batching are imports now (`sse()`, `batching()`, [`one-http-link.md`](../decisions/one-http-link.md)), so `patches.ts` has no `sse` or `batch` cut left. The tables below were measured before that.
- **Floor:** `floor/steps.ts` exports one function per Effect API the client uses. `floor.ts` bundles exports 0..n together, so each row adds one API to the ones before.

## Results

### Today's sizes, same bundler and day

| client                                                         |      min |    gzip |
| -------------------------------------------------------------- | -------: | ------: |
| v12 `createTrpcClient`, no links                               |  49.7 kB | 16.9 kB |
| v12 minimal (`httpLink`, JSON)                                 | 118.3 kB | 39.2 kB |
| v12 full (`retryLink`, `httpLink`, danSON)                     | 130.4 kB | 43.3 kB |
| v12 bench client (`httpLink`, danSON)                          | 129.8 kB | 43.1 kB |
| v11 `httpLink` only                                            |  15.1 kB |  5.3 kB |
| v11 bench (`splitLink`, SSE, `httpLink`, superjson)            |  36.4 kB | 11.8 kB |
| v11 like for like (`httpBatchStreamLink`, SSE, no transformer) |  28.6 kB |  9.4 kB |
| oRPC `RPCLink`                                                 |  27.1 kB |  9.6 kB |
| oRPC `RPCLink` + `BatchLinkPlugin` + `RetryLinkPlugin`         |  45.2 kB | 14.5 kB |

`pnpm bench bundle` and `pnpm bench budget` give the same numbers as on 2026-10-18 (43.1 / 11.8 / 9.6; 39.2 and 43.3).

### The minimal client by area

Effect 32.7 kB, tRPC 6.5 kB. Of Effect's share, `effect/http` and what only it keeps alive (`Cookies`, `Layer`, `encoding/Hex`, `UrlParams`, `Redacted` and others) is about 7.6 kB, measured as a cut.

Top modules (gzip share):

| module                                | gzip | kept by                                                            |
| ------------------------------------- | ---: | ------------------------------------------------------------------ |
| effect `internal/effect`              | 9.78 | everything; 5.05 once every cut below is applied                   |
| effect `Channel`                      | 2.07 | `Stream`                                                           |
| tRPC `client/links/http/transport.ts` | 1.75 |                                                                    |
| effect `internal/core`                | 1.70 | the runtime                                                        |
| effect `Queue`                        | 1.30 | `Stream.callback` (SSE), `Stream.fromQueue` (batch, framed)        |
| effect `http/HttpClient`              | 1.23 | `transport.ts`                                                     |
| effect `Duration`                     | 1.21 | `Stream.toAsyncIterable`, `HttpClient`, `Schedule`, `Effect.sleep` |
| effect `Stream`                       | 1.20 | links                                                              |
| effect `Context`                      | 0.89 | the runtime                                                        |
| effect `Formatter`                    | 0.77 | `Cause`, `Inspectable`, `HttpBody`                                 |
| tRPC `serializer/danson/stream.ts`    | 0.76 | `jsonSerializer` (`framed.ts`) via `danson/index.ts`               |
| tRPC `serializer/framed.ts`           | 0.75 | `httpLink`'s default `jsonSerializer`                              |
| effect `Equal`                        | 0.72 | the runtime                                                        |
| effect `Layer`                        | 0.61 | `FetchHttpClient.layer`                                            |
| effect `http/Cookies`                 | 0.60 | `HttpClient`, `HttpClientResponse`                                 |
| tRPC `internal/error.ts`              | 0.57 | everything                                                         |
| effect `internal/request`             | 0.54 | `Effect.request` (batching)                                        |
| effect `HttpClientRequest`            | 0.54 | `transport.ts`                                                     |
| effect `HttpClientResponse`           | 0.47 | `transport.ts`                                                     |
| tRPC `client/links/http/sse.ts`       | 0.45 | `httpLink`                                                         |
| effect `http/Headers`                 | 0.45 | `effect/http`                                                      |
| effect `Schedule`                     | 0.41 | `HttpClient`, `Stream`, `Effect.repeat`                            |
| effect `HttpClientError`              | 0.40 | `transport.ts`                                                     |
| effect `encoding/Hex`                 | 0.39 | `Tracer`, for `HttpClient`'s spans (turned off at runtime)         |

### What isn't there

- No `Schema`, no handler or router code, no OpenAPI.
- No module-level side effects: `import '@trpc12/trpc/client'` bundles 0 bytes and `routerType` alone 0.1 kB. The `effect` and `client/index.ts` barrels render nothing themselves.
- `runOperation`'s client span: the Promise client calls `runLinks` and doesn't bundle it. `HttpTraceContext` and `Hex` come in through `HttpClient`'s own tracing, which the link turns off with `TracerDisabledWhen` at runtime.

### Accidental imports

None of these is a barrel or a side effect. Each is code reachable from what the minimal client calls:

- **Feature flags, not imports.** `httpLink` builds `makeTransport`, `makeBatcher` and `makeSubscriptions` whatever its options say. Batching, SSE, binary frames and streamed outputs ship to a client that never turns them on.
- **`jsonSerializer` holds the server's encoder.** A serializer is one object for both sides, so `serializeDeferred` (the handler's encoder for deferred values) and `deserializeStream` (with `Deferred`, `Queue` and danSON's `deferredChunks` and `deferredBuilders`) ship in every client. Importing `jsonSerializer` alone bundles 22.4 kB.
- **`subscribe()` in the core client.** `createUntypedClient` always holds `subscribe`, which calls `Stream.toAsyncIterable`. That reports close failures through `Effect.logError`, which brings the logger and `Duration`. It costs 3.9 kB on the bare client (16.9 to 13.0 kB without it) and 2.1 kB on the minimal one.
- **`effect/http` for one `fetch`.** The transport uses `HttpClient` for building requests, `withScope` aborts and response bodies, and works around it for the rest: it catches the web `Response` in a `fetch` wrapper, passes `init` as a service and turns off its tracing. The client bundles `Cookies`, `UrlParams`, `Layer`, `Hex`, `Redacted` and `HttpClientError` for that.

### The Effect floor (`floor.ts`)

Cumulative; each row adds one API:

| step                                                         |    gzip | adds |
| ------------------------------------------------------------ | ------: | ---: |
| `Effect.runPromiseExit(Effect.tryPromise(fetch))`            |  8.4 kB |      |
| + links as `Stream`s (`suspend`, `catch`, `runHead`)         | 11.1 kB | +2.6 |
| + `Stream.toAsyncIterable` (subscribe)                       | 15.4 kB | +4.3 |
| + `Stream.callback` / `Queue` (SSE producer)                 | 17.3 kB | +1.9 |
| + `Effect.repeat` / `Effect.sleep` (SSE reconnect)           | 18.3 kB | +0.9 |
| + `Effect.request` / `RequestResolver` (batching)            | 19.2 kB | +0.9 |
| + `fromReadableStream` / `decodeText` / `splitLines` (JSONL) | 20.1 kB | +0.8 |
| + `Deferred` / `forkDetach` / `fromQueue` (streamed outputs) | 20.5 kB | +0.4 |
| + `Tracer` / `HttpTraceContext` / `Stream.withSpan`          | 23.0 kB | +2.5 |
| + `effect/http` `HttpClient` + `FetchHttpClient`             | 30.4 kB | +7.3 |

Alone on top of links as `Stream`s (11.1 kB): `toAsyncIterable` +4.3, tracing +4.6, `Stream.callback` +2.1, `Effect.repeat` +2.7, `Effect.request` +2.6, `Deferred` and `fromQueue` +1.9, JSONL lines +1.0, `HttpClient` +12.6. The APIs share most of their code (`Channel`, `Queue`, `Schedule`, `Fiber`), so the first one used pays for the shared part.

Every Effect API the minimal client uses, without `effect/http` and without tRPC's code: 20.5 kB. With `effect/http`: 30.4 kB, against 32.7 kB of Effect in the shipped client.

### Cuts on the minimal client (`cuts.ts`)

| cut                                                        | alone | stacked (in order) |
| ---------------------------------------------------------- | ----: | -----------------: |
| `sse`: SSE subscriptions behind their own import           |  −1.6 |                    |
| `batch`: the data loader behind its own import             |  −1.5 |     36.1 kB (both) |
| `frames`: binary frames behind their own import            |  −0.5 |                    |
| `streamed`: streamed single-call outputs (JSONL, resume)   |  −0.3 |     34.4 kB (both) |
| `json`: `jsonSerializer` without deferred values           |  −1.8 |            29.5 kB |
| `iterable`: `subscribe()` without `Stream.toAsyncIterable` |  −2.1 |            27.6 kB |
| `fetch`: raw `fetch` instead of `HttpClient`               |  −7.6 |        **16.3 kB** |

Each feature put back on top of all seven cuts (16.3 kB), which is what it would cost as an opt-in import: `sse` +7.3, `batch` +7.5, `streamed` +5.3, `json` deferred values +6.7, `iterable` +3.9, `fetch` (`HttpClient`) +11.3, `frames` +0 (only reachable from streamed outputs and batches). These overlap: the first streaming feature brings about 5 kB of shared `Channel`, `Queue`, `Schedule` and `Deferred`, and the rest cost 1–2 kB each after it.

What the 16.3 kB holds: Effect 13.0 kB (the runtime and `Stream` core, 1.9 kB over the 11.1 kB floor) and tRPC 3.3 kB.

The same cuts on the full client (43.3 kB) stack to 28.2 kB; raw `fetch` alone is −7.6 kB there too. `retryLink` and danSON already bring the streaming core, so the features' own cuts save less (`sse` −1.5, `batch` −1.4, `iterable` −2.0).

### Structure next to v11 and oRPC

- **v11:** one small `Observable` (0.7 kB) and a link per transport: `httpLink`, `httpBatchLink`, `httpBatchStreamLink` and `httpSubscriptionLink`, over shared `httpUtils`. A client bundles only the links it imports. v11 has its own accidents: a `wsLink` chunk (0.8 kB) rides along with `httpLink`, and `httpBatchStreamLink`'s JSONL decoder lives in `@trpc/server`'s `resolveResponse` chunk (3.2 kB).
- **oRPC:** one `RPCLink` over `@standard-server/*`, Promises and hand-written async iterators. Event iterators (SSE, `last-event-id`) and files are always in (9.6 kB). Batching, retry, dedupe, timeouts and compression are plugins in `@orpc/client/plugins`, imported one by one (+4.9 kB for batch and retry).
- **v12:** one `httpLink` with every feature behind a runtime option, on `Stream` and `effect/http`, and a core client that holds `subscribe()`.

## Conclusions

- The size is not accidental imports in the barrel sense: tree-shaking works, there are no side effects, and neither `Schema` nor server code comes along. It is code that is reachable but never needed: features behind options instead of imports, a serializer object that carries the server's encoder, `subscribe()` in the core, and `effect/http`.
- The Effect floor for a query-only link is 11.1 kB, and with every feature `httpLink` has, 20.5 kB. `effect/http` alone adds 7.3–11.3 kB, more than all of `httpLink`'s features together.
- All seven cuts reach 16.3 kB, under the 18 kB target, with Effect still the runtime. Two of them (raw `fetch`, and `subscribe()` without `Stream.toAsyncIterable`) go against human-asked decisions: [`http-link-on-effect-http.md`](../decisions/http-link-on-effect-http.md) and [`effect-apis-over-hand-rolled.md`](../decisions/effect-apis-over-hand-rolled.md). The `iterable` cut can instead move `Stream.toAsyncIterable` behind the subscriptions import, which saves the same on clients without subscriptions and keeps Effect's API.
- Splitting `httpLink` pays most when all the splits land together. On its own, SSE out of the link saves 1.6 kB and batching 1.5 kB, because the shared streaming core stays for the rest.
- Ranked recommendations with costs are in the store report (`docs/client-bundle-research.md`).
