# v11 migration example

A v11 app (a `@trpc/server` 11 router, `@trpc/client` 11 links and `@trpc/tanstack-react-query`) moved to v12 in three stages, each run against a real server. It uses stable API only: `createV11Handler` and `fromV11Link` from `@trpc12/trpc/interop`, `createSyncTransformer`, `httpLink` with batching, and the `@trpc12/upgrade` codemod. The guide it follows: [Migrating from v11](https://v12.trpc.io/v12/docs/migrations/from-v11).

```
server.ts            listen(): the v12 router on /rpc, and createV11Handler on /trpc for v11 clients
client.ts            main(url): the three stages against a running server
start.ts             listen(), then main(url)
db.ts                the posts store both versions share
server/              the v12 router, context, procedures and the superjson transformer
client/              the v12 client: fromV11Link(callLogLink) + httpLink, TanStack query utils, a React app
v11/                 the v11 app as it was, typed against @trpc/* 11 (stage 1 runs its client, stage 3 rewrites a copy)
stages/
  1-serve-v11-clients.ts   v11 clients on /trpc
  2-move-the-client.ts     the v12 client on /rpc
  3-codemod.ts             trpc12-upgrade on a copy of v11/
```

## The stages

1. **The server moves first.** `server.ts` serves the v12 router to v11 clients through `createV11Handler({ router, createContext, transformer: superjson, errorFormatter })`, on `/trpc` where they already point. Stage 1 runs `v11/client/` unchanged: `httpBatchLink` batches, `httpSubscriptionLink` resumes from `lastEventId`, `wsLink` with `connectionParams`, superjson `Date`s, `TRPCClientError` with the old `errorFormatter`'s `data.issues`, and `createTRPCOptionsProxy` queries. The v12 router reads `lastEventId` as a resolver option; `createV11Handler` passes the one v11 clients put in the input there too.
2. **Then the client.** `client/client.ts` is `createTrpcClient` with `httpLink({ batch: true, transformer })` on `/rpc`, and keeps the app's own v11 `TRPCLink` (`v11/client/links.ts`, which logs every call) through `fromV11Link`. Stage 2 makes the same calls: errors through `safe()` and declared data, `subscribe(undefined, { lastEventId })`, and `createTrpcQueryUtils` with `queryOptions({ input })`.
3. **The codemod.** Stage 3 copies `v11/` to a temporary directory and runs the `trpc12-upgrade` CLI. The dry run must print exactly the expected `file:line:column` steps and write nothing. `--write` must rewrite imports, `initTrpc<{ ctx }>`, `createFetchHandler(...).fetch(req)`, the links, `routerType<AppRouter>()`, the context tuple and the renamed names. A second run must find nothing left to rewrite, and its only steps are the custom link that stage 2 keeps with `fromV11Link`.

The React components (`v11/client/app.tsx`, `client/app.tsx`) are type-checked, not rendered. They show the TanStack changes (`[TrpcProvider, useTrpc]`, `queryOptions({ input })`, `pathFilter()`) and give the codemod its JSX input. For a rendered app, see [react-spa](../react-spa/README.md).

## What the codemod leaves

The rewritten copy doesn't type-check until you work through its steps. The steps that take the most work:

- `queryOptions(input)`, `queryKey(input)` and the other TanStack helpers take `{ input }` in v12. Each call is a step.
- `createContext` reads `opts.request.headers['authorization']` instead of `opts.req.headers.get(...)`.
- A `TRPCLink<AppRouter>` typed by the v11 router stops fitting once `AppRouter` is v12. Here the link keeps its v11 router type, since `v11/` is untouched.
- v12's `httpLink` `headers` must return `HeadersInit`. v11's `() => (token ? { authorization: token } : {})` is a union that doesn't fit, so `client/client.ts` annotates the return as `HeadersInit`.

## Running it

`pnpm start` runs everything once and exits. To run the two halves apart, start `pnpm server` (on `PORT`, default 3000), then run `pnpm client` (or `pnpm client <url>`). From `next/`, `pnpm example` runs this example's smoke with the others. `pnpm typecheck` checks both the v11 and the v12 code.
