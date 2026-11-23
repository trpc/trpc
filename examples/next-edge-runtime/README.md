# Next.js Edge Runtime + tRPC

A minimal Next.js App Router app that serves tRPC from the [Next.js Edge Runtime](https://nextjs.org/docs/app/api-reference/edge) using tRPC's fetch adapter.

- `src/trpc/routers/_app.ts`: the router, with a `greeting` query
- `src/app/api/trpc/[trpc]/route.ts`: the route handler serving it with `fetchRequestHandler`, on the edge runtime
- `src/trpc/server.tsx`: `trpc` and `HydrateClient` for server components
- `src/trpc/client.tsx`: the `TRPCReactProvider` and `useTRPC` hook for client components
- `src/app/page.tsx`: a server component that starts `greeting` with [`loadHandles`](https://trpc.io/docs/client/tanstack-react-query/handles) and passes its handle down
- `src/app/greeting.tsx`: reads the handle with `useSuspenseQuery(fromHandle(...))`

## Setup

```bash
npx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-edge-runtime trpc-next-edge-runtime
cd trpc-next-edge-runtime
npm i
npm run dev
```

## Development

### Start project

```bash
npm run dev        # starts next.js
```
