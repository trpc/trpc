# Schema construction costs

This diagnostic measures the current implementation before proposing changes. It leaves library sources unchanged.
It measures elapsed construction time in ordinary fresh Node processes, then uses separate V8 CPU-profiled processes
to locate the work. Profile shares are estimates of sampled execution, not directly timed phases or predicted savings.

Run from the repository root:

```sh
node packages/effect/runtimeperf/suites/schema-construction/run.mts tmp/schema-construction 24 1000
```

Arguments are a new output directory, rounds, root count, and an optional comma-separated list of case names.
The output directory's parent must exist. Existing output directories are rejected. The source tree must be clean.
Every raw observation is saved in `results.json`; raw `.cpuprofile` files can be opened in a CPU profile viewer.
Copies of the measured harness files are retained in `harness/` to preserve uncommitted analysis code.
The report records the commit, source-tree object, harness and lockfile hashes, Node/V8 versions, machine and settings.
Interrupted or failed runs retain `complete: false` and must not be reported as complete measurements.

## Scope

Each worker imports Schema, prepares fixture keys and validation inputs, and preallocates a root array before timing.
It then builds 1,000 new root schemas and retains them until the process exits. The timer includes field-map creation,
child schemas, checks, transformations, options and all eager internal work triggered by the declaration.
There is no explicit warmup. Schema's own import-time initialization has already run and can warm shared constructors
and caches. Node startup, TypeScript loading, module imports, decoder preparation and decoding are excluded.

Fixtures cover literals; structs with 2, 32 and 256 fields; nested structs; arrays with checks, optional keys and literals;
new string-to-number transformations; and unions of eight newly constructed tagged members. Root counts are not counts
of every intermediate schema. Shared primitive schemas such as `Schema.String` are imported constants. The `struct-N`
fixtures build field maps with `Object.fromEntries` during timing. The additional `struct-ready-N` fixtures reuse a field
map prepared before timing, to isolate `Schema.Struct(fields)` with ready inputs. Primitive schemas, field-name strings
and sample values are prepared beforehand in both cases. Dynamically generating fields is a distinct caller cost; it
does not model a hand-written object literal's cost.

Each fixture is validated in a separate process before measurement, including valid decode, type-side `.make`, and invalid
input rejection. Measured workers check root count, object kind and distinctness after timing. No prior validation warms
the measured worker. This protocol makes no claim about complete HttpApi/Confect startup, memory usage or warmed throughput.

## Measurement and attribution

Each round runs ordinary Node, profiling at a requested 100 microsecond interval, and profiling at 500 microseconds.
Workers run serially. The six possible orders rotate by round; fixture order also rotates. The default 24 rounds
balance all six orders. Do not run other benchmarks, builds or tests alongside the measurement.

Elapsed times are medians across independent processes, with median absolute deviation. Profiler perturbation is measured
through paired ratios against the ordinary process in the same round, using the existing deterministic bootstrap with
10,000 resamples. This is a check on measurement bias, not a comparison of optimized code.

Each CPU sample is assigned to one category:

| Category          | Included work                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `type-projection` | `toType` and its recursive traversal, clones and memoization, during synchronous maker preparation                                      |
| `ast`             | Initial AST construction and changes made by checks, annotations, optional keys and transformations                                     |
| `schema-object`   | Central schema constructor after subtracting identifiable child phases: function object, prototype, options, property and closure setup |
| `make-sync`       | Identifiable synchronous maker factory frames outside the type projection                                                               |
| `make-effect`     | Identifiable effectful maker factory frames outside the Option adapter                                                                  |
| `make-option`     | Option adapter factory, including its separately allocated effectful maker                                                              |
| `schema-api`      | Other Schema API work, including composition wrappers and check factories outside AST constructors                                      |
| `fixture`         | Caller-attributed samples: field maps, member lists, the loop, and library work inlined into those frames                               |
| `gc`              | Garbage collector samples inside the construction window                                                                                |
| `runtime`         | Other runtime samples without an attributable Schema stack                                                                              |

Child work is never added again to its parent. V8 can omit an inlined `SchemaParser.make` frame. In these fixtures,
the only eager AST/Function subtree beneath central `make` is `toType`; this path is classified as projection even when
the parser wrapper is absent. The fixtures do not use options with getters that could invoke arbitrary AST work.
Completely inlined work that cannot be separated remains with the caller. The `fixture` category is therefore an
unresolved caller category, not a measurement of pure benchmark overhead or field-map creation. A ready-field fixture
whose body only calls `Schema.Struct(fields)` still receives caller-attributed samples. Small or zero factory shares do not prove
that their allocations are free; allocation effects can appear in central construction or GC.

Profiles are delimited by the first and last samples containing the worker's `constructBatch` frame. Samples outside
that span are excluded, including inspector setup. Interior GC/runtime samples are retained. Inspector timestamps and
`hrtime` are not directly compared because their origins can differ. Missing boundary samples, especially GC before the
first or after the last observed construction frame, are a limitation. The report keeps sample counts, sampled span
coverage and counts of processes with fewer than ten samples. A profile with no construction samples remains recorded
and is excluded from share estimates. One sample has zero measured span coverage and is marked sparse.

Shares are unweighted sample proportions within each process, averaged across processes. Their 95% intervals bootstrap
whole processes, not individual correlated samples. Categories sum to 100% for the point estimates; interval endpoints
need not sum to 100%. These intervals cover sampling variability, not profiler bias or attribution errors. Compare the
two sampling frequencies and their overhead before interpreting the shares. Do not convert them into exact milliseconds
or predicted speedups. Short fixtures may support a reliable elapsed time without a useful internal breakdown.

Top leaf functions and source-position ticks are retained as secondary diagnostics. Source-position ticks are not an
additional additive cost breakdown and may accumulate at a function's entry after optimization.

## Validation

```sh
node --test packages/effect/runtimeperf/test/*.test.mts
pnpm exec dprint check --includes-override 'packages/effect/runtimeperf/suites/schema-construction/*.mts' 'packages/effect/runtimeperf/test/schema-construction.test.mts'
```

The attribution tests cover non-overlapping phases, inlined maker frames, Option's nested effect maker, profile boundaries,
interior garbage collection, missing samples and deterministic confidence intervals.
