# React Router: one server client per request, from middleware (human asked)

Human: "Isn't it possible to share a client across all routes if you use nested routes? If so update all examples towards using a shared client per request, including home page".

- **A root `middleware` creates the request's `QueryClient`** and sets it in a React Router context (`createContext<QueryClient>()` in `app/query-client.ts`). Every loader reads it with `args.context.get(queryClientContext)`. Server middleware runs before the loaders of both document requests and client navigations' `.data` requests, and needs no future flag on React Router 8. Nested routes' loaders run in parallel on that one client, so a query a layout and a child both start is requested once. Applies to `examples/react-router`, `www/samples/react-router` (guide and homepage tab). The client-only sample keeps its module client.
- In the example, the middleware builds the client inside `withRequest`, because `createAppQueryClient` reads the stale-time cookie from the request.
- **Every loader dehydrates the whole client**, so nested loaders' snapshots can overlap; hydration keeps the newer copy, so the overlap only costs payload. Lost: `dehydrate`'s `sent` set per request. Loaders return in any order, so a child could claim an entry its parent's component reads, and the parent's `HydrationBoundary` (rendered above the child's) wouldn't have it.
- Lost: a client per loader. Simpler to show, but nested loaders couldn't share queries.
