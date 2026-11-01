# Framework control-flow errors pass through in-process calls (agent)

- When a call's error wraps a cause with a string `digest` (Next's `redirect()`, `notFound()`, dynamic-API bailouts), `createAction`, `createCallable`, `t.call()` and the promise client (so `createRouterClient` and `localLink`) rethrow the cause.
- `createTrpcRsc`'s `HydrationBoundary` doesn't redact errors with a `digest` (#6771), unless the query client sets `shouldRedactErrors`.
- Why: this covers proposal 15 (c)'s `rethrow: isNextControlFlowError` with no option and no Next import.
- Lost: an `onError` hook that sees redirects.
- Lives in: `packages/trpc/src/internal/error.ts`, `src/actions/`, `src/client/client.ts`, `src/server/caller.ts`, `packages/tanstack-react-query/src/rsc.ts`.
