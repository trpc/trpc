# Resuming a durable streamed output mid-stream

2026-10-16. Question (decision [durable-calls](../decisions/durable-calls.md)): `durable()` keeps successes and typed errors by call id, but not streamed outputs (async iterables, `Stream`s, promises). The human answered "Spike it" to making those resumable mid-stream. Can a retry with the same call id pick up where the connection dropped, on any instance?

Code: `next/spikes/durable-resume/`; run with `pnpm test` from `next/`. `effect` 4.0.2 (`effect/persistence`'s `layerBackingMemory`), Node 24.

## How it works

- `makeStreamLog()` needs `Persistence.BackingPersistence`, like `durable()` and `rateLimit()`, so any of Effect's stores work (memory, Redis, SQL, KeyValueStore).
- `start(key, serializer, run)` serializes the output once, with the async format (head, then a chunk per settled deferred value, at any depth). It runs in a detached fiber, so the output keeps streaming into the store after the caller leaves.
- Each frame is stored as `${key}:${i}`, and `${key}:meta` holds `{ count, done }`. That is two writes per frame (`setMany`).
- `read(key, from)` returns the stored frames from `from` on, then polls `meta` (every 20 ms by default) for new ones until `done`. A reader on another instance reads the same frames.
- A client keeps one deserializer for the call. When the connection drops after `n` frames, it asks again with the same call id and `from = n` and feeds the new frames into the same deserializer. Deferred values still open settle from the new connection.

```ts
const frames = Stream.concat(
  counted(a.read('call-1').pipe(Stream.take(2))), // instance A, cut after 2 frames
  Stream.unwrap(
    Effect.map(Ref.get(received), (from) => counted(b.read('call-1', from))),
  ),
);
const value = yield * serializer.deserializeStream(frames); // instance B finishes it
```

## Results

- Plain JSON and danSON: a feed with a streamed `items` iterable (each item with a deferred `author`) and a deferred `total`, cut after 2 frames on instance A, completes from instance B. The procedure ran once.
- With every reader gone after the head, the output still streams into the store; a later reader on another instance gets the whole value.
- A second `start` for the same key, on another instance, runs nothing.

## Findings

- Mid-stream resume works for nested deferred values because each frame is independent and indexed. The client only needs to count the frames it got. No format change.
- Wire shape if it lands: the retry carries `trpc-call-id` (as today) and a `trpc-resume-from: n` header; `durableLink` counts the frames and reconnects instead of retrying from scratch. JSONL stays the framing ([`sse-nested-deferred.md`](./sse-nested-deferred.md) found SSE adds nothing here).
- Costs: two store writes per frame and polling reads while the stream is open. A pub/sub-backed store (Redis) could push instead of poll; `BackingPersistence` has no notify.
- Same limits as `durable()`: no atomic claim in `BackingPersistence`, so two instances starting at once can both run; frames expire with the TTL, and a resume after that fails.
- It overlaps with the documented way to resume streamed work: a mutation that returns an id plus a `Publisher` channel subscribed with `lastEventId`. The log here is a replay buffer per call, which is what the Publisher backends already are.

## Lean

Landed, 2026-10-16 (human: "B - under experimental_"): in `experimental_durable()` and `experimental_durableLink`, with the HTTP handler writing the kept frames ([durable-calls](../decisions/durable-calls.md)). What follows was the lean before that.

Don't land it yet. It works and is small (one module on `BackingPersistence`), but it adds a second resume path next to Publisher channels. If it lands, it goes into `durable()` (streamed outputs go to the log instead of being skipped) and `durableLink` (count frames, resume with `trpc-resume-from`).
