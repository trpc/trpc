# AST allocation and copying, 2026-09-25

The existing AST classes already provide cheap allocation with stable field layouts. The first architectural change
worth investigating is a shared, inexpensive path for immutable updates. Descriptor-based copying is substantially
more expensive than creating the nodes themselves. Specialized constructors and a generic value-copy prototype both
remove most of this cost in the measured workloads. The measurements do not establish that rewriting every node into
a new class hierarchy would improve schema startup further.

This is an investigation of `SchemaAST.ts` at `80670a2b6f`, after the duplicate-check and `mapOrSame` optimizations.
The initial experiments used isolated source copies. Their patches, scripts and raw measurements are retained under
`tmp/ast-layout-study/` and `tmp/ast-layout-classes-vs-assign/` locally. The final section records the subsequent
implementation and its validation.

## Current representation

All 21 AST variants already use classes derived from `ASTNodeImpl`. Their class expressions execute once at module
initialization. Renaming them to `ObjectsImpl`, for example, would help internal references but would not itself make
allocation faster. Common fields are present even when their values are `undefined`, and methods live on prototypes.

| Node family                                                                                                                | Construction work                                                           | Implication for copying                                                                        |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `Null`, `Undefined`, `Void`, `Never`, `Unknown`, `Any`, `String`, `Number`, `Boolean`, `BigInt`, `Symbol`, `ObjectKeyword` | Store common fields and `_tag`                                              | Natural candidates for a direct allocation path; checks on scalar schemas use these frequently |
| `Objects`, `Union`, `Declaration`                                                                                          | Store common fields and child references, options or declaration callbacks  | Share children and callbacks; preserve `encodingChecks` and `encodingRun`                      |
| `Literal`, `Enum`                                                                                                          | Validate finite numeric values, then store payload                          | Copies with unchanged payload should not need repeated validation                              |
| `UniqueSymbol`                                                                                                             | Store the symbol                                                            | Share its identity                                                                             |
| `Arrays`                                                                                                                   | Store children and validate optional/required ordering                      | Metadata updates must not rescan an unchanged tuple                                            |
| `TemplateLiteral`                                                                                                          | Validate parts, allocate encoded parts and literals, compute suffix lengths | Metadata copies should share prepared data; rerunning the public constructor would redo work   |
| `Suspend`                                                                                                                  | Reject checks and wrap the thunk in a memoizing closure                     | Copies must share the existing thunk; recreating its wrapper changes sharing and adds closures |

`PropertySignature`, `IndexSignature`, `Context`, `Link`, `Filter` and `FilterGroup` also already use classes.
`IndexSignature` validates its parameter on the type and encoded sides and checks optionality. `PropertySignature`
only stores its name and type. The fixed shape of an `Objects` node does not depend on its number of fields: those live
in `propertySignatures`, rather than becoming JavaScript properties of the node itself.

The expensive generic path is `modifyOwnPropertyDescriptors`, used by `replaceChecks`, `replaceEncoding`,
`replaceContext`, `annotate` and check promotion inside `toType`. It creates the descriptor table and descriptor
objects, modifies values, and defines the properties on another object.

`toType` can first copy a node to remove encoding, then rebuild it after visiting children, then copy it again to
promote encoding checks. `flipEncoding` also removes encoding through a copy before recursion. These are opportunities
to reduce the number of allocations, independently of how each allocation is implemented.

`Schema.make` remains a separate source of construction work. It creates a function object, sets its prototype, adds
options and adapters, and calls `SchemaAST.toType` through `SchemaParser.make`. Making AST allocation cheap does not
remove all of this work.

## Direct V8 inspection

Environment: Node v24.12.0, V8 13.6.233.17-node.37, Apple M3, Darwin 23.6.0 arm64.
The diagnostic used `%HaveSameMap`, `%HasFastProperties` and `%DebugPrint` in a separate process with
`--allow-natives-syntax`. That flag was not used for timing runs.

For the tested `String`, `Number`, `Literal`, `Objects`, `Arrays` and `Union` nodes:

- Repeated constructor calls share a V8 map in the tested fixtures.
- A descriptor-based copy and its constructor-created source have different maps.
- Copies still have fast properties. Descriptor copying did not put these nodes into dictionary mode.

For the inspected `Objects` node, after constructor slack tracking:

| Allocation                      | Fields inside the object | Additional property storage         | Same map as the original |
| ------------------------------- | -----------------------: | ----------------------------------- | ------------------------ |
| `new Objects(...)`              |                        9 | None                                | Yes                      |
| Descriptor copy                 |                        4 | `PropertyArray[6]`, five slots used | No                       |
| Copy through `new Objects(...)` |                        9 | None                                | Yes                      |

An `Object.create` plus `Object.assign` copy also has a different map from the constructor-created node. This supports
investigating constructor copies, but does not prove a material end-to-end advantage over all generic copies.
See the retained `v8-layout.txt` for the actual dump. These details are observations of this V8 version, not language
guarantees. V8 describes the relevant mechanisms in [fast properties](https://v8.dev/blog/fast-properties) and
[hidden classes](https://v8.dev/docs/hidden-classes).

## Allocation experiment

The constructor prototype replaces metadata copies with explicit constructor calls for 18 variants. `Enum`,
`TemplateLiteral` and `Suspend` retain descriptor copying. It then updates the requested field on the new, unpublished
object. This prototype deliberately assumes standard built-in nodes. It is not a compatible replacement for arbitrary
AST objects.

Each case has 20 paired rounds in fresh Node processes. Pair order alternates and case order rotates. AST cases retain
10,000 results; Schema cases retain 1,000 new root schemas. There is no explicit warmup, but imports can warm shared
code, and V8 can optimize during the batch. Imports, process startup and decoding are excluded from elapsed time.
Valid decode, invalid input rejection and type-side construction run in separate validation processes. Prepared
property signatures are reused only in the two AST-only cases. Nested and composed Schema cases include child creation.

All 280 measured processes and 14 validation processes completed. Delta is the median paired ratio, with a 95%
process-bootstrap interval. It is not the ratio of the two separately reported medians. The improvement threshold is 2%.

| Case                                        | Baseline batch ms | Constructor-copy batch ms | Paired change | 95% interval                             |
| ------------------------------------------- | ----------------: | ------------------------: | ------------: | ---------------------------------------- |
| Raw `Objects`, 8 ready properties           |             0.863 |                     0.816 |         -6.6% | -9.6% to -0.8%, below evidence threshold |
| Copy `Objects` to change checks             |            23.126 |                     1.091 |        -95.4% | -95.4% to -95.2%                         |
| `Schema.Struct`, 8 fields                   |             1.382 |                     1.350 |         -1.6% | -10.7% to +0.8%, inconclusive            |
| Nested small structs                        |             4.172 |                     4.314 |         +2.0% | -0.3% to +5.0%, inconclusive             |
| Structs, checks, arrays and optional keys   |            16.334 |                     8.716 |        -47.2% | -47.9% to -45.6%                         |
| New string-to-number transformations        |            11.992 |                     6.000 |        -44.2% | -51.1% to -40.5%                         |
| Union of 8 newly constructed tagged members |            20.030 |                    16.824 |        -15.0% | -17.9% to -12.3%                         |

The raw constructor is unchanged between versions, so its apparent improvement is not evidence of a better constructor.
The candidate also changes module-initialization objects and therefore can change V8 feedback before timing starts.
The large gains demonstrate the potential of cheaper copying in these fixtures. They do not measure complete application
startup or identify how much of the gain comes from fewer descriptors versus different object layouts.

## Do specialized classes beat a simpler copy?

A second experiment substitutes `Object.assign(Object.create(Object.getPrototypeOf(ast)), ast)` for the prototype's
constructor switch. This uses the same metadata update callers. Twenty paired rounds compare it directly with the
constructor prototype, with the same timing boundaries. All 160 measured and eight validation processes completed.

| Case                            | Assign relative to constructor copying | 95% interval    |
| ------------------------------- | -------------------------------------: | --------------- |
| Copy `Objects` to change checks |                                  +5.9% | +3.8% to +10.5% |
| Composed schema                 |                                  -0.7% | -3.0% to +2.7%  |
| Encoded schema                  |                                  +0.2% | -1.1% to +2.9%  |
| Union of 8 members              |                                  +1.6% | +0.4% to +3.6%  |

None meets the configured 5% regression threshold with its entire interval. In these Schema workloads, specialized
constructor copies have no demonstrated material advantage over this small generic helper. This matters for the
preference for simple code and a small bundle. Bundle size was not measured for these diagnostic prototypes.

## Proposed design

Keep one class per AST kind, defined once, with fixed own fields, immutable child references and prototype methods.
The existing representation is a useful foundation. A uniform class containing every variant's fields would increase
node size and does not have evidence supporting it here. Moving every parser method off the prototypes or replacing
string tags with numbers also has no measured justification from this study.

Make node allocation and immutable updates one coherent internal mechanism:

1. Separate validation and preparation from storage. Public construction still rejects invalid literals, tuple ordering
   and template parts at the current time. An internal allocation path can reuse already validated payloads. It must
   not skip validation when an operation actually changes the relevant children.
2. Route metadata updates through that path, preserving unchanged arrays, callbacks, template preparation and suspended
   thunks. Cover scalar nodes as well as composite nodes. Restricting this to `Objects`, `Arrays` and `Union` would miss
   `.check` and encoding copies on common scalar schemas.
3. Build at most one final node for a projection when possible. `toType` should compute the final children, encoding
   and checks together, while preserving idempotence, structural-check promotion and context ownership. It should
   return the original node when nothing changes. This is a separate unmeasured optimization.
4. Keep parser preparation and derived caches outside ordinary node construction. Existing identity-based caches are
   useful for DAG sharing. Adding cache properties after construction, eagerly allocating more per-node caches, or
   recreating closure wrappers during copying would work against this goal. Moving template preprocessing to first
   use is a separate startup/first-use tradeoff, not an automatic improvement.

Start with the smallest common copy mechanism whose contract is acceptable. The generic value-copy candidate deserves
consideration before adding a per-kind copying method or constructor switch. If specialized copies are adopted, use
direct calls to the relevant internal class; dynamically invoking `this.constructor` is not equivalent to a known
constructor, and does not safely handle subclass contracts.

There is a concrete compatibility decision before adopting either prototype. The current descriptor path preserves
extra non-enumerable properties, getter definitions, descriptor flags and custom prototypes. The local contract probe
confirmed that constructor copies drop extensions and subclasses; assign preserves enumerable symbols and the prototype
but drops non-enumerable properties, invokes getters, and changes descriptor flags. Frozen source nodes also expose
different property flags in the resulting copy. Neither prototype is therefore a drop-in implementation.

A fast path must have a defensible definition of a standard internal node. Merely checking `_tag`, its prototype or
membership in a WeakSet does not prove that descriptors have not been changed after construction. Scanning every
descriptor to establish this on each copy could consume the intended saving. That contract should be settled explicitly
when implementing the shared copy path; the measured upper potential is not a reason to silently narrow it.

## Artifacts and validation limits

- `tmp/ast-layout-study/results.json`: baseline versus constructor copies, hashes, environment and raw paired timings.
- `tmp/ast-layout-classes-vs-assign/results.json`: constructor copies versus generic value copies.
- Each directory contains the measured `SchemaAST.ts` sources, patches, runner, statistics code and fixtures.
- `tmp/ast-layout-study/v8-layout.txt` and `contract.json`: representation and observable compatibility diagnostics.

The diagnostic workers checked normal fixture behavior before measurement in separate processes. Those prototype
checks are not a full Schema/compiler regression test or a claim of production compatibility. The prototype
measurements establish no bundle-size conclusion. Their temporary worktrees and runnable scratch files were removed
after archiving the evidence.

## Implemented value copies

The implementation replaces the descriptor helper with
`Object.assign(Object.create(Object.getPrototypeOf(ast)), ast)`. Checks, encoding, context, annotations and the existing
check-promotion step in `toType` copy through this helper and update the new node before publishing it. The class
hierarchy and traversal algorithm are unchanged.

The copy contract preserves the prototype and enumerable values, including symbol keys. It shares child arrays,
prepared template data and suspended thunks. It does not preserve extra non-enumerable properties or descriptor flags;
enumerable getters are evaluated and copied as values. This is an intentional change from descriptor copying.

Validation passed: `pnpm lint-fix`, `pnpm check`, and 988 tests across `SchemaAST.test.ts`, `Schema.test.ts`,
`toCodec.test.ts`, `toIso.test.ts`, `SchemaCompilerConstruction.test.ts` and `SchemaJITCompiler.test.ts`. Six added tests
cover frozen source nodes and custom prototypes, unchanged-node identity, encoding removal, context ownership,
template preparation and shared suspended thunks. After type-only corrections, the 69 AST tests also passed again.

The runtime comparison uses `pnpm runtimeperf-compare` against `HEAD` at
`80670a2b6f881f846c3945bb0cfcc77b87a47161`, with the modified working tree as head. Environment is Node v24.12.0,
V8 13.6.233.17-node.37, Darwin arm64 on Apple M3. Every comparison completed all 20 paired rounds in separate processes,
alternating base/head order. Each worker validates the fixture before and after timing. Initial runs use 150 ms warmup
and 500 ms timing. These measure repeated construction of fresh schemas after warmup, excluding imports, process
startup and decoding. They do not measure complete serverless startup.

| Case                                                 | Base median | Updated median | Paired change | 95% interval       | Classification |
| ---------------------------------------------------- | ----------: | -------------: | ------------: | ------------------ | -------------- |
| Product with small nested structs, checks and arrays |    63.96 µs |       40.90 µs |       -33.79% | -37.71% to -32.87% | Improvement    |
| Record with a newly constructed key transformation   |     6.62 µs |        3.95 µs |       -40.60% | -45.23% to -34.76% | Improvement    |
| Plain two-field Struct, initial run                  |     1.38 µs |        1.41 µs |        +6.26% | -2.84% to +14.61%  | Inconclusive   |
| Plain two-field Struct, longer run                   |     1.33 µs |        1.39 µs |        +3.24% | -2.50% to +7.72%   | Inconclusive   |

The longer control run uses 500 ms warmup and 1,500 ms timing per worker. It was run because the initial control was
too variable. Both results are retained; a small regression on plain Struct construction cannot be excluded. The
paired change is computed from paired log ratios, not the ratio of the two displayed medians. Confidence intervals
use 10,000 deterministic bootstrap samples, with the standard 2% improvement and 5% regression thresholds.

Reproduction commands:

```sh
pnpm runtimeperf-compare schema-benchmarks/initialization-schema --rounds 20 --time 500 --warmup-time 150
pnpm runtimeperf-compare schema/schema-creation-encoded-record-effect --rounds 20 --time 500 --warmup-time 150
pnpm runtimeperf-compare schema/schema-creation-object-2-effect --rounds 20 --time 500 --warmup-time 150
pnpm runtimeperf-compare schema/schema-creation-object-2-effect --rounds 20 --time 1500 --warmup-time 500
```

`tmp/schema-ast-copy/results.json` summarizes the runs and names each full report under `tmp/runtimeperf/results/`.
The directory also retains the measured `SchemaAST.ts` and the two investigation-local bundle fixtures.

The selected bundle comparison rebuilt both the current working tree and the same baseline commit with `pnpm build`:

```sh
pnpm bundle-compare-selected --base HEAD scratchpad/schema-ast-copy-struct.ts scratchpad/schema-ast-copy-composed.ts
```

| Fixture                                                                 | Base gzip size | Updated gzip size |       Difference |
| ----------------------------------------------------------------------- | -------------: | ----------------: | ---------------: |
| Exported eight-field Struct                                             |       17.90 KB |          17.88 KB | -0.02 KB, -0.12% |
| Exported composed schema with checks, annotations, context and encoding |       19.30 KB |          19.28 KB | -0.02 KB, -0.10% |

Sizes use the tool's decimal KB units and rounding. The full output is `tmp/schema-ast-copy/bundle.log`. Both builds
and comparisons passed. The workflow removed its temporary base checkout; the scratch fixtures and summary script
were removed after archiving the measurements.
