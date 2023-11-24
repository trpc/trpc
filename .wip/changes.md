# Changes in v11

- `.unstable_concat()` removed

## `interop`-mode has been removed

...

## SSG Helpers

- `createSSGHelpers` were for v9 which has now been removed. the v10 equivalent `createProxySSGHelpers` have been renamed to `createSSGHelpers` now instead.
- `createProxySSGHelpers` is now deprecated but aliased to `createSSGHelpers` for backwards compatibility.
- Removed exported type `CreateSSGHelpersOptions`

## Exports names `AbcProxyXyz` has been renamed to `AbcXyz`

The proxy names were due to v9 using the `AbcXyz` names, these have been removed and the proxy ones have been renamed to the non-proxy names, e.g:

- `createTRPCClient` was deprecated from v9, and is now completely removed. The `createTRPCProxyClient` has been renamed to `createTRPCClient` instead. `createTRPCProxyClient` is now marked as deprecated.

## React Query peerDep is now v5

Check their migration guide: https://tanstack.com/query/v5/docs/react/guides/migrating-to-v5

FIXME: Update our docs where applicable

- `defaultPageParam` -> `initialPageParam`
- [...]

## `rawInput` in middleware is now a `getRawInput`

While we're not doing anything differently internally (just yet) this is help support a much requested feature in tRPC: content types other than JSON.

## Simplified types and `.d.ts` outputs

Procedures in your router now only emit their input & output - where before they would also contain the full context object for every procedure, leading to unnecessary complexity in e.g. `.d.ts`.

## `wsLink` improvements

- Ability to pass a `Promise` in the `url`-callback if servers switch location during deploys
- Added new `lazy` option that makes the websocket automatically disconnect when there are no pending requests

## Moved internal types

We moved a bunch of utility functions and type helpers that we use within the different tRPC packages from the root entries `@trpc/server`, these have now be moved to `@trpc/server/unstableInternalsExport`.

If you're making an adapter for tRPC, we're happy to move these to another export and ensure they don't break between minor versions.
