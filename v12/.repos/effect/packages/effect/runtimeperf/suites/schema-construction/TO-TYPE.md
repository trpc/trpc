# Removing intermediate toType copies, 2026-09-25

Follow-up diagnosis below qualifies the initial timing conclusion: the spike removes measurable work, but the
reported 11% reduction in mean time is not a stable estimate across sessions.

This spike changes only the projection order inside `SchemaAST.toType`. It projects children before stripping the
node's encoding. A rebuilt composite node already has no outer encoding, so the preliminary copy can be skipped.
When encoding checks need promotion, removing encoding shares that final metadata copy. Unchanged children still
preserve all encoding checks; changed children retain only the existing structural-check subset.

The class hierarchy, recursive rebuilding methods and memoization helper are unchanged. The spike does not attempt
to combine a composite rebuild and subsequent check promotion into one allocation.

## Comparison

Base is `7cf1abdbf4e0a7a86c66f8cb668bf42a2047110e`; head is the working tree on that commit with the spike applied.
Measurements use Node v24.12.0, V8 13.6.233.17-node.37, Darwin arm64 on Apple M3. Each comparison completes 20 paired
rounds in fresh processes, with alternating base/head order. Both sides use the same fixture and batch size. No
builds or tests ran concurrently with these timing commands.

The added eight-field fixture constructs a JSON-string codec around a Struct with fresh string-to-number
transformations, checks, an array, a nested Struct and an optional property. The first-make case constructs that same
schema and calls `.make()` once with decoded input. Each measured operation constructs a new root schema. Fixture
validation checks decoding, successful construction and rejection of a negative number outside the timed callback.

These are warmed construction measurements. They exclude process startup, module loading and imports. First-make
timings include schema creation and constructor preparation through the first result, not JSON decoding. They do
not establish a complete serverless startup improvement or isolate the cost of `.make()` alone.

The initial runs use 150 ms warmup and 500 ms timing per process:

| Case                                                     | Base median | Spike median | Paired change | 95% interval      | Classification |
| -------------------------------------------------------- | ----------: | -----------: | ------------: | ----------------- | -------------- |
| Encoded eight-field schema, creation                     |    13.55 µs |     12.52 µs |        -6.18% | -8.77% to -1.90%  | Inconclusive   |
| Encoded eight-field schema, creation and first make      |    19.55 µs |     17.26 µs |        -6.38% | -15.96% to +1.71% | Inconclusive   |
| Record with a new key transformation, creation           |     3.90 µs |      4.33 µs |        +5.14% | -4.52% to +24.91% | Inconclusive   |
| Product with nested structs, checks and arrays, creation |    40.75 µs |     39.57 µs |        -0.09% | -1.36% to +0.96%  | Inconclusive   |
| Plain two-field Struct, creation and first make          |     2.03 µs |      2.02 µs |        -0.21% | -6.22% to +4.08%  | Inconclusive   |

The three transformation cases were repeated with 500 ms warmup and 1,500 ms timing per process because the initial
comparisons were inconclusive. All three repeats completed the same 20 paired rounds:

| Case                                                | Base median | Spike median | Paired change | 95% interval      | Classification |
| --------------------------------------------------- | ----------: | -----------: | ------------: | ----------------- | -------------- |
| Encoded eight-field schema, creation                |    13.56 µs |     13.37 µs |        -2.63% | -5.17% to +0.78%  | Inconclusive   |
| Encoded eight-field schema, creation and first make |    21.03 µs |     18.52 µs |       -10.99% | -25.73% to -7.77% | Improvement    |
| Record with a new key transformation, creation      |     3.70 µs |      3.71 µs |        -4.05% | -7.57% to -0.13%  | Inconclusive   |

All eight comparisons completed, totaling 320 measured worker processes. No initial results were discarded or pooled
with the longer runs. Deltas are medians of paired log ratios, not ratios of the separately displayed medians. The
95% intervals use 10,000 bootstrap samples. Classification requires the whole interval to exceed a 2% improvement
or 5% regression threshold. Thus an interval entirely below zero can still be inconclusive at the improvement threshold.

The longer run supports an improvement through the first `.make()` for the encoded eight-field fixture. The scope of
that finding is one workflow; the creation-only cases do not establish a gain above the configured threshold. No
comparison classified a regression. The wide first-make interval also limits precision of the estimated saving.

## Validation and artifacts

Passed `pnpm lint-fix`, `pnpm check`, and 991 tests across `SchemaAST.test.ts`, `Schema.test.ts`, `toCodec.test.ts`,
`toIso.test.ts`, `SchemaCompilerConstruction.test.ts` and `SchemaJITCompiler.test.ts`. The three added regression tests
cover outer encoding with unchanged children, combined outer/child encoding with mixed checks, and lazy recursive
suspended nodes with identity preservation. The 72 AST tests also passed after a test typing correction.

The runtimeperf registry and fixture materialization tests passed, 11 tests in total. This includes loading, running
and validating every registered fixture export, including the two added cases.

Commands for the three transformation cases, using either `--time 500 --warmup-time 150` for the initial run or
`--time 1500 --warmup-time 500` for the repeat:

```sh
pnpm runtimeperf-compare schema/schema-creation-encoded-object-8-effect --rounds 20 --time 1500 --warmup-time 500
pnpm runtimeperf-compare schema/first-make-encoded-object-8-effect --rounds 20 --time 1500 --warmup-time 500
pnpm runtimeperf-compare schema/schema-creation-encoded-record-effect --rounds 20 --time 1500 --warmup-time 500
pnpm runtimeperf-compare schema-benchmarks/initialization-schema --rounds 20 --time 500 --warmup-time 150
pnpm runtimeperf-compare schema/first-make-object-2-effect --rounds 20 --time 500 --warmup-time 150
```

These commands use the current working tree as head and `HEAD` as base. Set `--base 7cf1abdbf4` to reproduce the
comparison after committing the spike.

`tmp/schema-to-type/results.json` retains the summaries, configuration and paths to all full reports under
`tmp/runtimeperf/results/`. The same directory retains the candidate source, tests, fixture definitions, registry,
patch and bundle fixtures.

## Bundle comparison

`pnpm bundle-compare-selected --base HEAD scratchpad/schema-to-type-struct.ts scratchpad/schema-to-type-encoded.ts`
rebuilt both revisions and compared two self-contained, investigation-local entrypoints. Both builds and comparisons
passed. The first exports a plain eight-field Struct; the second exports a JSON-string codec around a checked,
encoded eight-field Struct.

| Fixture        | Base gzip size | Spike gzip size |       Difference |
| -------------- | -------------: | --------------: | ---------------: |
| Plain Struct   |       17.88 KB |        17.89 KB | +0.01 KB, +0.04% |
| Encoded Struct |       19.55 KB |        19.55 KB | +0.01 KB, +0.03% |

Sizes and deltas use the tool's decimal KB units, rounded separately. Full output is in
`tmp/schema-to-type/bundle.log`. The temporary bundle checkout and scratch files were removed; fixture sources remain
archived with the measurements. The spike, regression tests and two benchmark cases remain in the working tree.

## Follow-up: explaining the first-make result

The investigation compared three versions of the same eight-field fixture:

- **Base:** commit `7cf1abdbf4`.
- **Direct:** a diagnostic variant of base that still makes the preliminary encoding-free copies, but calls the
  projection body directly for those temporary copies instead of recursively entering the memoized wrapper.
- **Spike:** the existing uncommitted change, which also skips the redundant composite copy.

The direct variant was confined to a temporary checkout. It is an experiment, not an additional production change.

### Deterministic work counts

Counters were added only to isolated copies of the source. `WeakMap.get` and `WeakMap.set` were counted separately;
`WeakMap.has` distinguished a new key from an overwrite. These counts are not timings.

| Work during one schema creation | Base | Direct | Spike |
| ------------------------------- | ---: | -----: | ----: |
| Calls to AST `copy`             |    7 |      7 |     6 |
| Copies of an `Objects` node     |    2 |      2 |     1 |
| Projection-body executions      |   10 |     10 |     8 |
| WeakMap reads                   |   32 |     30 |    30 |
| WeakMap writes                  |   20 |     16 |    16 |
| Newly inserted WeakMap keys     |   12 |     11 |    11 |

The four fewer writes do not mean four fewer cache entries: only one distinct key disappears. The memoization
helper caches both input and output, and several writes overwrite an existing output entry.

During the first `.make()`, all three versions resolve the registry 12 times and compile the same eight parsers.
On subsequent freshly constructed schemas, already cached primitive parsers reduce that count to five in all three
versions. A second `.make()` on the same schema performs none of these counted operations. No `toType` work occurs
during these `.make()` calls: `internal/schema/make.ts` already calls `SchemaParser.make`, which projects the AST
while creating the schema.

The projected graphs match for node tags, check counts, encoding counts, optionality, property order and child
sharing in this fixture. Valid input, decoding and invalid-input rejection also pass in the diagnostic variant.
The production spike retains the regression-test coverage listed above.

This establishes two mechanisms: less copying and less memoization of temporary objects. It does not establish
fewer parser compilations or less validation work on first use.

### Repetition and GC diagnostics

A fresh standard comparison with the original 20-round, 500 ms warmup / 1,500 ms timing configuration produced
24.95 µs versus 18.30 µs, a paired -26.47% change with interval -28.58% to -9.23%. The direction repeated, but the
magnitude differed substantially from the earlier -10.99%. Both reports retain unusually long tail samples.

To investigate the cause, the diagnostic experiment separated the creation, first-make and second-make phases;
compared a continuous loop with retained batches; and then returned to Tinybench with the original batch size of
eight. Counters were removed before every timing run. Explicit GC was used only in the separate-phase experiment,
outside the measured phases. It was not used in either Tinybench experiment.

The final experiment ran the repository's **unmodified worker** and a copy with a GC observer in separate processes.
Both used the same fixture, time settings and batch size. Each mode completed 12 rounds across base, direct and
spike; the six possible execution orders were balanced. GC observation is diagnostic and can affect execution.
The unmodified-worker results remain the control for this experiment.

| Unmodified worker metric | Base median | Direct median | Spike median | Direct paired change (95% interval) | Spike paired change (95% interval) |
| ------------------------ | ----------: | ------------: | -----------: | ----------------------------------- | ---------------------------------- |
| Mean time per operation  |    19.28 µs |      18.78 µs |     19.09 µs | -1.66% (-8.51% to +3.87%)           | -3.80% (-12.56% to +1.41%)         |
| Within-process p50       |     7.55 µs |       7.14 µs |      7.06 µs | -4.71% (-8.17% to -2.99%)           | -7.08% (-10.52% to -4.78%)         |

The means are inconclusive; the p50 reductions exceed the configured 2% threshold. The p50 is a median of batch
latencies divided by eight, not an isolated single-call latency or a cold-start result. In a separate Tinybench
diagnostic driver, the spike's p50 improvement was -4.42% (-5.63% to -3.26%), while its mean was inconclusive.
These exploratory metrics were selected during diagnosis and should not replace the mean as the original primary
endpoint.

With the GC observer attached to a copy of the original worker, medians were:

| Measured quantity                  |     Base |   Direct |    Spike |
| ---------------------------------- | -------: | -------: | -------: |
| Mean time per operation            | 19.18 µs | 18.80 µs | 18.30 µs |
| Observed GC duration per operation | 11.11 µs | 11.19 µs | 10.78 µs |
| Time after subtracting observed GC |  8.07 µs |  7.84 µs |  7.62 µs |

Each row is aggregated separately, so displayed medians need not add up. GC events were filtered to the measurement
loop's wall-clock interval, excluding warmup and post-run statistics. The subtraction is approximate: events can
occur between callbacks, and event duration does not account for every concurrent collector cost. The observer uses
Node's [GC performance entries](https://nodejs.org/docs/latest-v24.x/api/perf_hooks.html#garbage-collection-gc-details).
It records event durations, not total allocated bytes or exact attribution to a specific AST allocation.

Observed GC accounts for more than half of the mean time in this workload. However, the paired difference in GC
duration for spike versus base was -6.51% with interval -13.46% to +2.39%, so a consistent GC reduction is **not**
established. The separate-phase experiment was also inconclusive for first-make alone. Neither experiment proves
that a particular V8 collector or JIT mechanism caused the original 11% result.

The supported conclusion is narrower: the change eliminates one AST copy, two cache reads, four writes and one
cache entry per schema in this fixture; bypassing only the intermediate memoization already reduces the typical
batch latency. Repeated creation plus first use is heavily affected by GC, and its aggregate improvement varies
across cohorts. The original 11% must not be presented as a stable first-make or startup improvement. Comparing
independent creation-only and creation-plus-make medians cannot isolate the cost of `.make()`.

### Diagnostic artifacts and validation

`tmp/schema-to-type-diagnosis/` retains source snapshots, all probe scripts, the direct variant, counter outputs and
full per-process results. In particular:

- `original-stats.json`: reanalysis of the original long run and its fresh standard repetition, including p50 and tails.
- `base-counts.json`, `direct-counts.json`, `head-counts.json`: work counts and normalized output graphs.
- `phases/results.json`: 10 paired rounds per mode, 60 workers, including the experiments with explicit GC.
- `tinybench/results.json`: 12 rounds of three variants, with/without GC observation, 72 workers.
- `exact/results.json`: another 72 workers, using the original worker and its GC-instrumented copy.

The final experiment's first aggregation attempt mislabeled the observer mode because the worker's `mode: measure`
field overwrote it. All 72 workers had completed successfully. The summaries were regenerated from the saved files,
whose names identify the correct modes; no measurements were rerun or discarded to repair this reporting error.

The fresh standard report is
`tmp/runtimeperf/results/2026-09-25T12-58-09-246Z-8508-78c08b-compare-schema-first-make-encoded-object-8-effect.json`.
No builds or tests ran during the diagnostic timing cohorts. A temporary checkout was created near the end of the
fresh standard repetition; that run alone is not the basis of the diagnosis. The isolated counter instrumentation
was restored before timings, and the temporary checkouts and scratch probes were removed after archiving.

No runtime source or regression test changed during this follow-up. The earlier runtime validation still applies;
the report-only follow-up was checked with `pnpm lint-fix` and `git diff --check`.
