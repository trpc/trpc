# CPU simulation benchmarks

`client-nav` measures navigation, mounting, and React/Solid hydration in
Node/jsdom; `ssr` measures server requests.
Both suites run through the CodSpeed Vitest integration in CPU simulation mode.

## Worker runtime

Every CPU benchmark project includes `cpuSimulationExecArgv()` from
[`cpu-simulation.ts`](./cpu-simulation.ts). It augments CodSpeed's worker flags
only during CPU simulation, including the legacy `instrumentation` mode.

The pinned CodSpeed integration supplies `--no-opt`. In Node 24 this is an alias
for `--no-turbofan`, so Maglev can still optimize and inline hot functions. The
additional `--no-maglev` keeps the optimizing compiler out of the simulation.
`--always-sparkplug` compiles baseline code on first use, so warmup does not leave
functions approaching a later tier-up or batch-compilation threshold. The worker
regression test checks that even a once-called function receives baseline code.
The integration also omits the old `--no-scavenge-task` flag on Node 20 and
newer, where V8 renamed it to `--no-minor-gc-task`. Supplying the renamed flag
keeps minor GC tied to allocation pressure instead of scheduled foreground
tasks. Both flags follow the fixes in
[CodSpeed's Node 24 support](https://github.com/CodSpeedHQ/codspeed-node/commit/e3224e7872).

`--initial-old-space-size=512` fixes the initial/minimum old-generation
allocation budget at 512 MiB. Removing only this override after worker isolation
left two Vue SSR scenarios with same-commit spreads above 2% in five full-suite
repetitions. The paired default-heap comparison with stock incremental-marking
tasks also exceeded 2%. Runtime comparisons and tested alternatives are recorded in
[PR #8248](https://github.com/TanStack/router/pull/8248).

This is a GC-policy tradeoff. Minor collections and allocation work remain
measured, and CodSpeed still explicitly collects before measurement. However,
V8 can skip automatic full collections below this old-generation budget, so the
benchmark can omit some eventual full-GC CPU cost from increased object
retention. Repeatability does not establish representative production GC
frequency. The flag does not preallocate 512 MiB; the existing 4096 MiB maximum
remains. See [V8's initial/minimum heap configuration](https://github.com/nodejs/node/blob/v24.8.0/deps/v8/src/heap/heap.cc#L5071).

The configuration preserves CodSpeed's incremental-marking task settings; the
additional `--no-incremental-marking-task` from the initial stabilization proposal
has been removed.

The flags are intentionally absent from ordinary Vitest timing and walltime runs.

Changing simulation compiler settings changes the measurement baseline. Compare
repeatability within each configuration before interpreting performance changes
between configurations as router improvements or regressions.

## Worker isolation

Keep one SSR workload in each `speed*.bench.ts` file. These projects explicitly
enable Vitest isolation; CodSpeed uses the forks pool, so every file receives a
fresh worker. Multiple workloads in one file share the worker's runtime state,
even though CodSpeed collects before each measurement. Later control cases
remained noisy after the runtime flag corrections. Running the React plain
dehydration and linked-CSS controls alone reduced their observed three-run spreads
to 0.09% and 0.02% respectively.

Variant files keep their workload names, request counts, concurrency, payloads
and assertions. CodSpeed includes the file path in a benchmark's identity, so
moved variants start a new history. The first workload keeps `speed.bench.ts`;
the additional variants have descriptive file names alongside it. Type-check
includes cover all of these files.

## Streaming workload

Deferred payloads in the SSR streaming scenario resolve after two task turns on
Node. A real 1 ms timer lets elapsed host time decide which concurrent requests
resolve together. Counted turns preserve the initial loading render and deferred
payloads; the existing HTML assertions check both. These benchmarks execute in
Node and use `setImmediate` directly.

## Repeatability checks

Dispatch the existing `Benchmarks` workflow against an unchanged branch:

```sh
gh workflow run client-nav-benchmarks.yml --ref <branch>
```

Wait for each workflow run to finish before dispatching the next repetition at
the same commit. The workflow also runs memory benchmarks; exclude those results
when assessing CPU repeatability. Check that every repetition has all expected
CPU results (currently 134), rather than inherited results from an earlier run.
Compare each benchmark's minimum and maximum across repetitions; keep input data,
navigation/request counts, builds, dependencies and Node version fixed when
testing runtime configuration changes.
