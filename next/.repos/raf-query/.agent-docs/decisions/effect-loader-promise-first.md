# Effect loaders stay on Promise verbs (human asked)

- Human: wrapping every loader in `queryClient.runPromise(Effect.gen(function* () { const cache = yield* QueryCache; … }))` felt second-tier and not how Effect is meant to look.
- **Promise-first for loaders**: `prefetch` / `ensure` / `fetch` on `QueryClient` already speak Promises and already run with the layer's services. A list page that only prefetches looks identical to the non-Effect examples.
- **`runPromise` only when the loader itself needs Effect**: a typed `catchTag`, or `yield*` of a service / the cache. The shape for that is in [effect-loader-effect-fn.md](./effect-loader-effect-fn.md).
- Form actions stay as `Effect.fn` + `runPromise`: they need both the app service and `QueryCache.invalidate`.
- Docs (`effect.md`, `effect-errors.md`) and the Effect example were teaching the gen wrapper; fixed to the Promise-first shape. `ErrorOf` / `ServicesOf` stay the way query error and service types are named (already inferred; the example now exports them).
