# An error's `_tag` is its code (human)

- Alex, 2026-10-15 (decisions round 3, Q5): "A".
- Every `TrpcError` has `_tag` equal to its `code`, so `Effect.catchTag('NOT_FOUND', …)` and `Effect.catchTags({ … })` work on the server and with the Effect client, and handled codes leave the error union.
- Why: it's how Effect users narrow failures; screaming-case codes don't clash with their `PascalCase` tags.
- Lost: one tag for "any tRPC error" (`isTrpcError()` still covers that).
- Lives in: `packages/trpcdev/src/internal/error.ts`; `test/integration/errors.test.ts`.
