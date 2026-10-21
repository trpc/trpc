---
title: Should streamed queries and mutations keep answering with JSON Lines, now that the SSE spike is in?
summary: Streamed outputs are JSONL and subscriptions are SSE. The spike found SSE works for nested values but costs about 24% more bytes.
area: streaming
recommended: A
questions: [Q10.5]
links:
  - kind: spike
    label: sse-deferred
    url: ../../spikes/sse-deferred/
  - kind: note
    label: sse-nested-deferred (spike results)
    url: ../notes/sse-nested-deferred.md
  - kind: decision
    label: streamed-outputs-are-jsonl
    url: ../decisions/streamed-outputs-are-jsonl.md
  - kind: proposal
    label: 10 Wire protocol
    url: ../proposals/10-wire-protocol.md
  - kind: docs
    label: Streaming
    url: https://v12.trpc.io/v12/docs/server/streaming
  - kind: note
    label: durable-mid-stream-resume
    url: ../notes/durable-mid-stream-resume.md
---

# Should streamed queries and mutations keep answering with JSON Lines, now that the SSE spike is in?

## Why it matters

A query or mutation whose output holds async iterables, `Stream`s or promises answers with `application/jsonl`; subscriptions use SSE, and batches are JSONL too, so one decoder reads both. The human skipped this on 2026-10-16 ("I think nested promises etc might be a problem for sse but Spike it"), then said "Later" on 2026-10-17. The spike found nested deferred values are no problem for SSE (progressive JSON, plain JSON and `devalue-async` all flatten them into one frame per event), SSE costs about 1.24× the bytes, and `Last-Event-ID` resume needs the server to keep each call's frames. Nothing else waits on it.

## Options

### A) Keep JSON Lines and close the question

Nothing changes on the wire or in user code.

```http
content-type: application/jsonl

<head frame>
<chunk frame>
<chunk frame>
```

```ts twoslash
// ---cut-start---
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { z } from 'zod';
import { t } from './server.ts';
const router = {
  seats: {
    list: t.procedure
      .input(z.object({ show: z.number() }))
      .query(async function* () {
        yield { seat: 'A1' };
      }),
  },
};
const client = createTrpcClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: '/trpc' })],
});
declare function render(seat: { seat: string }): void;
// ---cut-end---
const seats = await client.seats.list.query({ show: 1 }); // httpLink reads JSONL
for await (const seat of seats) render(seat);
```

- ✅ Built; one decoder for batches and streams; what v11's `httpBatchStreamLink` sent
- ✅ `httpLink({ binary: true })` already offers a smaller framing for file bytes
- ❌ A streamed query can't be read with `EventSource`

### B) SSE for streamed queries and mutations

Same frames, each as an SSE event, so every streamed HTTP response is `text/event-stream`.

```http
content-type: text/event-stream

id: 0
data: <head frame>

id: 1
data: <chunk frame>
```

```ts twoslash
// ---cut-start---
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { z } from 'zod';
import { t } from './server.ts';
const router = {
  seats: {
    list: t.procedure
      .input(z.object({ show: z.number() }))
      .query(async function* () {
        yield { seat: 'A1' };
      }),
  },
};
const client = createTrpcClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: '/trpc' })],
});
declare function render(seat: { seat: string }): void;
// ---cut-end---
const seats = await client.seats.list.query({ show: 1 }); // same client code
for await (const seat of seats) render(seat);
```

- ✅ One streaming format with subscriptions; a streamed `GET` query can be read with `EventSource`
- ❌ About 24% more bytes (24,233 B vs 30,153 B for 200 items)
- ❌ Resume needs server-side frame storage per call; without it, SSE reconnects to nothing. Streamed mutations still read it with `fetch`, since `EventSource` only sends `GET`

### C) Leave it open

"Later" again.

```ts twoslash
// no change
```

- ✅ Nothing to do now
- ❌ It keeps coming back in every decision round, and the wire format should settle before 1.0

## Recommendation

**A.** SSE adds only reconnection, and that only with a per-call replay store; where resumable results matter, `durable()` is that store and the framing can stay JSONL with frame numbers. JSONL is built and smaller.

## Blocked until answered

- Nothing. B would change the handler's streamed content type, `httpLink`'s reader and the v12 protocol docs before 1.0.

## Details

- Spike: `next/spikes/sse-deferred/` (`sse.ts`, `sse.test.ts`, `measure.ts`); run `pnpm test` from `next/`, bytes with `node sse-deferred/measure.ts [items]` from `next/spikes/`. A real `EventSource` that drops its connection resumes with `Last-Event-ID` only with `createReplay` keeping the frames.
- The v11 interop keeps JSON Lines for `httpBatchStreamLink` whatever is picked here.
