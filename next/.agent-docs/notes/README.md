# Notes

Agent-written working notes: research, spike results, benchmarks and anything worth remembering that is not a proposal or a decision.

- One topic per file: `<topic>.md`, starting with the date and the question being answered.
- Record what was measured and how (commands, versions), so it can be re-run.
- Link the note from the proposal it informs.
- Search here (`rg -n "<topic>" .agent-docs/`) before researching something again.

## Index

| Note                                                                      | Feeds      | Code (`next/spikes/`)       |
| ------------------------------------------------------------------------- | ---------- | --------------------------- |
| [Builder generics typeperf](./builder-generics-typeperf.md)               | 03         | `builder-generics/`         |
| [Link-informed call options typing](./link-call-options-typing.md)        | 17         | `link-options/`             |
| [danSON port + QP-C query params](./danson-port-and-query-params.md)      | 11         | `danson/`                   |
| [Effect client bundle size](./effect-client-bundle-size.md)               | 02 (g)     | `effect-bundle/`            |
| [Returned-error inference](./returned-error-inference.md)                 | 07, 02     | `returned-errors/`          |
| [Middleware and input typing](./middleware-and-input-typing.md)           | 05, 06     | `middleware-typing/`        |
| [Effect services: S1 vs S2](./effect-services-typing.md)                  | 02, 06     | `effect-services/`          |
| [Contracts and routers typing](./contracts-and-routers-typing.md)         | 09, 08     | `contracts/`                |
| [TanStack Query option-bag typing](./tanstack-options-typing.md)          | 19         | `tanstack-options/`         |
| [Context-aware inputs](./context-aware-inputs.md)                         | 05 (d)     | `context-aware-input/`      |
| [Plugins via `.concat()`](./concat-plugins.md)                            | 06 (e), 03 | `concat-plugins/`           |
| [Open trpc/trpc issues](./open-issues-review.md)                          | all        |                             |
| [Interruptible streamed mutations](./interruptible-streamed-mutations.md) | 19         |                             |
| [`use()`: link cache vs Effect atoms](./react-use-spikes.md)              | 20         | `cache-link/`, `atom-trpc/` |
| [Declared invalidation plugin](./invalidation-plugin.md)                  | 19         | `invalidation/`             |
| [Nested deferred values over SSE](./sse-nested-deferred.md)               | 19         | `sse-deferred/`             |
| [Durable mid-stream resume](./durable-mid-stream-resume.md)               | 19         | `durable-resume/`           |
| [Benchmarks against v11 and oRPC](./benchmarks.md)                        | all        | `tooling/bench/`            |
| [MCP tools](./mcp-tools.md)                                               | 25         | `mcp/`                      |
