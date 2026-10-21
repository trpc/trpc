# React SPA example

An issue tracker built with Vite+ and React 19 on [`@trpc12/tanstack-react-query`](https://v12.trpc.io/v12/docs/integrations/tanstack-query/react), without Next. It uses the same components as the docs site (`@shared/ui`, shadcn on Base UI with Tailwind 4) and only stable APIs.

| Where                                            | What it shows                                                                                                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/trpc.tsx`](./src/trpc.tsx)                 | `createTrpcContext` for two APIs, the second under `keyPrefix: 'directory'`; `httpLink` batching behind `dedupeLink`; the cache persisted through `hydrationOptions()` |
| [`src/issues.ts`](./src/issues.ts)               | `infiniteOptions()` with a cursor; an optimistic create registered with `setMutationDefaults`, so a mutation queued offline resumes after a reload                     |
| [`src/issue-list.tsx`](./src/issue-list.tsx)     | `useInfiniteQuery` and "Load more"; optimistic delete with `setQueryData` on the infinite key and `pathFilter()` invalidation; `useMutationState` for the queue        |
| [`src/issue-detail.tsx`](./src/issue-detail.tsx) | `useSuspenseQuery` under a Suspense boundary; `useSubscription` with `subscriptionOptions()` writing live comments into the query's cache entry                        |
| [`src/app.tsx`](./src/app.tsx)                   | `liveOptions()`: counters pushed by a subscription, read with `useQuery`; an offline switch on TanStack's `onlineManager`                                              |
| [`src/activity.tsx`](./src/activity.tsx)         | `streamedOptions()` with `maxChunks`: the newest events of a subscription, in the cache                                                                                |
| [`server/tracker.ts`](./server/tracker.ts)       | the router: a cursor-paged query, `tracked()` comments that resume from `lastEventId`, and `Date`s over progressive JSON                                               |
| [`server.ts`](./server.ts)                       | both APIs' `handler.routes` merged with Effect's `HttpStaticServer` for the built app, on `NodeHttpServer`; `listen()` for the smoke                                   |
| [`vite.config.ts`](./vite.config.ts)             | the same APIs inside `vp dev` and `vp preview`, mounted with `NodeHttpServer.makeHandler`                                                                              |

The app is the client, so this example has `server.ts` and no `client.ts` (the layout in [`../README.md`](../README.md) is for examples with a separate client).

Queries keep `structuralSharing` (the default from `queryOptions()`), so an equal refetch, `Date`s included, keeps its references. [`cache.test.ts`](./cache.test.ts) checks that, the key prefix, and the offline create from draft to resume, with the routers in process over `localLink`.

## Run it

From this folder:

- `pnpm start`: builds the app and serves it with both APIs from `server.ts`, at http://localhost:3000.
- `pnpm dev`: Vite's dev server with both APIs, at http://localhost:5173.
- `pnpm test` from `next/` runs `cache.test.ts` with the other suites.
- `pnpm smoke` (also run by `pnpm example` from `next/`): builds, starts the server and drives the app in headless Chrome. It pages through the list, creates, closes and deletes issues, waits for comments from another client and for the live counters, then goes offline, queues an issue, reloads, and checks the queued mutation reached the server. It uses the installed Google Chrome (GitHub's runners have one); set `CHROME_PATH` to use another Chromium.

Data lives in memory and resets when the server restarts; the browser keeps its cache in localStorage for a day.
