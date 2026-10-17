# Untyped stream failures are `TrpcError`s (human)

- Human, 2026-10-16 (decisions round 3, Q24): "B".
- [`framework-control-flow-errors.md`](./framework-control-flow-errors.md), [`structural-sharing.md`](./structural-sharing.md) and [`stream-abort-errors.md`](./stream-abort-errors.md) stand, except for the error type of untyped stream failures:
  - A stream source that fails with something other than a typed error: `TrpcError` `INTERNAL_SERVER_ERROR`, message masked in production like any unexpected error, cause kept on the server.
  - A stream that stops with no failure (a dropped connection, a truncated body): `TrpcError` `STREAM_INTERRUPTED`.
- Typed errors still arrive as is, and aborting the call's `signal` still rejects with `CLIENT_CLOSED_REQUEST`.
- (agent) The code is what matters mid-stream; the HTTP status was already sent. `STREAM_INTERRUPTED` is a client-side code, so `Effect.catchTag('STREAM_INTERRUPTED', …)` works ([`error-tags.md`](./error-tags.md)).
- Why: the error type no longer depends on the serializer ([`replaceable-serializers.md`](./replaceable-serializers.md)), and callers narrow stream failures like any other error.
- Lost: `DansonError` as a distinct stream-failure type.
- Lives in: `packages/trpc/src/serializer/stream.ts` (`streamFailed`, `streamInterrupted` options), `src/internal/error.ts` (`streamErrors`, passed by every client link); `packages/trpc/src/client/links/http.test.ts`.
