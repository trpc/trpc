# The client is typed from `routerType<T>()` (agent)

- CS-A: `query(input, { signal, context })`, `mutate(…)`, and `subscribe(input, { signal, lastEventId })` returning an `AsyncIterable`.
- D-C: `createTRPCClient({ router: routerType<AppRouter>(), links })` also infers the `context` fields the links declare. `router:` takes a contract or a `toContract()` value too. The explicit generic `createTRPCClient<AppRouter>({ links })` still works, with only the open `TRPCClientContext` interface.
- The carrier is `routerType<T>()`, not proposal 17's `type<T>()`, which [`validation.md`](./validation.md) bans. `routerType` names what it carries and can't be mistaken for a validator.
- `createEffectClient` in `trpcdev/effect` returns an `Effect` per call (a `Stream` for subscriptions) and takes `router:` too.
- Outputs are typed as `Deserialized<Output>`: generators become `AsyncIterable`s and thenables `Promise`s at any depth; built-ins (`Date`, `Map`, `URL`, …) are left alone. Custom serializer types are mapped structurally, so methods stay but private fields are lost.
- Lives in: `packages/trpcdev/src/client/client.ts`, `types.ts`, `src/effect/index.ts`, `src/internal/types.ts`.
