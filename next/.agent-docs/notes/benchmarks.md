# Benchmarks against tRPC v11 and oRPC v2

2026-10-16. How does v12 compare on oRPC v2's comparison "Performance" rows: throughput, type-checking at scale, and bundle size? Asked by the parity answer in [`../decisions/orpc-v2-parity.md`](../decisions/orpc-v2-parity.md).

## Method

`pnpm bench <runtime|typecheck|bundle>` (`next/tooling/bench/bench.ts`). It mirrors [middleapi/orpc-benchmarks](https://github.com/middleapi/orpc-benchmarks), which oRPC's table is built from, so the oRPC and v11 columns can be checked against theirs:

- **runtime:** each server in its own Node process (`tooling/bench/servers/*.ts`), the same 6-procedure router with a pass-through Standard Schema, each returning `{ name, date: new Date(), input }`. Native types are on everywhere: danSON for v12, superjson for v11, oRPC's built-in serializer. autocannon sends the `GET` query each framework's own client would send for `nested.procedure_1('hello world')`: 2 s warm-up, then 10 s on 10 connections. v12 serves with `serve(handler)` on `NodeHttpServer`, v11 with its standalone adapter, oRPC with `RPCHandler` from `@orpc/server/node`.
- **typecheck:** a generated project with 3,000 procedures in 1,501 routers (500 files, each three levels deep), every procedure called through the typed client with its result annotated. `tsc --extendedDiagnostics --singleThreaded`, `skipLibCheck`, median of 3. v12 is checked from its built `.d.ts` (`pnpm build` first), as v11 and oRPC are from theirs.
- **bundle:** a minimal client, a Node server and a fetch handler per framework, bundled with rolldown (tree-shaken, minified, `NODE_ENV=production`), then gzip -9. The v11 client is `httpLink` + `httpSubscriptionLink` + `splitLink` + superjson, as oRPC's measurement has it.

Versions: tRPC v12 at `next/` HEAD, `@trpc/server` 11.19.0, `@orpc/server` 2.0.0-beta.44, TypeScript 7.0.2, Node 24.21.0. Machine: 4-core Intel Xeon VM, 16 GB.

## Results

Throughput (`pnpm bench runtime`):

| server   | req/s (avg) | req/s (stdev) | requests |
| -------- | ----------: | ------------: | -------: |
| tRPC v12 |      14,505 |           301 |  159,540 |
| tRPC v11 |      12,852 |           278 |  128,517 |
| oRPC v2  |      55,654 |         1,189 |  556,500 |

Type-checking 3,000 procedures (`pnpm bench typecheck`):

|          | check | total | memory | instantiations |
| -------- | ----: | ----: | -----: | -------------: |
| tRPC v12 | 1.16s | 1.39s | 369 MB |      1,524,258 |
| tRPC v11 | 0.94s | 1.10s | 262 MB |      1,005,015 |
| oRPC v2  | 0.70s | 0.83s | 237 MB |        886,784 |

Bundle size, minified / gzip (`pnpm bench bundle`):

|               |            tRPC v12 |          tRPC v11 |           oRPC v2 |
| ------------- | ------------------: | ----------------: | ----------------: |
| client        |  104.7 kB / 35.0 kB | 36.4 kB / 11.8 kB |  27.1 kB / 9.6 kB |
| Node server   | 344.0 kB / 110.1 kB | 53.1 kB / 17.3 kB | 41.3 kB / 13.2 kB |
| fetch handler |  215.5 kB / 70.2 kB | 50.6 kB / 16.4 kB | 39.5 kB / 12.6 kB |

## Reading

- The oRPC-to-v11 ratios match oRPC's published ones (4.3× throughput here, 4.2× there; type-check total 0.75× here, 0.70× there), so the harness measures the same thing.
- **Throughput:** v12 is 13% ahead of v11 and at about a quarter of oRPC. Every v12 request goes through Effect's `HttpServer`, router, a fiber per call and danSON; where the time goes is not profiled yet.
- **Type-checking:** v12 is the slowest: 23% more check time and 52% more instantiations than v11, 66% more check time than oRPC. "Typesafe at scale" holds (3,000 procedures check in about a second), but this is the row where v12 is behind both. [`builder-generics-typeperf.md`](./builder-generics-typeperf.md) has the builder-level measurements to start from.
- **Bundle size:** v12's client is 3× v11's and 3.6× oRPC's gzipped, and its servers 4–8×. That's the Effect runtime, which every v12 entry point imports ([`effect-client-bundle-size.md`](./effect-client-bundle-size.md) splits it by module). The Node server also carries `@effect/platform-node`.
- Clinic profiles and the WebSocket and OpenAPI throughput rows of oRPC's table aren't measured yet.
