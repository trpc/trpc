# Changes in v11 in reverse chronological order

## 2024-01: created a `@trpc/core`-package

We moved a bunch of internals of `@trpc/server` to a new package called `@trpc/core` that is **not meant for public consumption**

- Please help us and have a look out after errors like _"The inferred type of 'createContext' cannot be named without a reference to [...]"_.
- If you are building a plugin or for some reason is importing something that isn't exported anymore, please open an issue on GitHub or open a conversation in [#v11-chats](https://discord.com/channels/867764511159091230/1057652120473575505) channel on Discord

## `useSuspenseQueries()`

https://github.com/trpc/trpc/pull/5226

## Refactor internal generics

We have refactored our internal generics and made them more readable (TODO: link procedure builder sauce)

## React is now >=18.2.0

Check their migration guide: https://react.dev/blog/2022/03/08/react-18-upgrade-guide

## Moved internal types to `@trpc/server/unstableInternalTypesExport`

We exported a bunch of utility functions that we used in tRPC within `@trpc/server`, these have now be moved to `@trpc/server/unstableInternalTypesExport`. Needless to say, you should not use those.

If you're making an adapter for tRPC, we're happy to move these to another export and ensure they don't break between minor versions.

Refactor: `inferAsyncReturnType<x>` -> `Awaited<ReturnType<x>>`

## `wsLink` improvements

- Ability to pass a `Promise` in the `url`-callback if servers switch location during deploys
- Added new `lazy` option that makes the websocket automatically disconnect when there are no pending requests

## `rawInput` in middleware is now a `getRawInput`

While we're not doing anything differently internally (just yet) this is help support a much requested feature in tRPC: content types other than JSON.

## Simplified types and `.d.ts` outputs

Procedures in your router now only emit their input & output - where before they would also contain the full context object for every procedure, leading to unnecessary complexity in e.g. `.d.ts`.

## React Query peerDep is now v5

Check their migration guide: https://tanstack.com/query/v5/docs/react/guides/migrating-to-v5

FIXME: Update our docs where applicable

- `defaultPageParam` -> `initialPageParam`
- [...]

## Exports names `AbcProxyXyz` has been renamed to `AbcXyz`

The proxy names were due to v9 using the `AbcXyz` names, these have been removed and the proxy ones have been renamed to the non-proxy names, e.g:

- `createTRPCClient` was deprecated from v9, and is now completely removed. The `createTRPCProxyClient` has been renamed to `createTRPCClient` instead. `createTRPCProxyClient` is now marked as deprecated.

## SSG Helpers

- `createSSGHelpers` were for v9 which has now been removed. the v10 equivalent `createProxySSGHelpers` have been renamed to `createSSGHelpers` now instead.
- `createProxySSGHelpers` is now deprecated but aliased to `createSSGHelpers` for backwards compatibility.
- Removed exported type `CreateSSGHelpersOptions`

## `.unstable_concat()` removed

## `interop`-mode has been removed

...
