# Spikes

Throwaway experiments that feed proposals in `../.agent-docs/proposals/`. Nothing here is public API, and nothing here should be imported by `packages/`. Each spike's method and numbers are written up in `../.agent-docs/notes/`.

Generated fixtures and build output (`generated/`, `dist/`) are gitignored; the source and scripts that produce them are committed.

| Directory              | Run (from here)                                                | Note                                                                                 |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `builder-generics/`    | `pnpm typeperf [n] [runs]`                                     | [builder-generics-typeperf](../.agent-docs/notes/builder-generics-typeperf.md)       |
| `link-options/`        | `pnpm test` (root), `node link-options/bench.ts`               | [link-call-options-typing](../.agent-docs/notes/link-call-options-typing.md)         |
| `danson/`              | `pnpm test` (root), `node danson/compare.ts`                   | [danson-port-and-query-params](../.agent-docs/notes/danson-port-and-query-params.md) |
| `effect-bundle/`       | `pnpm bundle`                                                  | [effect-client-bundle-size](../.agent-docs/notes/effect-client-bundle-size.md)       |
| `returned-errors/`     | `pnpm test` (root), `node returned-errors/bench.ts [n] [runs]` | [returned-error-inference](../.agent-docs/notes/returned-error-inference.md)         |
| `middleware-typing/`   | `pnpm test` (root)                                             | [middleware-and-input-typing](../.agent-docs/notes/middleware-and-input-typing.md)   |
| `effect-services/`     | `pnpm test` (root), `node effect-services/bench.ts [n] [runs]` | [effect-services-typing](../.agent-docs/notes/effect-services-typing.md)             |
| `contracts/`           | `pnpm test` (root), `node contracts/bench.ts [n] [runs]`       | [contracts-and-routers-typing](../.agent-docs/notes/contracts-and-routers-typing.md) |
| `tanstack-options/`    | `pnpm test` (root)                                             | [tanstack-options-typing](../.agent-docs/notes/tanstack-options-typing.md)           |
| `context-aware-input/` | `pnpm test` (root), `node context-aware-input/bench.ts [n]`    | [context-aware-inputs](../.agent-docs/notes/context-aware-inputs.md)                 |
| `concat-plugins/`      | `pnpm test` (root)                                             | [concat-plugins](../.agent-docs/notes/concat-plugins.md)                             |
| `cache-link/`          | `pnpm test` (root)                                             | [react-use-spikes](../.agent-docs/notes/react-use-spikes.md)                         |
| `atom-trpc/`           | `pnpm test` (root)                                             | [react-use-spikes](../.agent-docs/notes/react-use-spikes.md)                         |
