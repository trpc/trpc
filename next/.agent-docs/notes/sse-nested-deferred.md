# Nested deferred values over SSE (danSON, plain JSON, devalue-async)

2026-10-16. Question (decision [streamed-outputs-are-jsonl](../decisions/streamed-outputs-are-jsonl.md)): the human suspected "nested promises etc might be a problem for sse". Do streamed outputs with deferred values at any depth work as SSE, and what do danSON and `devalue-async` do?

Code: `next/spikes/sse-deferred/`; run with `pnpm test` from `next/`, bytes with `node sse-deferred/measure.ts [items]` from `next/spikes/`. `effect` 4.0.2, `devalue-async` 0.7.2 (`devalue` 5.9.4), `undici` 8.11.2's `EventSource`, Node 24.

The value under test: a post whose `comments` iterable yields comments with a deferred `author` and a `replies` iterable that yields an object holding a promise, plus a deferred `total`. That is three levels of deferred values inside each other.

## How the formats frame deferred values

- @trpc12/trpc's async format (the danSON port, and plain JSON's head `d` slots) is a head frame, then `[index, status, value]` chunks as each deferred value settles. A deferred value inside a chunk gets a new index while that chunk is serialized.
- `devalue-async` is the same shape: a head line, then `[index, status, flattened]` lines. Its reducers register nested promises, iterables and `ReadableStream`s during the same `stringify` call, so nothing is walked twice. danSON does the same. This is the "shorter path" the human mentioned.
- Each frame is one line of JSON with no newlines in it, so one frame is one SSE event (`id: n\ndata: <frame>\n\n`). Nothing about nesting depends on the framing.

## Results

- Plain JSON and danSON: the value round-trips over SSE (`toSse` → `parseSse` → `deserializeStream`), every level settles.
- `devalue-async`: its lines carried as SSE events and fed back to `parseAsync` give the same value.
- Bytes: SSE costs about 1.24x JSONL for small objects (24,233 B vs 30,153 B for 200 items; the same ratio at 20 items, and for danSON). That is `id: n\ndata: ` and the blank line per frame.
- A dropped connection rejects the deferred values still open ("the SSE stream ended early"), as JSONL does.
- Resume is the real problem. `Last-Event-ID` names the last frame that arrived, but deferred values can't be re-created from an id: re-running the procedure gives new promises and a new head. Resuming needs the server to keep the call's frames. With `createReplay` (one serialization, frames kept in memory, readers get the kept frames after the id and then the live ones), a real `EventSource` that loses its connection after a few frames reconnects with `Last-Event-ID` and the value completes.

## Findings

- Nested deferred values are not a problem for SSE. The format already flattens them into independent frames.
- What SSE would add for streamed queries is reconnection, and that only works with per-call server state (a replay buffer kept until the stream ends, in memory or a store). That is the same mechanism a durable streamed output needs ([`durable-mid-stream-resume.md`](./durable-mid-stream-resume.md)).
- `EventSource` only sends `GET`, so streamed mutations would read SSE with `fetch`, as `httpLink` reads JSONL today.

## Lean

Keep JSONL for streamed queries and mutations as decided: SSE costs about a quarter more bytes, and gives nothing without a replay. If resumable streamed outputs come, they come from the replay store, and the framing can stay JSONL with frame numbers.
