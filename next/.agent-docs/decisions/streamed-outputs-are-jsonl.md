# Queries and mutations that return streams answer with JSONL; subscriptions use SSE (agent)

- Answers Q10.5 (proposal 10), unanswered by a human: a query or mutation whose output is (or contains) an async iterable, a `Stream` or a promise streams as `application/jsonl`; subscriptions are SSE ([`fetch-sse.md`](./fetch-sse.md)). Batches are JSONL too, so one decoder reads both ([`wire-protocol.md`](./wire-protocol.md)).
- Why: JSONL carries progressive JSON's chunk references and batch frames as plain lines, needs no event names, and is what v11's `httpBatchStreamLink` sent. SSE's reconnect semantics (`Last-Event-ID`) only matter for subscriptions.
- Lost: reading a streamed query with `EventSource`.
- (agent) Skipped in the decision round, 2026-10-16; chose JSONL because it is built, one decoder reads batches and streams, and SSE gains nothing for non-subscriptions. The human's words: "Skip... I think nested promises etc might be a problem for sse but Spike it. Maybe danson or my devalue-async package did something here". So a spike of nested deferred values over SSE, checking progressive JSON and `devalue-async`.
- (agent) Spiked, 2026-10-16 ([`../notes/sse-nested-deferred.md`](../notes/sse-nested-deferred.md)): nested deferred values are no problem for SSE. Progressive JSON, plain JSON and `devalue-async` all flatten them into indexed frames in one pass, one frame per event. SSE costs about 1.24x the bytes of JSONL, and `Last-Event-ID` resume needs the server to keep the call's frames. Still JSONL.
- Human, 2026-10-17 (decision round, whether the spike changes the answer): "Later". Still JSONL.
- Open (human): JSONL or SSE for streamed queries and mutations, now that the spike is in.
- Lives in: `packages/trpc/src/server/handler/fetch.ts` (`CONTENT_TYPE.jsonl`), `src/client/links/http.ts`; tests in `packages/trpc/src/client/links/http.test.ts`.
