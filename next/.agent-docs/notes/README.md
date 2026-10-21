# Notes

Agent-written working notes: research, spike results, benchmarks and anything worth remembering that is not a proposal or a decision.

- One topic per file: `<topic>.md`, starting with the date and the question being answered.
- Record what was measured and how (commands, versions), so it can be re-run.
- Link the note from the proposal it informs.
- Search here (`rg -n "<topic>" .agent-docs/`) before researching something again.

## Index

Notes whose spike's feature shipped were deleted with the spike; they and their code are at [`d5c34c430`](https://github.com/trpc/trpc/tree/d5c34c43000547776ca234ac47edafd48370e6fd/next/.agent-docs/notes). MCP tools, which shipped as `@trpc12/trpc/mcp`, is at [`2f791c3d4`](https://github.com/trpc/trpc/blob/2f791c3d4140f07a6ff55fd21e318a8391887726/next/.agent-docs/notes/mcp-tools.md).

| Note                                                                      | Feeds      | Code (`next/spikes/`) |
| ------------------------------------------------------------------------- | ---------- | --------------------- |
| [Open trpc/trpc issues](./open-issues-review.md)                          | all        |                       |
| [Interruptible streamed mutations](./interruptible-streamed-mutations.md) | 19         |                       |
| [Declared invalidation plugin](./invalidation-plugin.md)                  | 19         | `invalidation/`       |
| [Nested deferred values over SSE](./sse-nested-deferred.md)               | 19         | `sse-deferred/`       |
| [Durable mid-stream resume](./durable-mid-stream-resume.md)               | 19         | `durable-resume/`     |
| [Client bundle anatomy](./client-bundle-anatomy.md)                       | 02 (g), 17 | `client-bundle/`      |
| [Benchmarks against v11 and oRPC](./benchmarks.md)                        | all        | `tooling/bench/`      |
| [Live queries and TanStack DB](./live-queries.md)                         | 26         | `live-queries/`       |
| [Large routers typeperf](./large-routers-typeperf.md)                     | 01, 08, 16 | `big-routers/`        |
| [Layered services and strictness](./layered-services-and-strictness.md)   | 27, 02     | `layered-services/`   |
| [Type-check cost by procedure shape](./type-check-shapes.md)              | 01, 08     | `tooling/bench/`      |
