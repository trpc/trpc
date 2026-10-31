# Benchmarks against tRPC v11 and oRPC v2

2026-10-16. How does v12 compare on oRPC v2's comparison "Performance" rows: throughput, type-checking at scale, and bundle size? Asked by the parity answer in [`../decisions/orpc-v2-parity.md`](../decisions/orpc-v2-parity.md).

## Method

`pnpm bench <runtime|typecheck|bundle>` (`next/tooling/bench/bench.ts`). It mirrors [middleapi/orpc-benchmarks](https://github.com/middleapi/orpc-benchmarks), which oRPC's table is built from, so the oRPC and v11 columns can be checked against theirs:

- **runtime:** each server in its own Node process (`tooling/bench/servers/*.ts`), the same 6-procedure router with a pass-through Standard Schema, each returning `{ name, date: new Date(), input }`. Native types are on everywhere: progressive JSON for v12, superjson for v11, oRPC's built-in serializer. autocannon sends the `GET` query each framework's own client would send for `nested.procedure_1('hello world')`: 2 s warm-up, then 10 s on 10 connections. v12 serves with `serve(handler)` on `NodeHttpServer`, v11 with its standalone adapter, oRPC with `RPCHandler` from `@orpc/server/node`.
- **typecheck:** a generated project with 3,000 procedures in 1,501 routers (500 files, each three levels deep), every procedure called through the typed client with its result annotated. `tsc --extendedDiagnostics --singleThreaded`, `skipLibCheck`, median of 3. v12 is checked from its built `.d.ts` (`pnpm build` first), as v11 and oRPC are from theirs.
- **bundle:** a minimal client, a Node server and a fetch handler per framework, bundled with rolldown (tree-shaken, minified, `NODE_ENV=production`), then gzip -9. The v11 client is `httpLink` + `httpSubscriptionLink` + `splitLink` + superjson, as oRPC's measurement has it.

Versions: tRPC v12 at `next/` HEAD, `@trpc/server` 11.19.0, `@orpc/server` 2.0.0-beta.44, TypeScript 7.0.2, Node 24.21.0. Machine: 4-core Intel Xeon VM, 16 GB.

The latest run is `www/benchmarks.json` (2026-10-20, Node 26, TypeScript 7.1), which `--snapshot` writes and the docs' hidden benchmarks page charts ([`benchmarks-page.md`](../decisions/benchmarks-page.md)); the tables below are older.

## Results

Re-run after the `perf(...)` commits that followed the first run (first-run v12 numbers in the last column).

Throughput (`pnpm bench runtime`):

| server   | req/s (avg) | req/s (stdev) | requests | first run |
| -------- | ----------: | ------------: | -------: | --------: |
| tRPC v12 |      46,576 |           802 |  465,768 |    14,505 |
| tRPC v11 |      13,165 |           170 |  131,657 |           |
| oRPC v2  |      59,940 |         1,007 |  659,356 |           |

Type-checking 3,000 procedures (`pnpm bench typecheck`):

|          | check | total | memory | instantiations | first run                      |
| -------- | ----: | ----: | -----: | -------------: | ------------------------------ |
| tRPC v12 | 0.83s | 1.05s | 322 MB |      1,105,592 | 1.16s / 1.39s / 369 MB / 1.52M |
| tRPC v11 | 0.92s | 1.08s | 262 MB |      1,005,015 |                                |
| oRPC v2  | 0.70s | 0.82s | 237 MB |        886,784 |                                |

Bundle size, minified / gzip (`pnpm bench bundle`):

|               |            tRPC v12 |          tRPC v11 |           oRPC v2 | v12 first run       |
| ------------- | ------------------: | ----------------: | ----------------: | ------------------- |
| client        |   86.1 kB / 28.9 kB | 36.4 kB / 11.8 kB |  27.1 kB / 9.6 kB | 104.7 kB / 35.0 kB  |
| Node server   | 345.0 kB / 110.7 kB | 53.1 kB / 17.3 kB | 41.3 kB / 13.2 kB | 344.0 kB / 110.1 kB |
| fetch handler |  216.4 kB / 70.7 kB | 50.6 kB / 16.4 kB | 39.5 kB / 12.6 kB | 215.5 kB / 70.2 kB  |

## Reading

- The oRPC-to-v11 ratios match oRPC's published ones (4.6× throughput here, 4.2× there; type-check total 0.76× here, 0.70× there), so the harness measures the same thing.
- **Throughput:** v12 went from 14.5k to 46.6k req/s: 3.5× v11, 78% of oRPC. What changed:
  - HTTP calls run in the request's fiber, synchronously until a step is async; one context change per call.
  - Spans only with a tracer installed (opt-in, human): the call's span was about 1.2 µs, 41.6k → 46.6k.
  - `?input=` read without `URLSearchParams`; progressive JSON sorts its types once, plain values skip class checks, `Date` via `toISOString`.
  - **The floor is Effect's `HttpServer`:** a bare `HttpRouter` route returning the same JSON does about 69k req/s here. Before spans went opt-in, v12 added about 9 µs per request on top; in-process about 6 µs: the call's span about 1.2 µs, the procedure call about 1.2 µs, `?input=` about 0.7 µs, progressive JSON about 0.5 µs, the rest spread under 0.3 µs each.
  - oRPC at 59.9k is about 17 µs per request in total, v12 now about 21 µs, so matching it would leave v12 about 3 µs over Effect's floor.
- **Type-checking:** v12 now checks faster than v11 (0.83s vs 0.92s) with 10% more instantiations; oRPC is 16% faster. Since then, features have taken v12 to 1,445,822 instantiations and level with v11 (2026-10-19: 1.23s vs 1.19s, 342 MB); bisected in [`type-check-shapes.md`](./type-check-shapes.md), with the cost of each procedure shape. On TypeScript 7.1.0-beta (2026-10-20, what the bench runs on now) the counts are the same and memory and time drop: v12 0.94s / 1.20s / 246 MB / 1,490,786, v11 0.85s / 1.01s / 195 MB, oRPC 0.63s / 0.75s / 174 MB, against v12's 1.13s / 1.38s / 342 MB on 7.0.2 in the same session. What changed:
  - Standard Schema types read from `~standard.types` instead of inferred; `InputDef` spelled out; resolver checks skip moot branches.
  - JSON-safe outputs skip the framing conditionals; link batching read once per chain.
  - **Split:** the client half (3,000 typed calls) checks faster than oRPC's (about 0.41s vs 0.45s). The router half is the gap: 498k instantiations vs 311k, about 166 per procedure vs 104. The resolver checks (unmapped Effect failures, output, `ok()` short-circuits) cost about 40 per procedure and the inferred `Procedure` type about 12; cheaper spellings tried so far (`NoInfer`, pre-filters, nested checks) were all slower.
  - **Memory:** a v12 project with no procedures already takes 100 MB vs oRPC's 35 MB: that's parsing Effect's declarations (188 files).
  - **Effect by subpath:** since 2026-10-20 `tooling/pack/pack.ts` rewrites the built declarations' `effect` root imports to one subpath per module, so a project that doesn't import the root itself parses 139 of Effect's declaration files instead of 190. On 7.1.0-beta, v12 went from 78 to 70 MB with 6 procedures and from 246 to 238 MB with 3,000; instantiations and time are unchanged.
- **Bundle size:** the client went from 35.0 to 30.5 kB gzipped, then 28.9 kB once the Promise client stopped bundling the client span ([Budgets](#budgets)): `sideEffects: false`, and copies of Effect APIs since swapped back for the APIs (33.2 kB, [`effect-apis-over-hand-rolled.md`](../decisions/effect-apis-over-hand-rolled.md)). It's still 3.2× oRPC's: the Effect APIs the client runs on are about 20 kB gzipped on their own (`Effect.runPromise` alone is 7.5 kB), tRPC's own code about 12 kB ([`effect-client-bundle-size.md`](https://github.com/trpc/trpc/blob/d5c34c43000547776ca234ac47edafd48370e6fd/next/.agent-docs/notes/effect-client-bundle-size.md)). Server bundles aren't a goal.
- Clinic profiles and the WebSocket and OpenAPI throughput rows of oRPC's table aren't measured yet.

## Budgets

2026-10-17. The human, on working on bundle size before v1: "A sure, I only care about tree shakability when using core features" ([`../decisions/orpc-v2-parity.md`](../decisions/orpc-v2-parity.md)). `pnpm bench budget` bundles three clients the same way as `bundle` and prints their sizes against the targets; CI's `check` job runs it. Since 2026-10-19 there are no ceilings, so it never fails (the human: "c)", [`../decisions/orpc-v2-parity.md`](../decisions/orpc-v2-parity.md)).

| client                              |    gzip | target |
| ----------------------------------- | ------: | -----: |
| minimal JSON (`httpLink`)           | 43.4 kB |  18 kB |
| full (`retryLink`, `httpLink`, SSE) | 43.6 kB |  25 kB |
| full with progressive JSON          | 48.0 kB |  25 kB |

2026-10-21: the full client is measured without and with progressive JSON, which is opt-in (the human: "3. With and without", [`../decisions/orpc-v2-parity.md`](../decisions/orpc-v2-parity.md)). Progressive JSON adds 4.1 kB. The history below, before that day, is of the full client with it.

The raises below are from when CI failed above a ceiling, today's size plus 0.1 kB; each records what grew the clients.

- **Raised, 2026-10-18:** fixes since the first cut added about 210 B gzipped to each client (minimal, full): streamed responses waiting for a slow client (3ba9cb525, +13 B, +33 B), the closed error union with `matchError()` (9be0d7e07, +90 B, +95 B), `httpLink` reading a JSON page that isn't an error body by its status (ad6d133c0, +26 B, +29 B; this one crossed the ceilings) and sync serializers failing on a nested `File` (6ef675ed1, +85 B, +82 B). They're behaviour the client needs, not bloat, so the ceilings moved to today's sizes plus the same 0.1 kB of room: 25,898 B and 29,304 B measured.

- **Raised again, 2026-10-18:** the human: "reimplementing effect internals seems dumb no matter the reason, so get rid of that, that's the wrong optimisation". The client's copies of `Effect.forEach`, `Stream.toAsyncIterable`, `Stream.toReadableStream` and `Base64` are the Effect APIs again, adding 3,295 B to the minimal client and 3,860 B to the full one (per change in [`effect-apis-over-hand-rolled.md`](../decisions/effect-apis-over-hand-rolled.md)). The ceilings moved to today's sizes plus 0.1 kB: 29,254 B and 33,248 B measured.

- **Raised a third time, 2026-10-18:** `httpLink` batches through `Effect.request` and a `RequestResolver` instead of its own queue and flush, under the same ask: +789 B on the minimal client and +803 B on the full one. The ceilings moved to today's sizes plus 0.1 kB: 30,049 B and 34,026 B measured.

- **Raised a fourth time, 2026-10-18:** the human: "For http link you can probably do some sort of data loader service that is decoupled from http logic. And you can probably use effects primitive for fetch etc". `httpLink` batches through an HTTP-agnostic data loader, sends through `effect/http`'s `HttpClient`, reads lines with `Stream.decodeText` and `Stream.splitLines`, and reconnects SSE with `Effect.repeat`: +9,135 B on the minimal client and +9,304 B on the full one, `HttpClient` 8.0 and 8.2 kB of it (per change in [`http-link-on-effect-http.md`](../decisions/http-link-on-effect-http.md)). The ceilings moved to today's sizes plus 0.1 kB: 39,184 B and 43,330 B measured.

- **Grew, 2026-10-19 (no ceiling):** the JSON and sync serializers walk a value once and return a JSON-safe value as is instead of copying it through `JSON.parse(JSON.stringify())` (f03beb40b, `scan()` in `serializer/framed.ts`): +143 B on the minimal client and +146 B on the full one (39,333 → 39,476 B and 43,460 → 43,606 B, the commit's `framed.ts` swapped in and out on today's `v12`). In exchange, serializing a 50-row list takes 13.8 µs instead of 57.5 µs, and a short string 0.11 µs instead of 0.25 µs.

- **Grew, 2026-10-19 (no ceiling):** `httpLink` fails a call whose streamed response ends before its result with `NETWORK_ERROR` instead of `STREAM_INTERRUPTED` (`headless` in `client/links/http/transport.ts`, [`link-errors.md`](../decisions/link-errors.md)): +36 B on the minimal client and +57 B on the full one (39,512 → 39,548 B and 43,644 → 43,701 B). Reusing the interrupt's message instead of its own saves 10 B.

- **Grew, 2026-10-19 (no ceiling):** the typed client's proxy answers `request()` and `subscribe()` at its root through the untyped client, so an `any` router's `TrpcUntypedClient` type is true at runtime (first-release review, question 7, [`client.md`](../decisions/client.md)): +34 B on the minimal client and +32 B on the full one (39,548 → 39,582 B and 43,701 → 43,733 B).

- **Grew, 2026-10-31 (no ceiling):** `effect` 4.0.2 → 4.1.1 ([`effect-version-range.md`](../decisions/effect-version-range.md)), with no client code changed: +3,404 B on the minimal client, +3,415 B on the full one and +3,661 B with progressive JSON (39,987 → 43,391 B, 40,207 → 43,622 B and 44,310 → 47,971 B, `v12` before and after the bump). Which of Effect's modules grew isn't measured yet.

- **Cut so far:** the Promise client runs its links with `runLinks`. `runOperation`'s tracer check and client span never ran there (Promise clients run on Effect's native tracer), but they were bundled: `Tracer`, `Scope` spans and `encoding/Hex`, 1.7 kB gzipped on each client.
- **The floor of links on Effect**, same bundler and gzip:
  - `Effect.runPromise(Effect.tryPromise(fetch))`: 8.5 kB.
  - The same through a one-element `Stream` (`Stream.fromEffect`, `Stream.runHead`), which is what every link returns: 10.7 kB.
  - Plus a `Queue`: 11.7 kB. Plus the client span: 14.1 kB. `Stream.callback` and `Stream.toAsyncIterable`: 16.4 kB.
  - So the first 10 kB target left no room for tRPC code while links return `Stream`s. The human kept links on Effect and raised it to 18 kB ("B").
- **What's over the floor** in the minimal client, by rendered size before minifying: `Channel` (31 kB vs 4 kB in the floor), `Queue` (24 kB, from `Stream.callback` and batching), `Stream` operators (20 kB vs 3 kB), `Duration` (14 kB, kept by Effect's internals: swapping `Effect.sleep` for a `setTimeout` didn't drop it), then tRPC's `httpLink` (15 kB), streaming deserializers (`transformer/progressive-json/stream.ts` and `framed.ts`, 10 kB) and errors (5 kB).
- **Not cuts:** `Queue` stays while `Stream.callback` does; binary frames and SSE sit behind runtime options of `httpLink`, so they'd need their own imports (an API change) to shake out.
