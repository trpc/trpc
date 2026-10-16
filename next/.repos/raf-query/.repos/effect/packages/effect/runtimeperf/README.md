# Effect Runtime Performance

This harness measures focused synchronous runtime paths in fresh Node
processes. It supports:

- focused Effect Schema diagnostics;
- native Arbitrary comparisons against equivalent fast-check v4 arbitraries;
- the upstream Effect, Valibot and Zod benchmark matrix;
- paired comparisons between Git revisions or the current working tree.

Cross-library results are diagnostic. Effect base/head comparisons are the
authoritative measurement for source changes.

## Commands

Run the complete registry:

```sh
pnpm runtimeperf
```

Run the cases extracted from the `effect@beta`, Valibot and Zod adapters in
[`open-circle/schema-benchmarks`](https://github.com/open-circle/schema-benchmarks):

```sh
pnpm runtimeperf schema-benchmarks
pnpm runtimeperf-compare schema-benchmarks --base main --head HEAD
```

This suite covers every upstream timing case supported by those adapters:
schema and decoder initialization, validation, parsing and Standard Schema
with valid/invalid inputs and first/all error modes, plus BigInt codec
operations. The upstream bundle and stack reports are not throughput
benchmarks, and the adapters do not define the optional string-format cases.

Select a suite, fixture, shared scenario, tier, family or implementation:

```sh
pnpm runtimeperf schema
pnpm runtimeperf arbitrary
pnpm runtimeperf object-32-valid
pnpm runtimeperf schema/object-32-valid-effect
pnpm runtimeperf --family arrays
pnpm runtimeperf --implementation zod4
pnpm runtimeperf --implementation zod4-compiled
```

Override measurement settings:

```sh
pnpm runtimeperf object-32-valid --rounds 9 --time 500 --warmup-time 150
```

Compare Effect `HEAD` with the working tree:

```sh
pnpm runtimeperf-compare schema/object-32-valid-effect
```

Measure excess-property checking and symbol enumeration in interpreted and JIT parsers:

```sh
pnpm runtimeperf-compare schema-excess-properties
pnpm runtimeperf-compare schema-excess-properties --family jit
```

Compare explicit refs:

```sh
pnpm runtimeperf-compare schema --base main --head HEAD
```

Only `--fail-on-regression` turns a statistically classified regression into a
non-zero comparison exit code. Worker, fixture, configuration and Git errors
always fail.

Reports are written under `tmp/runtimeperf/results/`. Temporary Git worktrees
are created under `tmp/runtimeperf/worktrees/` and removed in `finally`.

## Registry

`config.json` groups fixture cases by source file. Every case records:

- tier and family;
- covered Effect AST tags;
- operation and path;
- input size;
- implementation;
- a shared scenario name for cross-library comparisons.

The `schema` suite is Effect-only and retains targeted diagnostics for scaling,
template literals, unions, records, transformations, optional properties,
adapters, recursion and cold paths. The `schema-benchmarks` suite contains the
complete timing matrices exposed by the upstream Effect, Valibot and Zod
adapters.

The `moltar-parse-safe` and `moltar-assert-loose` suites preserve Moltar's
object shape. Their valid cases reproduce the upstream timed operation; the
extra-property and invalid cases are Effect extensions. They compare
interpreted Effect, Effect JIT and AOT, Valibot, ordinary and jitless Zod where
applicable, and Zod `compile`, using the dependency versions recorded in each
report.

The `arbitrary` suite compares the native public API with direct fast-check v4 arbitraries in separate processes. It
measures derivation through the first recursive sample, steady-state recursive
sampling, optional-Struct sampling, fixed-length string generation to exercise constraint pushdown,
bounded Number generation, direct Uint8Array generation, a rare residual filter, a fixed-length unique array, and a
mixed regular expression through cold derivation, warm generation, and shrinking. It also covers literal sampling as
a runner baseline and the public `map`, `filter`, `filterMap`, and `all` combinators for tuples and records. The failure
paths include a filtered failure with rejected shrink candidates, dependent `flatMap` sampling, shrinking, replay, a
passing property, a failure that shrinks from `1000` to `1`, and replay of that failure. The
recursive distributions are implementation-defined, so the fixtures use
implementation-specific size settings and validate a comparable total node
count for the fixed seed. The bounded Number case is a throughput comparison,
not distribution parity: native selects among 64-bit IEEE-754 representations,
while the fast-check fixture uses its 64-bit `double`. Replay is an
end-to-end public API comparison, but the work is not identical: native replay
verifies the original failure and its full shrink path, while fast-check can
start directly from its recorded path.

Array cases cover passing checks and shrinking a four-command sequence while preserving an ordered pair. The latter
starts from the same explicit sequence in both engines, using a fixed seed for native generation and an example for
fast-check. Base/head validation preserves the failure without requiring identical shrunk outputs, so its timing also
reflects changes in how much of the shrink tree is explored. The runtime regression tests assert the smaller result.

The regular-expression fixtures validate the same language, and both fixed-seed warm fixtures must reach multiple
lengths and every alternative family. Their exact distributions remain implementation-defined, so cross-library
timings are diagnostic while base/head comparisons protect the cost of each implementation's established behavior.

An impossible Schema filter is deliberately not a cross-engine timing case.
The native runner reports bounded exhaustion, while a direct fast-check arbitrary
built with `Arbitrary.filter` does not return from generation
when no value can satisfy the predicate. Native exhaustion remains covered by
the Arbitrary tests instead of placing a permanently blocking fixture in the
performance harness.

Zod parsing cases import `zod/v4` and call `safeParse` with `{ jitless: true }`;
its Standard Schema and codec cases use their native APIs. Valibot uses the
corresponding `is`, `safeParse` and Standard Schema APIs. The focused Effect
adapter family measures the overhead of public APIs that wrap parser issues.
The compiler comparison calls `z.compile(schema, { strict: true })` and uses
Zod's `validate` API for boolean checks. Ten representative scenarios also run
against equivalent Valibot schemas using `parse` and `is`.

## Measurement model

Each worker validates the fixture before and after measuring. The Effect
fixture calibrates one batch size that every implementation in the same
scenario uses. This keeps the enclosing loop identical across implementations;
V8 can otherwise optimize sub-10 ns callbacks differently at different batch
sizes. Each implementation executes in a separate process, with rotating order
within the scenario.

Tinybench measures one synchronous batched task. The primary process result is:

```text
nsPerOp = totalTimeMs * 1_000_000 / (task.runs * batchSize)
```

Tinybench latency statistics are retained as diagnostics and normalized by the
batch size. Independent Node processes, not Tinybench samples, are the
statistical observations.

Base/head comparisons alternate execution order by round and analyze paired
log ratios with a deterministic bootstrap. The report keeps all raw worker
results so aggregates can be recalculated.

## Fixture contract

Each configured export is a factory:

```ts
type RuntimePerfCase = {
  readonly run: () => unknown
  readonly validate: (result: unknown) => void
}

type RuntimePerfCaseFactory = () => RuntimePerfCase
```

Construct schemas, steady-state adapters and deterministic inputs in the
factory. Cold fixtures deliberately construct them inside `run`. A fixture
must measure one named operation, perform no I/O and return no Promise.

## Validation

```sh
node --test packages/effect/runtimeperf/test/*.test.mts
pnpm exec dprint check package.json packages/effect/runtimeperf
```
