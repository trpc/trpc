# Wire protocol: proposal 10 Option B (agent)

- HTTP, as 10 Option B, with these specifics:
  - Bodies keep danSON's `{ json, refs? }` wrapper.
  - Queries are `GET` with legible params (QP-C), falling back to `POST` above `maxURLLength`. Mutations require `POST` with `content-type: application/json`, which is the CSRF guard.
  - Errors are `{ error: { code, message, data, defined } }` with the error's status.
  - Batching is `POST {base}` with `trpc-batch: 1`, answered with JSONL in completion order: `{ i, status, body }`, plus `{ i, chunk }` for deferred values.
  - Deferred values (a `Promise` or `AsyncIterable` nested in an output) stream as JSONL in danSON's async format. The server only switches to JSONL when an output contains one, so plain responses stay `application/json`.
  - `trpc-version: 1` on requests and responses; a mismatch is `UNSUPPORTED_PROTOCOL` (400).
  - Subscriptions are SSE ([`fetch-sse.md`](./fetch-sse.md)).
- WebSocket and MessagePort: JSON messages, many calls over one connection.
  - The client first sends `{ type: 'init', version, connectionParams? }`.
  - Calls are `{ id, type: 'request', method, path, input?, lastEventId? }` and `{ id, type: 'abort' }`.
  - The server answers with `result` (`deferred: true` when chunks follow), `event` (`eventId?`, `deferred?`), `chunk`, `chunkEnd`, `done`, and `error { id | null, status, body }`.
  - A version mismatch is an `id: null` error and close code 1002. Bodies use the endpoint's serializer.
- Open: drop the `{ json }` wrapper.
- Lives in: `packages/trpcdev/src/internal/protocol.ts`, `src/server/fetch.ts`, `src/server/socket.ts`, `src/client/links/http.ts`, `src/client/links/socket.ts`.
