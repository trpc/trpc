# Effect atoms on TanStack Start (experimental)

`@trpc12/experimental-react-atom` in a TanStack Start app styled with `@shared/ui` and Tailwind. `useAtomSuspense()` reads the `post.list` query atom, a `post.add` mutation atom with `reactivityKeys: ['posts']` refetches it, and a subscription atom shows the server's clock. See [React atoms](https://v12.trpc.io/v12/docs/integrations/experimental-react-atom); for the same page with `use()` and Suspense, see [`react-suspense`](../react-suspense/README.md).

It's a framework app, so it keeps TanStack Start's layout instead of the [examples layout](../../README.md):

- `src/server/router.ts`: the router (`post.list`, `post.add`, `clock`).
- `src/routes/api/trpc.$.ts`: a server route that hands `/api/trpc/*` to `createFetchHandler()`.
- `src/trpc.ts`: `makeAtoms()`, the atom client and the `AtomRegistry` that holds its values. The link is chosen by `createIsomorphicFn()`: `localLink` on the server, so a server render calls the router in process, and `httpLink` to `/api/trpc` in the browser. Start leaves the router out of the browser bundle.
- `src/router.tsx`: `getRouter()` makes the atoms per request on the server and once per tab in the browser, and passes them to routes as context. Its `dehydrate` and `hydrate` options carry the registry's settled query atoms with the HTML (`Hydration` from `effect/reactivity`).
- `src/routes/__root.tsx`: the document, and `RegistryContext` for the atom hooks. `src/routes/index.tsx`: the page.

On the server the loader mounts the list atom in the request's registry and waits for its result, so the HTML has the posts and the dehydrated registry has the result; the browser renders from it without a request. The clock is under `ClientOnly`, since a subscription never settles for a server render to wait on.

The browser's registry takes `@effect/atom-react`'s defaults (React's `scheduleTask` and a 400ms `defaultIdleTTL`). A component reads a hydrated atom while rendering and subscribes after, and without a TTL the registry drops the unsubscribed atom, hydrated value and all, so the page would fetch it again. The server's registry has no TTL, since its idle timers would keep the process alive after a request; mounting the loaded atom keeps it there instead. Dates cross the wire and the dehydrated registry with danSON.

`pnpm dev` serves the app at <http://localhost:5173>; `pnpm build` then `pnpm start` serves the build. `pnpm smoke` builds it, serves it with Vite's preview server and drives it in headless Chrome (`CHROME_PATH`, or an installed Chrome): the HTML has the posts, hydration makes no request, the clock ticks, adding a post calls `post.add` then `post.list` once, and a reload renders the new post.
