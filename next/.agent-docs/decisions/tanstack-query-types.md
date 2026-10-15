# TanStack Query utils are typed from the client (agent)

- `TrpcQueryUtils<TClient>` maps the client's shape: `query` makes query helpers, `mutate` mutation helpers, `subscribe` subscription helpers. The same factory accepts `createTrpcClient(...)` in the browser and `createRouterClient(router, { ctx })` for server prefetching. Inputs, outputs, typed errors and link-declared `context` come from the client's call signatures.
- `error` is the procedure's error union, the same one the client sees; `DataTag` keys carry it into `getQueryData`/`setQueryData`.
- Returned options fit every adapter by omitting `enabled` and `initialData` from TanStack's input type. `enabled` comes back as `boolean`, because Vue and Svelte don't accept `(query) => boolean`. `initialData` only comes back from the defined-`initialData` overload, because Solid's overloads split on it. Input bags stay non-generic, so a misspelled option is still an excess-property error.
- `input: skipToken` gives `queryFn: skipToken`, but the returned `queryFn` stays typed as a `QueryFunction` so `useSuspenseQuery` still accepts the options. The key drops the input.
- `pathKey`, `pathFilter` and the helper names (`queryOptions`, `queryKey`, …) can't be procedure names. An unknown helper call throws a `TypeError`.
- Lost: router-typed utils, `createTrpcQueryUtils<AppRouter>({ client })`: redundant with the client's types, and blind to link context.
- Lives in: `packages/tanstack-query/src/utils.ts`.
