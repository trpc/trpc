# Next.js App Router + tRPC

A minimal tRPC setup on the Next.js App Router with [`@trpc/tanstack-react-query`](https://trpc.io/docs/client/tanstack-react-query/setup), following the [App Router setup guide](https://trpc.io/docs/client/nextjs/app-router-setup).

- `src/trpc/routers/_app.ts`: the router, with a `greeting` query and a `loopData` subscription
- `src/app/api/trpc/[trpc]/route.ts`: the route handler serving it with the fetch adapter
- `src/trpc/server.tsx`: `trpc`, `prefetch` and `HydrateClient` for server components
- `src/trpc/client.tsx`: the `TRPCReactProvider` and `useTRPC` hook for client components
- `src/app/page.tsx`: a server component that prefetches `greeting` and hands it to the client still pending
- `src/app/greeting.tsx`: reads it with `useSuspenseQuery`, which suspends until it streams in
- `src/app/loop-data.tsx`: `useSubscription` over server-sent events

## Setup

```bash
npx create-next-app --example https://github.com/trpc/examples-next-minimal-starter trpc-minimal-starter
cd trpc-minimal-starter
npm i
npm run dev
```

## Development

### Start project

```bash
npm run dev        # starts next.js
```

### Test

```bash
npx playwright install chromium   # once, to download the test browser
npm run test-dev                  # runs the Playwright test against `next dev`
```
