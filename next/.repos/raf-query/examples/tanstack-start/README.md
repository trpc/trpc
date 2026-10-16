# raf-query on TanStack Start

[![Open in CodeSandbox](https://codesandbox.io/static/img/play-codesandbox.svg)](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/tanstack-start?file=/apps/tanstack-start/src/routes/prefetch/issues/index.tsx)

Live at [tanstack-start.raf-query.katt.dev](https://tanstack-start.raf-query.katt.dev).

A small issue tracker built with [raf-query](https://github.com/KATT/raf-query#readme). [`examples/nextjs`](https://github.com/KATT/raf-query/tree/main/examples/nextjs) is the same app on Next.js App Router, so the two integrations can be compared side by side.

| Screen / action                                          | Shows                                                                                                                                                  | Files                                                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loader verb: `prefetch`, `ensure`, or `fetch` in the URL | The same loaders started three ways: `/prefetch/…` opens at once with skeletons, `/ensure/…` waits on a cache miss, `/fetch/…` waits on stale data too | `src/routes/prefetch/`, `src/routes/ensure/`, `src/routes/fetch/`                                                                                                   |
| Navigation progress bar                                  | A thin bar along the top while the router is pending, from `useRouterState({ select: (state) => state.status === "pending" })`                         | `src/routes/__root.tsx`, `../.shared/kit/src/components/navigation-progress.tsx`                                                                                    |
| Issue list: status filter and sort in the URL            | `validateSearch` → loader, infinite scroll, `whilePending: "previous"` dimming                                                                         | `src/routes/prefetch/issues/index.tsx`, `src/routes/prefetch/issues/-components/issue-list.tsx`                                                                     |
| Issue detail                                             | With `prefetch` the route opens at once and the title, body, and status show skeletons                                                                 | `src/routes/prefetch/issues/$issueId/route.tsx`                                                                                                                     |
| Comments                                                 | Paged query with infinite scroll, streamed under `prefetch`                                                                                            | `src/routes/prefetch/issues/$issueId/-components/comments.tsx`                                                                                                      |
| Assignee card                                            | The loader starts the assignee by issue id beside the issue, so neither waits on the other                                                             | `src/routes/prefetch/issues/$issueId/route.tsx`, `src/routes/prefetch/issues/$issueId/-components/assignee-card.tsx`                                                |
| Inline-edit title and body; change status from the list  | Form actions / transitions, `useOptimistic`, `await qc.invalidate`                                                                                     | `src/components/edit-title.tsx`, `src/components/edit-body.tsx`, `src/components/status-select.tsx`, `src/routes/prefetch/issues/$issueId/-components/comments.tsx` |

The markup all four example apps share (issue rows, the status menu, comments, skeletons, the settings controls) is in [`examples/.shared/kit`](https://github.com/KATT/raf-query/tree/main/examples/.shared/kit). Every query, loader, and save stays in this app.

Query factories are in `src/queries.ts`. Their `queryFn`s, and the form actions, call a REST API through its typed [Hono](https://hono.dev) client. The API lives in [`examples/.shared/api`](https://github.com/KATT/raf-query/tree/main/examples/.shared/api), shared with the Next.js app, and the server route `src/routes/api.$.ts` serves it. Its inputs and responses are typed by the fake database's schemas and functions. Loaders call the API in process during SSR, and over HTTP in the browser. `src/router.tsx` wires the query client into the router with `setupRouterIntegration`. The data comes from an in-memory fake database that waits the latency picked in the top bar (or `DB_LATENCY_MS`, default 400) ± 50% per call and resets when the server restarts.

The top bar's **Loader** select switches the URL's verb and keeps the page you are on; its other settings live in cookies, so the server renders with them too. **Prefetch links** sets the router's `defaultPreload` (`src/settings.ts`) and starts **off** (`false`): on intent, in the viewport, on render, or off. **Stale time** is the query client's `staleTime` (5 seconds until you pick another). **Latency** is a cookie the API reads, as a real API reads its session: the browser sends it, and SSR forwards the page request's `cookie` header (`src/forwarded-headers.ts`). The API passes it to the database call. **Reset** clears the cookies, drops every query and the router's match cache, and reloads, so the cache starts empty.

## Run it

From the root of this repo:

```shell
pnpm install
pnpm dev:start
```

Then open <http://localhost:3000>.
