# React `use()` and Suspense on TanStack Start (experimental)

`@trpc12/experimental-react` without TanStack Query, in a TanStack Start app styled with `@shared/ui` and Tailwind. The route's loader starts `post.list`, the component reads its promise with `use(useQuery(promise))` under `Suspense`, and the add form's `useMutation` refetches the list before it resolves, its `invalidates: 'post.list'` narrowing `standardLinks()`' `invalidateOnMutationLink`. See [React without TanStack Query](https://v12.trpc.io/v12/docs/integrations/experimental-react); for the same page with Effect atoms, see [`react-atom`](../react-atom/README.md).

It's a framework app, so it keeps TanStack Start's layout instead of the [examples layout](../../README.md):

- `src/server/router.ts`: the router (`post.list`, `post.add`).
- `src/routes/api/trpc.$.ts`: a server route that hands `/api/trpc/*` to `createFetchHandler()`.
- `src/trpc.ts`: `makeTrpc()`, with `standardLinks()` and a link chosen by `createIsomorphicFn()`: `localLink` on the server, so a server render calls the router in process, and `httpLink` to `/api/trpc` in the browser. Start leaves the router out of the browser bundle.
- `src/router.tsx`: `getRouter()` makes a client per request on the server and one per tab in the browser, and passes it to routes as context. Its `dehydrate` and `hydrate` options carry the client's cache with the HTML.
- `src/routes/__root.tsx`, `src/routes/index.tsx`: the document and the page.

On the server the loader waits for `post.list`, so the HTML has the posts and the dehydrated cache has the result; the browser renders from it without a request. In the browser the loader only starts the query. The component calls `trpc.post.list.query()` again rather than taking the loader's promise, since `useQuery()` needs the client's own promise and a loader's data is serialized; the same call returns the same promise. Dates cross the wire and the dehydrated cache with progressive JSON.

`pnpm dev` serves the app at <http://localhost:5173>; `pnpm build` then `pnpm start` serves the build. `pnpm smoke` builds it, serves it with Vite's preview server and drives it in headless Chrome (`CHROME_PATH`, or an installed Chrome): the HTML has the posts, hydration makes no request, adding a post calls `post.add` then `post.list` once and clears the form, and a reload renders the new post.
