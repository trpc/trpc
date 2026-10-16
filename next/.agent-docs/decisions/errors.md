# One `TrpcError`, inferred and declared errors, no formatter (human)

- Human, 2026-10-15 (Q7.7): "A". One isomorphic `TrpcError` class, the same on server and client, with `code`, `status`, `data` and `defined`. No `TrpcClientError`.
- Human, 2026-10-15 (Q7.6): "A". No global `errorFormatter`. Logging goes to the handler's `onError`; shape changes are mapping middleware, whose returned errors the client infers.
- Why: the same checks work in resolvers, tests and the client, and every error shape is typed.
- Lost: v11's `TRPCClientError` wrapper and its untyped `errorFormatter`.
- (agent, Q7.1) Proposal 07's combined model. `TrpcError` is built on Effect's `Data.Error`, so it is yieldable. `error({ code, data?, message?, status? })` constructs one; returned or failed errors are inferred into the procedure's error union.
- (agent) Declared errors (07 A): `.errors({ NOT_FOUND: { status?, message?, data?: schema } })` gives the resolver a typed constructor per code. Errors from these constructors are `defined` even when thrown from helper code; a WeakSet records them. `data` is validated, and invalid data is an unexpected error because sending it would break the client's types.
- (agent, Q7.3) `safe()` returns `[data, error]` that also has `{ data, error }` properties, so both destructuring styles work.
- (agent, Q16.4; human: "Revisit later. Pick something for now") Client-side failures are new codes in the same union (`NETWORK_ERROR`, `CLIENT_CLOSED_REQUEST`), not a flag.
- Masking is [`mask-unexpected-errors.md`](./mask-unexpected-errors.md).
- (agent) The Open here (tag errors by code for `Effect.catchTag`) is done: [`error-tags.md`](./error-tags.md).
- Lives in: `packages/trpc/src/internal/error.ts`, `src/server/declared.ts`, `test/integration/errors.test.ts`.
