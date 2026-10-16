# Parity tracks oRPC v2's table; its missing rows are built as `experimental_` (human)

- Human, 2026-10-16 (decision round, the parity target after oRPC v2): "A".
  - Options were: A) track v2's table, rebuild the parity notes from it and build the missing rows Effect-native as `experimental_*` (locking on Effect services, Workers Traces through Effect's `Tracer`, a benchmark suite against v11 and oRPC), with the cookie helpers, SWR and Pinia staying out; B) track v2's table but only mark the new rows as gaps; C) keep v1.15.5's table.
- (agent) [`../reference/orpc-parity.md`](../reference/orpc-parity.md) follows v2's `comparison.mdx` row for row, in its four groups, with a v12 column.
- (agent) Locking: `experimental_lock()` and the `experimental_Locker` service ([`locking-on-effect-services.md`](./locking-on-effect-services.md)).
- (agent) Workers Traces: `experimental_workersTracer()`, an Effect `Tracer` ([`workers-traces-tracer.md`](./workers-traces-tracer.md)).
- (agent) Benchmarks: `pnpm bench runtime|typecheck|bundle` in `tooling/bench`, modelled on middleapi/orpc-benchmarks so its oRPC and v11 numbers can be checked against oRPC's own. Results in [`../notes/benchmarks.md`](../notes/benchmarks.md): v12 leads v11 on throughput (+13%) but trails oRPC (about a quarter), and it is behind both on type-check time (+23% over v11) and bundle size (3× v11's client gzipped).
- Why: v2 is what users compare against, and the benchmarks back up or refute "typesafe at scale" with numbers.
- Lost: the cookie, encryption and signing helpers row stays 🛑, and so does SWR and Pinia Colada; the benchmarks are run by hand, not in CI.
- Open: the type-check and bundle-size gaps are measured, not addressed. Whether to work on them before v1, and what bundle size target to hold the client to, is a human call.
- Lives in: `.agent-docs/reference/orpc-parity.md`, `tooling/bench/`, `.agent-docs/notes/benchmarks.md`.
