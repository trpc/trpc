# Benchmarks against tRPC v11 and oRPC v2

2026-10-16. How does v12 compare on oRPC v2's comparison "Performance" rows: throughput, type-checking at scale, and bundle size? Asked by the parity answer in [`../decisions/orpc-v2-parity.md`](../decisions/orpc-v2-parity.md).

## Method

`pnpm bench <runtime|typecheck|bundle>` (`next/tooling/bench/bench.ts`). It mirrors [middleapi/orpc-benchmarks](https://github.com/middleapi/orpc-benchmarks), which oRPC's table is built from, so the oRPC and v11 columns can be checked against theirs:

- **runtime:** each server in its own Node process (`tooling/bench/servers/*.ts`), the same 6-procedure router with a pass-through Standard Schema, each returning `{ name, date: new Date(), input }`. Native types are on everywhere: danSON for v12, superjson for v11, oRPC's built-in serializer. autocannon sends the `GET` query each framework's own client would send for `nested.procedure_1('hello world')`: 2 s warm-up, then 10 s on 10 connections. v12 serves with `serve(handler)` on `NodeHttpServer`, v11 with its standalone adapter, oRPC with `RPCHandler` from `@orpc/server/node`.
- **typecheck:** a generated project with 3,000 procedures in 1,501 routers (500 files, each three levels deep), every procedure called through the typed client with its result annotated. `tsc --extendedDiagnostics --singleThreaded`, `skipLibCheck`, median of 3. v12 is checked from its built `.d.ts` (`pnpm build` first), as v11 and oRPC are from theirs.
- **bundle:** a minimal client, a Node server and a fetch handler per framework, bundled with rolldown (tree-shaken, minified, `NODE_ENV=production`), then gzip -9. The v11 client is `httpLink` + `httpSubscriptionLink` + `splitLink` + superjson, as oRPC's measurement has it.

Versions: tRPC v12 at `next/` HEAD, `@trpc/server` 11.19.0, `@orpc/server` 2.0.0-beta.44, TypeScript 7.0.2, Node 24.21.0. Machine: 4-core Intel Xeon VM, 16 GB.

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
  - `?input=` read without `URLSearchParams`; danSON sorts serializers once, plain values skip class checks, `Date` via `toISOString`.
  - **The floor is Effect's `HttpServer`:** a bare `HttpRouter` route returning the same JSON does about 69k req/s here. Before spans went opt-in, v12 added about 9 µs per request on top; in-process about 6 µs: the call's span about 1.2 µs, the procedure call about 1.2 µs, `?input=` about 0.7 µs, danSON about 0.5 µs, the rest spread under 0.3 µs each.
  - oRPC at 59.9k is about 17 µs per request in total, v12 now about 21 µs, so matching it would leave v12 about 3 µs over Effect's floor.
- **Type-checking:** v12 now checks faster than v11 (0.83s vs 0.92s) with 10% more instantiations; oRPC is 16% faster. What changed:
  - Standard Schema types read from `~standard.types` instead of inferred; `InputDef` spelled out; resolver checks skip moot branches.
  - JSON-safe outputs skip the framing conditionals; link batching read once per chain.
  - **Split:** the client half (3,000 typed calls) checks faster than oRPC's (about 0.41s vs 0.45s). The router half is the gap: 498k instantiations vs 311k, about 166 per procedure vs 104. The resolver checks (unmapped Effect failures, output, `ok()` short-circuits) cost about 40 per procedure and the inferred `Procedure` type about 12; cheaper spellings tried so far (`NoInfer`, pre-filters, nested checks) were all slower.
  - **Memory:** a v12 project with no procedures already takes 100 MB vs oRPC's 35 MB: that's parsing Effect's declarations (188 files). Importing Effect by subpath would save about 12 MB.
- **Bundle size:** the client went from 35.0 to 30.5 kB gzipped, then 28.9 kB once the Promise client stopped bundling the client span ([Budgets](#budgets)): `sideEffects: false`, base64 with `btoa`/`atob`, trace headers and the client span without `effect/http`, lean sequential `forEach` and stream-to-iterable helpers. It's still 3.2× oRPC's: the Effect APIs the client runs on are about 20 kB gzipped on their own (`Effect.runPromise` alone is 7.5 kB), tRPC's own code about 12 kB ([`effect-client-bundle-size.md`](./effect-client-bundle-size.md)). Server bundles aren't a goal.
- Clinic profiles and the WebSocket and OpenAPI throughput rows of oRPC's table aren't measured yet.

## Budgets

2026-10-17. The human, on working on bundle size before v1: "A sure, I only care about tree shakability when using core features" ([`../decisions/orpc-v2-parity.md`](../decisions/orpc-v2-parity.md)). `pnpm bench budget` bundles two clients the same way as `bundle` and fails above each one's ceiling; CI runs it.

| client                                      |    gzip | ceiling (CI) | target |
| ------------------------------------------- | ------: | -----------: | -----: |
| minimal JSON (`httpLink`)                   | 25.7 kB |      25.8 kB |  18 kB |
| full (`retryLink`, `httpLink`, danSON, SSE) | 29.1 kB |      29.2 kB |  25 kB |

- **Cut so far:** the Promise client runs its links with `runLinks`. `runOperation`'s tracer check and client span never ran there (Promise clients run on Effect's native tracer), but they were bundled: `Tracer`, `Scope` spans and `encoding/Hex`, 1.7 kB gzipped on each client.
- **The floor of links on Effect**, same bundler and gzip:
  - `Effect.runPromise(Effect.tryPromise(fetch))`: 8.5 kB.
  - The same through a one-element `Stream` (`Stream.fromEffect`, `Stream.runHead`), which is what every link returns: 10.7 kB.
  - Plus a `Queue`: 11.7 kB. Plus the client span: 14.1 kB. `Stream.callback` and `Stream.toAsyncIterable`: 16.4 kB.
  - So the first 10 kB target left no room for tRPC code while links return `Stream`s. The human kept links on Effect and raised it to 18 kB ("B").
- **What's over the floor** in the minimal client, by rendered size before minifying: `Channel` (31 kB vs 4 kB in the floor), `Queue` (24 kB, from `Stream.callback` and batching), `Stream` operators (20 kB vs 3 kB), `Duration` (14 kB, kept by Effect's internals: swapping `Effect.sleep` for a `setTimeout` didn't drop it), then tRPC's `httpLink` (15 kB), streaming deserializers (`serializer/stream.ts` and `framed.ts`, 10 kB) and errors (5 kB).
- **Not cuts:** `Queue` stays while `Stream.callback` does; binary frames and SSE sit behind runtime options of `httpLink`, so they'd need their own imports (an API change) to shake out.
