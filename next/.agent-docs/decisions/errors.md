# One `TRPCError`, inferred and declared errors (agent)

- Proposal 07's combined model. One isomorphic `TRPCError` class (Q7.7), the same on server and client, built on Effect's `Data.Error` so it is yieldable, with `code`, `status`, `data` and `defined`.
- `error({ code, data?, message?, status? })` constructs one. Returned or failed `TRPCError`s are inferred into the procedure's error union.
- Declared errors (07 A): `.errors({ NOT_FOUND: { status?, message?, data?: schema } })` gives the resolver a typed constructor per code. Errors from these constructors are `defined` even when thrown from helper code; a WeakSet records them. `data` is validated, and invalid data is an unexpected error because sending it would break the client's types.
- Q7.3: `safe()` returns `[data, error]` that also has `{ data, error }` properties, so both destructuring styles work.
- Masking is [`mask-unexpected-errors.md`](./mask-unexpected-errors.md).
- Lives in: `packages/trpcdev/src/internal/error.ts`, `src/server/declared.ts`, `test/integration/errors.test.ts`.
