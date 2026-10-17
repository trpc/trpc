# QueryClient.runPromise runs an app's Effects (agent)

- `queryClient.runPromise(effect)` runs an Effect that needs `QueryCache` and the client's `TServices`, like `Effect.runPromise`: it rejects with the failure, or the defect. For loaders and form actions in Effect apps, which need both the cache and the layer's services (an RPC client).
- The client keeps the built context in a private `#context: Context<never>`. It's typed `never`, not `QueryCache | TServices`, because a public field with `TServices` in it would make `QueryClient<never>` unassignable to `QueryClient<unknown>` (hooks and providers take the latter). Methods are bivariant, so `runPromise` keeps the clients mutually assignable.
- The cache layer is `Layer.provideMerge(cache, config.layer)`, so the context holds the layer's services as well as the cache.
- Lost: a public `context` property (breaks assignability); making apps build their own `ManagedRuntime` beside the client (two copies of the layer's services).
- Lives in `packages/core/src/client.ts`; docs in `www/content/effect-services.md` and `effect-errors.md`.
