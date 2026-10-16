# Benchmarks

Read the relevant README before running benchmarks. Compare baseline and candidate with the same workload and production builds; add a focused case when existing scenarios miss the changed mechanism. Keep workloads and benchmark names stable for historical comparisons.

| Changed behavior                           | Guide                              | Nx project                                               |
| ------------------------------------------ | ---------------------------------- | -------------------------------------------------------- |
| Standalone Router navigation/rendering CPU | [client-nav](client-nav/README.md) | `@benchmarks/client-nav`                                 |
| Start request/SSR CPU                      | [ssr](ssr/README.md)               | `@benchmarks/ssr`                                        |
| Client/server retention and allocations    | [memory](memory/README.md)         | `@benchmarks/memory-client`, `@benchmarks/memory-server` |

Use `test:perf:<react|solid|vue>` through Nx. Plain memory runs only smoke-test; memory metrics require CodSpeed. Client navigation benchmarks do not cover Start hydration or client server-function calls.

For bundle-size work, follow the full optimization skill required by the root guide. Full API fixtures are maintained manually: when public hooks/components change, update matching `bundle-size/scenarios/*-full/src/routes/__root.tsx` fixtures. Save baseline results separately because each run overwrites `bundle-size/results/current.json`; report final gzip deltas and explain remaining growth.
