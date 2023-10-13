# Changes in v11

- `.unstable_concat()` removed

## `interop`-mode has been removed

...

## SSG Helpers

- `createSSGHelpers` were for v9 which has now been removed. the v10 equivalent `createProxySSGHelpers` have been renamed to `createSSGHelpers` now instead.
- `createProxySSGHelpers` is now deprecated but aliased to `createSSGHelpers` for backwards compatibility.
- Removed exported type `CreateSSGHelpersOptions`

## React Query peerDep is now v5

Check their migration guide: https://tanstack.com/query/v5/docs/react/guides/migrating-to-v5

FIXME: Update our docs where applicable

- `defaultPageParam` -> `initialPageParam`
- [...]

## `rawInput` in middleware is now a `getRawInput`

While we're not doing anything differently internally (just yet) this is help support a much requested feature in tRPC: content types other than JSON.

## trpc.useContext hook is renamed to trpc.useUtils

useContext has been deprecated in favour of calling it useUtils, this is because useContext is a loaded term in React, and we also refer to this value as tRPC "Utils" everywhere in docs, types and variable usage.

## Simplified types and `.d.ts` outputs

Procedures in your router now only emit their input & output - where before they would also contain the full context object for every procedure, leading to unnecessary complexity in e.g. `.d.ts`.
