# Actions come from a factory in `@trpc12/trpc/actions`; RSC helpers are a subpath (human)

- Human, 2026-10-15 (Q15.2): "A". Procedures become plain functions through opt-in wrappers, not builder methods.
- Human, 2026-10-15 (Q15.3): "Make it configurable", then "it should be configurable on a factory function thay also handles the context thing so we can just wrap in action()". A factory sets the context and result mode once:

  ```ts twoslash
  // ---cut-start---
  import { appRouter, t, type Context } from './server.ts';
  declare function createContext(): Promise<Context>;
  // ---cut-end---
  import { experimental_createAction } from '@trpc12/trpc/actions';

  export const action = experimental_createAction(t, {
    ctx: createContext,
    result: 'safe', // or 'throw'
  });
  export const createPost = action(appRouter.post.create);
  //           ^?
  ```

  `'throw'` returns the data and throws `TrpcError`. `experimental_createCallable` is the same factory for non-form calls. Both live in `@trpc12/trpc/actions` ([`entry-points.md`](./entry-points.md)), so they work in Next, TanStack Start or any React Server Components setup.

- Human, 2026-10-18: "A" — asked whether an action's safe result should be a plain, serializable object. `result: 'safe'` first returned `safe()`'s dual `[data, error]` / `{ data, error }`, which React's Server Action serialization breaks: the array arrives without its `data` and `error` fields, and the `TrpcError` as a plain object without its class (development logs an error for it). An action's safe result is now `{ data }` or `{ error: { code, message, defined, data? } }`, plain objects; `data` is left out for errors without it, as Flight drops `undefined` fields. `code` and `defined` narrow it as on `TrpcError`. A callable's results stay on the server, so its `'safe'` result is still `safe()`'s, with the `TrpcError` itself.
- Human, 2026-10-15 (Q15.4): "We probably don't need a next specific package, just a rsc specific one - look at my package raf-query", then "make the rsc ones at their own entrypoint too". No `@trpc12/next`. React Server Components helpers are `@trpc12/tanstack-react-query/rsc`, as raf-query's `@raf-query/react/rsc`: a per-request caller and query utils through React's `cache()`, and a server `HydrationBoundary` that streams prefetched queries.
- (agent) `createTrpcRsc({ router, ctx, layer })` returns `trpc` (query helpers over a router caller), `caller`, `getQueryClient`, `prefetch` and `HydrationBoundary`. `ctx` and the query client are memoized per request with `cache()`; the boundary dehydrates with `hydrationOptions()`, so the browser's `QueryClient` takes `defaultOptions: hydrationOptions()` and the same serializer. It renders TanStack's client `HydrationBoundary`, so no `'use client'` file is needed.
- (agent, 2026-10-19, fix) A factory's services are read per call through `runtimeServices(runtime)`, the Effect the handler core and the router client use, instead of a memoized `runtime.context()` promise. A layer that fails to build was a rejected action with the layer's raw error, unmasked and unseen by `onError`; it is now an unexpected `INTERNAL_SERVER_ERROR` whose `cause` is the layer's error, as over HTTP ([`router-client-runtime.md`](./router-client-runtime.md)). The factory no longer builds that runtime: see the next bullet.
- (agent, 2026-10-20, [`effect-first-public-apis.md`](./effect-first-public-apis.md)) `experimental_createAction`/`experimental_createCallable` take a caller-owned `runtime` (the shared `RuntimeOption`, as `createRouterClient` in [`router-client-runtime.md`](./router-client-runtime.md)) instead of `layer`, which each factory built into a `ManagedRuntime` it never disposed, so the layer's finalizers never ran. Factories sharing a runtime share one build; `runtime.dispose()` releases it, and a call after that is an unexpected `INTERNAL_SERVER_ERROR`. `layer` is a type error naming the fix. `CreateActionOptions` is a type alias now (`CreateActionBaseOptions & RuntimeOption`), since `RuntimeOption` is conditional on the services. Lost: the one-liner `{ layer }`; callers write `ManagedRuntime.make(layer)` and own its disposal.
- (agent, 2026-11-01, [`sanitized-procedure-types.md`](./sanitized-procedure-types.md)) The factories take the root first, `experimental_createAction(t, opts)`: a procedure's type leaves out its root ctx, so the factory's `ctx` is checked against `t`'s and each procedure's middleware needs.
- Lost: v11's `experimental_caller` builder method and the Next-specific adapter. From the 2026-10-18 answer: `const [post, error] = await createPost(form)` and parity with `safe()` for actions, and the error's class (`instanceof TrpcError`, `_tag` for `Effect.catchTag`) and `cause`.
- Lives in: `packages/trpc/src/actions/` (`flight.test.ts` sends action results through React's Flight server and client), `packages/tanstack-react-query/src/rsc.ts`.
