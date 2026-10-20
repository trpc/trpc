# Spikes

Throwaway experiments that feed proposals in `../.agent-docs/proposals/`. Nothing here is public API, and nothing here should be imported by `packages/`. Each spike's method and numbers are written up in `../.agent-docs/notes/`.

A spike whose feature shipped in `packages/` is deleted with its note; the package's own code and tests replace it. The ones deleted so far are at [`d5c34c430`](https://github.com/trpc/trpc/tree/d5c34c43000547776ca234ac47edafd48370e6fd/next/spikes). `closed-errors/` stays while `error-shells/` imports it.

Generated fixtures and build output (`generated/`, `dist/`) are gitignored; the source and scripts that produce them are committed.

Scripts are Effect programs on `kit.ts`: `writeFixture` writes a generated fixture, `tscDiagnostics` and `medianDiagnostics` run `tsc --extendedDiagnostics`, `tscBuild` times a `tsc -b --force`, `variantBench` is the shared per-variant typecheck bench, and `runScript` runs an `effect/cli` command (each script takes `--help`).

| Directory               | Run (from here)                                                 | Note                                                                           |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `invalidation/`         | `pnpm test` (root)                                              | [invalidation-plugin](../.agent-docs/notes/invalidation-plugin.md)             |
| `sse-deferred/`         | `pnpm test` (root), `node sse-deferred/measure.ts [items]`      | [sse-nested-deferred](../.agent-docs/notes/sse-nested-deferred.md)             |
| `durable-resume/`       | `pnpm test` (root)                                              | [durable-mid-stream-resume](../.agent-docs/notes/durable-mid-stream-resume.md) |
| `closed-errors/`        |                                                                 | [closed-error-unions](../.agent-docs/notes/closed-error-unions.md)             |
| `error-shells/`         | `pnpm test` (root)                                              | [error-shells](../.agent-docs/notes/error-shells.md)                           |
| `mcp/`                  | `pnpm test` (root), `node mcp/serve.ts [--port 3333]`           | [mcp-tools](../.agent-docs/notes/mcp-tools.md)                                 |
| `tanstack-db-realtime/` | `pnpm test` (root)                                              | [tanstack-db-realtime](../.agent-docs/notes/tanstack-db-realtime.md)           |
| `live-queries/`         | `pnpm test` (root)                                              | [live-queries](../.agent-docs/notes/live-queries.md)                           |
| `big-routers/`          | `node big-routers/bench.ts [domains] [perDomain] [used] [runs]` | [large-routers-typeperf](../.agent-docs/notes/large-routers-typeperf.md)       |
