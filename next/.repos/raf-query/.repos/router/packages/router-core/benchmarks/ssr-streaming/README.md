# SSR streaming benchmark

This harness compares two Git revisions of router-core SSR streaming. Transform
runs validate byte count, SHA-256 digest, markers, selected transport API, and
lifecycle counts. Isolated transform timing includes hashing and marker scans;
warm transform timing moves those two checks into preflight requests.
Production-owner suites validate byte count, final owner state, and the 64 KiB
output chunk cap. Isolated owner timing includes hashing; warm and soak suites
use one separate digest-validating preflight per implementation.

Generated JSON and Markdown summaries stay under `results/` and are ignored by
Git. CPU profiles default to a `*-profiles/` directory beside the configured
JSON output. `--profile-dir` overrides that location.

## Quick start

Compare the latest `origin/main` with `HEAD`:

```sh
node packages/router-core/benchmarks/ssr-streaming/run.mjs \
  --origin=origin/main \
  --candidate=HEAD \
  --suite=common \
  --warmups=20 \
  --iterations=30 \
  --batch-requests=1000 \
  --output=packages/router-core/benchmarks/ssr-streaming/results/common.json
```

Use `--candidate=worktree` while testing an uncommitted optimization. Final
comparisons should use Git revisions so the result can be reproduced.

Run the focused queue-mechanism benchmark with:

```sh
pnpm --dir packages/router-core exec vitest bench \
  tests/hydrationQueue.bench.ts --run
```

## Suites

| Suite             | Purpose                                                                  | Default measurement                               |
| ----------------- | ------------------------------------------------------------------------ | ------------------------------------------------- |
| `smoke`           | Short raw, fast, and merge check                                         | One isolated process per cell                     |
| `common`          | Normal 1–64 KiB hydration payloads across React, Solid, and Vue profiles | Warm paired batches                               |
| `safe-points`     | Many small React and Solid renderer records                              | Warm paired batches                               |
| `coalesced-close` | React script safe points inside large renderer chunks                    | Warm paired batches                               |
| `small-memory`    | Small React raw, fast, and merge responses                               | Isolated processes with forced GC                 |
| `primary`         | Large hydration, closing-tag, renderer-record, and backlog stress        | Isolated processes with forced GC                 |
| `source`          | Large flat and rope router sources                                       | Isolated processes and direct `encodeInto` probes |
| `strings`         | Large flat and rope renderer string records                              | Warm paired batches                               |
| `owner`           | Production hydration owner and maximum legal backlogs                    | Isolated processes with forced GC                 |
| `owner-warm`      | Production hydration owner latency                                       | Warm paired batches                               |
| `owner-soak`      | Production hydration owner retention after repeated requests             | Post-return forced-GC checkpoints                 |

Filter cells with comma-separated `--scenario` and `--mode` values. Isolated
suites also accept `--implementation` and `--runs`. Warm suites accept
`--warmups`, `--iterations`, and `--batch-requests`.

The `coalesced-close` suite keeps hydration waiting until renderer EOF. Its
1 KiB and 64 KiB filler follows a script in one chunk, so returning at that
script can repeat the document-close search over the remaining bytes. It also
covers a close in the next chunk and a late-script control with little content
left to rescan. The filler contains complete HTML elements. An empty final
input record prevents source prefetch from finishing hydration before the
coalesced content drains. These cases measure repeated scanning within one
chunk; `safe-points` continues to measure separate small renderer records.

The `owner-warm` suite requires both revisions to contain
`packages/router-core/src/ssr/hydrationScripts.ts`. Older `origin/main`
revisions do not contain this file. After the owner exists in a committed
baseline, use `--origin=HEAD --candidate=worktree` for later changes.

During the initial owner introduction, run an isolated worktree-only cell:

```sh
node packages/router-core/benchmarks/ssr-streaming/run.mjs \
  --candidate=worktree \
  --suite=owner \
  --implementation=worktree \
  --scenario=hydration-owner-16x1k \
  --runs=1
```

For example:

```sh
node packages/router-core/benchmarks/ssr-streaming/run.mjs \
  --origin=HEAD \
  --candidate=worktree \
  --suite=common \
  --scenario=hydration-32k \
  --warmups=30 \
  --iterations=50 \
  --batch-requests=2000 \
  --output=packages/router-core/benchmarks/ssr-streaming/results/candidate.json
```

## What the numbers mean

Warm suites load both implementations into one Node process. They alternate which
implementation runs first for every request pair and at every batch boundary.
The warm-up count is per implementation: each warm-up iteration runs one
request against both revisions. Timed samples are complete request batches.

For isolated transform cells, `elapsedMs` includes incremental hashing and
marker validation. For warm transform cells, it measures a byte-counted drain
after validated warm-up requests. `wallElapsedMs` also includes synthetic
request setup and lifecycle checks. Merge cells include source creation by the
fake producer.

Isolated suites start a new Node process for each cell. Memory values are
sampled high-water deltas above a forced-GC baseline, not exact allocation
peaks and not proof that a leak is absent.

Treat changes below 1% as inconclusive unless several independent processes
repeat the result. In soak output, heap, external, and ArrayBuffer checkpoints
describe retained JavaScript-visible memory after forced GC. RSS is allocator
high-water behavior and is not, by itself, evidence of a leak. Use unit and
integration tests for backpressure, cancellation, abort, timeout, Unicode, and
split-boundary correctness. The throughput harness does not replace those
tests.

## Scope and limits

- Normal transform suites use `Uint8Array` renderer records. The `strings`
  suite isolates Node renderer string records.
- React uses the `script-close` safe point, Solid uses `record-end`, and Vue
  uses only the universal router boundary, document close, and EOF points.
- The fixed boundary suffix lets old and new implementations consume identical
  bytes and matches the production transport.
- The worker supplies the legacy `origin/main` transport and the current
  hydration-output transport so the intended baseline and candidate can share
  one fixture. It does not preserve intermediate private transport fields or
  benchmark the complete production hydration producer.
- The `owner` suites call the production hydration owner directly. They do not
  include the transform or a framework renderer.
- CPU results describe this Node and machine. They do not establish browser or
  Cloudflare Worker performance.

## Reproducibility

The runner materializes the complete tracked `packages/router-core/src` tree
for both inputs before it builds. With `--candidate=worktree`, it first copies
one immutable worktree snapshot so later edits cannot change the measured
artifact. Results record available commit IDs, both source-tree hashes, bundle
hashes, platform details, and a hash of the measured source pair. Child
processes and bundles use `NODE_ENV=production`.

Before publishing a conclusion:

1. Use clean Git revision names for both sides.
2. Run the same harness revision for both implementations.
3. Verify matching output bytes and digests.
4. Repeat latency comparisons in fresh processes when the expected change is
   small.
5. Run memory and correctness tests before retaining an optimization.

For attribution only, `--cpu-prof=true` writes profiles into a sibling
`*-profiles/` directory by default. Use `--profile-dir=...` to choose another
new or empty directory. Profiles also contain fixture and validation work, so
use them as hints rather than standalone proof.
