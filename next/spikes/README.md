# Spikes

Throwaway experiments that feed proposals in `../.agent-docs/proposals/`. Nothing here is public API, and nothing here should be imported by `packages/`. Each spike's method and numbers are written up in `../.agent-docs/notes/`.

A spike whose feature shipped in `packages/` keeps its code and note but loses its tests, which the package's own tests replace; git has them.

Generated fixtures and build output (`generated/`, `dist/`) are gitignored; the source and scripts that produce them are committed.

Scripts are Effect programs on `kit.ts`: `writeFixture` writes a generated fixture, `tscDiagnostics` and `medianDiagnostics` run `tsc --extendedDiagnostics`, `tscBuild` times a `tsc -b --force`, `variantBench` is the shared per-variant typecheck bench, and `runScript` runs an `effect/cli` command (each script takes `--help`).

| Directory               | Run (from here)                                                 | Note                                                                                 |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `builder-generics/`     | `pnpm typeperf [n] [runs]`                                      | [builder-generics-typeperf](../.agent-docs/notes/builder-generics-typeperf.md)       |
| `link-options/`         | `node link-options/bench.ts`                                    | [link-call-options-typing](../.agent-docs/notes/link-call-options-typing.md)         |
| `danson/`               | `pnpm test` (root), `node danson/compare.ts`                    | [danson-port-and-query-params](../.agent-docs/notes/danson-port-and-query-params.md) |
| `effect-bundle/`        | `pnpm bundle`                                                   | [effect-client-bundle-size](../.agent-docs/notes/effect-client-bundle-size.md)       |
| `returned-errors/`      | `node returned-errors/bench.ts [n] [runs]`                      | [returned-error-inference](../.agent-docs/notes/returned-error-inference.md)         |
| `middleware-typing/`    |                                                                 | [middleware-and-input-typing](../.agent-docs/notes/middleware-and-input-typing.md)   |
| `effect-services/`      | `node effect-services/bench.ts [n] [runs]`                      | [effect-services-typing](../.agent-docs/notes/effect-services-typing.md)             |
| `contracts/`            | `node contracts/bench.ts [n] [runs]`                            | [contracts-and-routers-typing](../.agent-docs/notes/contracts-and-routers-typing.md) |
| `tanstack-options/`     |                                                                 | [tanstack-options-typing](../.agent-docs/notes/tanstack-options-typing.md)           |
| `context-aware-input/`  | `node context-aware-input/bench.ts [n]`                         | [context-aware-inputs](../.agent-docs/notes/context-aware-inputs.md)                 |
| `concat-plugins/`       |                                                                 | [concat-plugins](../.agent-docs/notes/concat-plugins.md)                             |
| `use-overloads/`        |                                                                 | [use-overloads](../.agent-docs/notes/use-overloads.md)                               |
| `cache-link/`           |                                                                 | [react-use-spikes](../.agent-docs/notes/react-use-spikes.md)                         |
| `atom-trpc/`            |                                                                 | [react-use-spikes](../.agent-docs/notes/react-use-spikes.md)                         |
| `invalidation/`         | `pnpm test` (root)                                              | [invalidation-plugin](../.agent-docs/notes/invalidation-plugin.md)                   |
| `sse-deferred/`         | `pnpm test` (root), `node sse-deferred/measure.ts [items]`      | [sse-nested-deferred](../.agent-docs/notes/sse-nested-deferred.md)                   |
| `durable-resume/`       | `pnpm test` (root)                                              | [durable-mid-stream-resume](../.agent-docs/notes/durable-mid-stream-resume.md)       |
| `closed-errors/`        |                                                                 | [closed-error-unions](../.agent-docs/notes/closed-error-unions.md)                   |
| `error-shells/`         | `pnpm test` (root)                                              | [error-shells](../.agent-docs/notes/error-shells.md)                                 |
| `mcp/`                  | `pnpm test` (root), `node mcp/serve.ts [--port 3333]`           | [mcp-tools](../.agent-docs/notes/mcp-tools.md)                                       |
| `tanstack-db-realtime/` | `pnpm test` (root)                                              | [tanstack-db-realtime](../.agent-docs/notes/tanstack-db-realtime.md)                 |
| `live-queries/`         | `pnpm test` (root)                                              | [live-queries](../.agent-docs/notes/live-queries.md)                                 |
| `big-routers/`          | `node big-routers/bench.ts [domains] [perDomain] [used] [runs]` | [large-routers-typeperf](../.agent-docs/notes/large-routers-typeperf.md)             |
