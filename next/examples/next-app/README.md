# Next.js example

A Next.js App Router app with Cache Components, styled with the docs site's shadcn components (`@shared/ui`) and Tailwind.

```
src/server/router.ts        the router; an in-memory store stands in for a database
src/app/api/trpc/…/route.ts the route handler: handler.fetch
src/trpc/server.ts          createTrpcRsc: trpc, caller, prefetch, HydrationBoundary
src/trpc/client.tsx         createTrpcContext and the browser's QueryClient
src/app/page.tsx            prefetches posts at request time, inside <Suspense>
src/app/guestbook/          a Server Action form over a cached, tagged list
```

- **Posts** ([React Server Components](https://v12.trpc.io/v12/docs/integrations/rsc)): `prefetch` in a server component, read with `useSuspenseQuery`; a TanStack mutation invalidates with `pathFilter`. Progressive JSON keeps `createdAt` a `Date`.
- **Guestbook** ([Next.js data cache](https://v12.trpc.io/v12/docs/integrations/rsc#nextjs-data-cache), [Server Actions](https://v12.trpc.io/v12/docs/integrations/server-actions)): a `'use cache'` function tags `caller.guestbook.list` with `cacheTags`, so the list is in the page's static shell. The form posts `FormData` to an `experimental_createAction` action through `useActionState`, `useOptimistic` shows the entry until the action settles, and the action calls `updateTag(revalidationTag(trpc.guestbook.pathKey()))`. A declared `CONFLICT` error comes back as the form's state.
- **Streamed mutation** and **Files**: `streamedMutationOptions` / `chunksOptions`, and `File` in and out.

Notes:

- Server Actions are `experimental_*`. `sign` calls the action, then `updateTag` after a write: `updateTag` only works in a Server Action, and the procedure is served by the route handler too. The action's `{ data }` / `{ error }` result is plain objects, so it reaches the browser as the form's state unchanged.
- `cacheTags` and `revalidationTag` come from `@trpc12/tanstack-react-query/rsc` in server code: the package root imports React's client hooks.
- A write through the route handler doesn't revalidate the data cache; the smoke checks that the page keeps its cached list until the action revalidates it.

Run it from `next/` with `pnpm example`, or here with `pnpm smoke`: it runs `next build` and `next start`, calls the route with a Node client, then signs the guestbook in headless Chrome through `playwright-core` (`channel: 'chrome'`, the Chrome on GitHub's Ubuntu runners). `pnpm dev` serves it on port 3000.
