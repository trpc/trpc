# React Router Framework Mode integration (human asked)

Human: first-class React Router integration; then: keep it under `.experimental/`; then: release it for real.

- **`HydrationBoundary` from `@raf-query/react`** takes the loader's `state` and writes it through the shared `Hydrate` (`packages/react/src/hydration-boundary.tsx`; one import for RSC and React Router, see [hydration-boundary-one-import.md](./hydration-boundary-one-import.md)). A root `middleware` creates the request's `QueryClient` and every loader reads it from the context, starts queries, `dehydrate`s, and returns that state ([react-router-request-client.md](./react-router-request-client.md)); the route component wraps its tree in the boundary. There is no `setupRouterIntegration`: React Router has no dehydrate/hydrate hooks on the router itself. Nothing imports `react-router`, so it adds no peer.
- Pending entries cross as promises when Single Fetch serializes them. Nested boundaries are fine.
- **`examples/react-router`** (`@examples/react-router`, port 3006) is the issue tracker a fourth time, with a CodeSandbox copy like the others.
- **`www/content/react-router.md`** is the guide, written against `www/samples/react-router` (`@samples/react-router`, an `app/` dir like a React Router app). Its routes use `Route.LoaderArgs` / `Route.ComponentProps`, so the build runs `react-router typegen` for it (`generateRouteTypes` in `www/build/sample-apps.ts`); `.react-router/` is gitignored, unlike the TanStack route trees. The sample is only type-checked, so it doesn't install `@react-router/node` or `isbot`.
- React Router's `Serialize` type replaces a handle's type-only factory brand (a function type) with `undefined`, so after a loader, handles of different factories with the same input type are interchangeable. Its escape hatch is `unstable_SerializesTo`; not used yet.
- Lost: a separate `@raf-query/experimental-react-router` package (it had to copy `Hydrate`'s split, since `Hydrate` isn't public).
- Client-only apps (`clientLoader`, SPA Mode, Data Mode) have their own section and sample app: see [react-router-client-only.md](./react-router-client-only.md).
