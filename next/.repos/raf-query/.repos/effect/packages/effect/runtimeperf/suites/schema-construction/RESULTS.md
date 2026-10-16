# Schema construction profile, 2026-09-25

The largest attributable costs depend on the schema. AST creation and copying dominate the ready-field wide structs
and the checked/encoded fixtures. Central schema-object construction is substantial when many small schemas are composed.
Type projection is more prominent with new transformations than with ordinary checks. These measurements do not support
assigning one universal percentage to `Schema.make` or predicting an optimization's speedup from CPU shares.

Only measurement code was added. The measured library is `main` at
`e36c35c656bb5cc6dd1170d863ea8abb75c24279`. Environment: Apple M3, macOS Darwin 23.6.0 arm64,
Node v24.12.0, V8 13.6.233.17-node.37. The source tree was checked clean and the revision unchanged before and after each run.

## Elapsed construction time

Times below are medians from 24 ordinary fresh Node processes per fixture, without the profiler.
Each process constructs 1,000 roots. MAD is the median absolute deviation, not a confidence interval.
Imports and first decode are excluded. Child construction is included.

| Fixture                                    | Median ms | MAD ms |
| ------------------------------------------ | --------: | -----: |
| Literal                                    |     0.648 |  0.008 |
| Struct, 2 dynamically generated fields     |     1.249 |  0.018 |
| Struct, 32 dynamically generated fields    |     6.126 |  0.412 |
| Struct, 256 dynamically generated fields   |    43.040 |  0.655 |
| Nested structs                             |     5.356 |  0.110 |
| Arrays, checks, optional keys and literals |    18.455 |  0.310 |
| New string-to-number transformations       |    12.360 |  0.108 |
| Union of 8 new tagged members              |    22.030 |  0.180 |
| Struct, 32 ready fields                    |     3.955 |  0.043 |
| Struct, 256 ready fields                   |    26.528 |  0.197 |

The dynamic-field fixtures include `Object.fromEntries` and its input arrays. The ready-field fixtures isolate
`Schema.Struct(fields)` with a previously prepared field map. Neither dynamic generation nor reused fields is a timing
model for a freshly written object literal. The ready-field cases were measured in a subsequent cohort; the difference
between the two tables' cases is not a paired estimate of field-map creation cost.

## Attributable internal work

These are mean per-process sample percentages at a requested 100 microsecond interval, rounded to one decimal place.
Every sample belongs to one category. Other includes API preparation, separately identifiable maker factories, the caller,
and runtime frames. Library work that V8 folds into the caller can remain in Other.

| Fixture                                    | Initial AST and AST changes | Central schema constructor | `toType` |    GC | Other |
| ------------------------------------------ | --------------------------: | -------------------------: | -------: | ----: | ----: |
| Struct, 256 ready fields                   |                       49.7% |                       1.7% |     9.3% | 15.8% | 23.5% |
| Nested structs                             |                       14.4% |                      26.6% |     6.9% | 26.9% | 25.2% |
| Arrays, checks, optional keys and literals |                       33.6% |                      21.4% |     3.7% | 23.1% | 18.2% |
| New string-to-number transformations       |                       30.9% |                      21.9% |    19.3% | 12.5% | 15.4% |

Representative 95% process-bootstrap intervals:

| Fixture                                    | Initial AST and AST changes | `toType`       |
| ------------------------------------------ | --------------------------- | -------------- |
| Struct, 256 ready fields                   | 48.8% to 50.6%              | 8.4% to 10.2%  |
| Arrays, checks, optional keys and literals | 32.5% to 34.8%              | 3.1% to 4.4%   |
| New string-to-number transformations       | 28.8% to 33.0%              | 17.4% to 21.1% |

The intervals describe process-to-process sampling variability. They do not include profiler bias, missed boundary
samples, or attribution errors caused by optimized code. These shares must not be multiplied by ordinary elapsed time
and presented as directly measured phase durations.

The retained stacks point to these concrete operations:

- Checked schemas spend many AST samples in `modifyOwnPropertyDescriptors` and `replaceChecks` in
  [SchemaAST.ts](../../../src/SchemaAST.ts). Updating checks copies property descriptors and creates another AST object.
- Encoded schemas also spend substantial time in `replaceEncoding`. The stacks separate copies needed while defining
  transformations from copies made later by `toType` while preparing `.make`.
- Ready-field structs spend many AST samples in `struct` and the `Objects` constructor. Those enumerate fields, create
  property signatures and check duplicate names. `toType` then traverses the property signatures, using memoized children.
- The [central constructor](../../../src/internal/schema/make.ts) remains a substantial cost for nested, checked,
  encoded and union fixtures. Its samples include function/prototype/property setup and inseparable inlined work.
  They do not isolate the cost of each property assignment or closure allocation.
- GC is visible in several fixtures. The CPU profile cannot assign a GC pause to the allocation that caused it.
  Small or zero samples in `makeEffect`/`makeOption` therefore do not establish that their allocations are cheap.

## Profiler perturbation and resolution

Both frequencies were paired with ordinary execution in the same round. Entries are median paired changes in elapsed
time, with 95% intervals. This is measurement overhead, not a source-code regression.

| Fixture                                    | Profiling at 100 us    | Profiling at 500 us    |
| ------------------------------------------ | ---------------------- | ---------------------- |
| Literal                                    | +13.8%, 12.4% to 16.5% | +13.0%, 12.0% to 15.4% |
| Struct, 2 dynamic fields                   | +15.7%, 11.9% to 18.2% | +14.6%, 12.6% to 17.6% |
| Nested structs                             | +6.2%, 3.7% to 7.7%    | +2.2%, 0.6% to 4.5%    |
| Arrays, checks, optional keys and literals | +6.1%, 3.8% to 7.6%    | +3.2%, 1.1% to 4.7%    |
| New string-to-number transformations       | +6.4%, 5.4% to 8.0%    | +4.4%, 2.4% to 5.9%    |
| Struct, 256 ready fields                   | +5.8%, 4.0% to 7.0%    | +2.9%, 2.2% to 3.3%    |

The checked and encoded fixtures give similar broad proportions at both frequencies. At 500 us, their `toType` shares
are 3.9% and 19.4%, respectively. This supports distinguishing the workloads, not treating the percentages as exact costs.

Literal has only 147 total construction samples at 100 us and 26 at 500 us across all 24 processes. The 500 us median
sampled span is zero because most processes have only one observed construction sample. Struct-2 and ready-field Struct-32
also have sparse 500 us profiles. Their precise elapsed times do not provide a comparably precise internal decomposition.

Union-8 exposes a boundary limitation: the 500 us median sampled span covers about 81% of elapsed construction time.
Its GC share changes from 34.7% at 100 us to 26.1% at 500 us, while central construction stays near 28%.
Do not use its GC point estimate to quantify a prospective allocation optimization. Caller-only attribution is also
ambiguous: even ready-field Struct-256 assigns about 21% to its tiny calling function, showing that this includes inlined
library work. It must not be described as 21% benchmark overhead.

## Reproduction and validation

The [protocol](./README.md) describes timing boundaries, attribution and sparse-profile handling. Two complete cohorts
ran sequentially, with no builds, tests or other benchmarks started alongside them. They contain 720 measured processes
and 10 separate semantic validation processes. All configured rounds succeeded; no observations were discarded.
An earlier two-round pilot and an incomplete sampler-resolution probe are separate from these results.

```sh
node packages/effect/runtimeperf/suites/schema-construction/run.mts tmp/schema-construction-rerun 24 1000 literal,struct-2,struct-32,struct-256,nested,composed,encoded,union-8
node packages/effect/runtimeperf/suites/schema-construction/run.mts tmp/schema-construction-ready-rerun 24 1000 struct-ready-32,struct-ready-256
```

Raw reports: [main cohort](../../../../../tmp/schema-construction-main/results.json) and
[ready-field cohort](../../../../../tmp/schema-construction-ready/results.json). Their sibling `profiles/` directories
contain the CPU profiles. Their `harness/` directories preserve the measured analysis files. The fixture list and runner
archival support were extended between cohorts; each report records its own hashes. Library sources and measurement
settings were unchanged.

Validation passed: all 26 runtimeperf infrastructure tests, including four attribution tests; valid/invalid fixture
checks and type-side makers in separate workers; post-timing root checks; `pnpm lint-fix`; focused `.mts` formatting;
and `pnpm check`. No library optimization was implemented or measured.
