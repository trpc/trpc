# Streamed mutations in TanStack Query (human)

- Alex, 2026-10-15 (issues review Q7, #5846): "A) we probably want some way of having them interruptable too so we could return a subscription, do some spike on that".
- `streamedMutationOptions()` collects a mutation's `AsyncIterable` output into `data` and re-renders as chunks arrive.
- (agent) The chunks so far live in the query cache at `streamedMutationKey()` (read with `chunksOptions()`), and `data` is set when the stream ends. Why: TanStack has no public way to update a pending mutation's data.
- Open: interruptible streamed mutations (aborting the server generator on `reset()` or unmount, or a mutation that hands back a subscription-like stream). Spike: [`../notes/interruptible-streamed-mutations.md`](../notes/interruptible-streamed-mutations.md).
- Lives in: `packages/tanstack-query/src/utils.ts`.
