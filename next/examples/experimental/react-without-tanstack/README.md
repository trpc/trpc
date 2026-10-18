# React without TanStack Query (experimental)

One router read with both experimental React integrations, in a Vite page styled with `@shared/ui` and Tailwind:

- **`@trpc12/experimental-react`**: a loader (`loadPage()` in `src/trpc.ts`) starts `post.list`, and the card reads the promise with `use(useQuery(promise))` under `Suspense`. `standardLinks()` adds the cache, and after `mutate()` `invalidateOnMutationLink` refetches the list on screen. `useQueryState()` shows a fetching badge. See [React without TanStack Query](../../../docs/integrations/experimental-react.md).
- **`@trpc12/experimental-react-atom`**: `useAtomSuspense()` reads a query atom, a mutation atom with `reactivityKeys: ['posts']` refetches it, and a subscription atom shows the server's clock. See [React atoms](../../../docs/integrations/experimental-react-atom.md).

Dates cross the wire with danSON on both ends. Both packages are experimental; `httpLink`, `createSerializer()` and the server are stable.

The files follow the [examples layout](../../README.md):

- `server.ts`: the router, `listen()`, and `trpcMiddleware()`, which Vite's dev and preview servers mount at `/trpc` (`vite.config.ts`).
- `client.ts`: both clients outside React, as a loader or a server render uses them: `query()`, `setData()`, `getData()` and `dehydrate()`, then atoms in an `AtomRegistry`.
- `src/App.tsx`: the page. `src/App.test.tsx` renders it in happy-dom against `listen()`, adds a post from each card and waits for the clock; `pnpm test` from `next/` runs it.

`pnpm start` runs the server and client; `pnpm dev` serves the page at <http://localhost:5173>. `pnpm smoke` builds the page first.
