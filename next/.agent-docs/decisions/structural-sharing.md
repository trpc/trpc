# Structural sharing that knows danSON types (agent)

- `queryOptions()` and `infiniteOptions()` set `structuralSharing` to a version of TanStack's `replaceEqualDeep` that also keeps equal `Date`, `Map`, `Set`, `URL`, `RegExp` and typed-array values (#6306). A `structuralSharing` passed in wins. It's exported for queries outside tRPC.
- Why: without it, every refetch of danSON data re-rendered.
- Lost: per-entry sharing inside `Map` and `Set` (they are shared all or nothing).
- Lives in: `packages/tanstack-query/src/sharing.ts`, `src/utils.ts`.
