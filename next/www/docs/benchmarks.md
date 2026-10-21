---
title: Benchmarks and comparison
label: Benchmarks
description: How tRPC v12 compares with tRPC v11 and oRPC v2 on throughput, type-checking and bundle size, measured by one harness on one machine, and which features each has.
section: Getting started
order: 3
experiment: benchmarks
---

These benchmarks measure tRPC v12 against tRPC v11 and oRPC v2 the way oRPC's own comparison measures oRPC against v11 ([middleapi/orpc-benchmarks](https://github.com/middleapi/orpc-benchmarks)), so the oRPC and v11 numbers can be checked against oRPC's. All three run in the same harness on the same machine. Absolute numbers differ between machines; compare the frameworks with each other, not with numbers measured elsewhere.

v12 isn't released yet, so its numbers move with its commits. The charts are a snapshot, committed with the docs, and each section says the commit it was measured at.

In this snapshot:

- oRPC v2 is ahead of both tRPC versions on throughput, type-checking and bundle size.
- tRPC v12 serves about three times as many requests per second as v11, type-checks in about the same time with more instantiations and memory, and its bundles are several times larger.
- v12 is built on [Effect](https://effect.website), and the numbers include Effect's share: its HTTP server in the throughput, its declarations in the type-checker's memory, and its runtime in the bundles.

## Throughput

Each server runs in its own Node process and serves the same router of 6 procedures, each with a Standard Schema input that passes its value through, and returning `{ name, date: new Date(), input }`. Native types are on in every framework: progressive JSON in v12, superjson in v11, and oRPC's own transformer. [autocannon](https://github.com/mcollina/autocannon) sends the `GET` request each framework's client sends for `nested.procedure_1('hello world')`.

v12 serves with `serve(handler)` on Effect's Node `HttpServer`, v11 with its standalone adapter, and oRPC with `RPCHandler` from `@orpc/server/node`.

```benchmark
runtime
```

## Type-checking

A generated project of 500 files defines the routers, three levels deep in each file, and calls every procedure through the typed client with its result annotated. The type-checker is `tsc --extendedDiagnostics --singleThreaded` on TypeScript 7.1, with `skipLibCheck`. v12 is checked from its built `.d.ts` files, as v11 and oRPC are from their published ones.

```benchmark
typecheck
```

Part of v12's memory is Effect's declarations, which every v12 project's type-check reads, with or without procedures.

## Bundle size

Each framework's minimal client, Node server and fetch handler, bundled by rolldown with tree-shaking, minifying and `NODE_ENV=production`, then gzipped at level 9.

- The v12 client is `httpLink` with progressive JSON, which also reads streamed responses and subscriptions.
- The v11 client is `httpLink`, `httpSubscriptionLink` and `splitLink` with superjson, as oRPC's measurement has it.
- The oRPC client is `RPCLink` from `@orpc/client/fetch`.

```benchmark
bundle
```

v12's bundles are the largest of the three: its links and handlers run on Effect, whose runtime the bundle carries. Work on the client's size is in progress; server bundles aren't a goal.

## Features

The rows of oRPC v2's [comparison](https://orpc.dev/docs/comparison), in its groups. The oRPC v2 and tRPC v11 columns are copied from it (as of `2.0.0-beta.44`), so the v11 column is oRPC's assessment of v11. The v12 column is what v12 ships, each row covered by tests with real clients. Several v12 rows are `experimental_` exports, which [might change or go away in any release](./packages.md#experimental).

✅ first-class · 🟡 partial or third-party · 🛑 not supported

```parity

```

## Running them

From `next/` in the [repository](https://github.com/trpc/trpc/tree/v12/next):

```sh
pnpm install
pnpm build # the type-check reads v12's built .d.ts
pnpm bench runtime
pnpm bench typecheck
pnpm bench bundle
```

Each prints a table. `--snapshot` also writes its results to `www/benchmarks.json`, which this page charts. `runtime` takes `--duration` (seconds, 10 by default) and `--connections` (10), and `typecheck` takes `--routers` (500, 6 procedures each) and `--runs` (3). The harness is [`tooling/bench`](../../tooling/bench/bench.ts).
