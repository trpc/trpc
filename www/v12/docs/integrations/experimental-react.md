---
title: React without TanStack Query
description: Render-as-you-fetch with `use()` and Suspense in `@trpc12/experimental-react`, where cache features are links.
section: Integrations
parent: integrations/react
order: 3
experiment: experimental-react
---

`@trpc12/experimental-react` reads tRPC in React with `use()` and Suspense, without TanStack Query: render-as-you-fetch, after [raf-query](https://github.com/KATT/raf-query). A route loader (or an event handler) calls `.query()`, which starts the request and returns a promise. The component reads that promise with `useQuery()` and `use()`. Components don't start requests.

The whole package is experimental: the package name says so, every export is `@stability experimental`, and the API might change or go away in any release. For a stable React integration, use [TanStack Query](./tanstack-query/react.md); [React and Next.js](./react.md) compares the three.

```package-install
@trpc12/trpc effect @trpc12/experimental-react
```

The [`examples/experimental/react-suspense`](../../../examples/experimental/react-suspense/README.md) app uses this package on TanStack Start: a route loader starts the query, and the server render's cache is dehydrated into the browser's client. [`react-atom`](../../../examples/experimental/react-atom/README.md) is the same page with `@trpc12/experimental-react-atom`.

```tsx twoslash
// ---cut-start---
declare function Spinner(): React.ReactNode;
declare const loaderData: ReturnType<typeof loader>;
// ---cut-end---
import {
  createReactClient,
  standardLinks,
  useQuery,
  type QueryPromise,
} from '@trpc12/experimental-react';
import { httpLink, routerType } from '@trpc12/trpc/client';
import { Suspense, use } from 'react';
import type { AppRouter } from './server';

export const trpc = createReactClient({
  router: routerType<AppRouter>(),
  links: [
    ...standardLinks({ staleTime: '10 seconds' }),
    httpLink({ url: '/trpc' }),
  ],
});

// The route's loader starts the request; the navigation doesn't wait for it.
export const loader = (args: { params: { id: string } }) => ({
  post: trpc.post.byId.query({ id: args.params.id }),
});

function Post(props: { post: QueryPromise<{ title: string }> }) {
  const post = use(useQuery(props.post));
  return <h1>{post.title}</h1>;
}

<Suspense fallback={<Spinner />}>
  <Post post={loaderData.post} />
</Suspense>;
```

`useQuery` finds the cache through the promise, so there is no provider.

## Stable promises

Built in, not a link. `use()` needs the same promise across renders, and these are:

- One promise per query (path and input, with object keys sorted) while it loads, so calls in flight share one request.
- The same promise while the data doesn't change. A new one only when it does: a refetch with new data, or `setData`.
- Settled promises carry `status` and `value`, so `use()` renders cached data without suspending.

`useQuery(promise)` returns the query's current promise and re-renders when it changes. `useQueryState(promise)` gives `isFetching`, `isStale`, `error`, `updatedAt` and `refetch()`, for spinners and retry buttons.

## Picking a part with `select`

`useQuery(promise, { select })` returns a promise of the part the component reads. The pick is shared structurally with the last one, so while that part doesn't change, the promise stays the same object and the component doesn't re-render, even when a refetch or `setData` changes the rest of the data. It works without `structuralSharingLink()`.

```tsx twoslash
// ---cut-start---
import { createReactClient, useQuery } from '@trpc12/experimental-react';
import { httpLink, routerType } from '@trpc12/trpc/client';
import { use } from 'react';
import type { AppRouter } from './server.ts';
const trpc = createReactClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: '/trpc' })],
});
const post = trpc.post.byId.query({ id: '1' });
// ---cut-end---
function Title() {
  const title = use(useQuery(post, { select: (data) => data.title }));
  //    ^?
  return <h1>{title}</h1>;
}
```

`select` runs on each new data, and on each render when it's an inline function, so keep it cheap. An error it throws rejects the promise, for the nearest error boundary. Pass the `.query()` promise, not a selected one, to `useQueryState`.

## Polling

`useQuery(promise, { refetchInterval })` refetches the query while the component is mounted, that long after each request settles, so a slow server never has two polls in flight. While the page is hidden, polling waits, and it refetches as soon as the page is visible again. The interval is milliseconds, a string like `'10 seconds'` or an Effect `Duration`; `false` or `undefined` stops it, so `refetchInterval: done ? false : 1000` polls until a job finishes.

```tsx twoslash
// ---cut-start---
import { createReactClient, useQuery } from '@trpc12/experimental-react';
import { httpLink, routerType } from '@trpc12/trpc/client';
import { use } from 'react';
import type { AppRouter } from './server.ts';
const trpc = createReactClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: '/trpc' })],
});
const posts = trpc.post.list.query();
// ---cut-end---
function Latest() {
  const latest = use(
    useQuery(posts, {
      refetchInterval: '10 seconds',
      select: (list) => list.at(-1)?.title,
    }),
  );
  return <p>Latest: {latest}</p>;
}
```

Each polling component has its own timer, as in TanStack Query; a poll that lands while a request is in flight joins it. Servers never poll.

## Query links

Without links, the cache does the least: an entry lives while a request is in flight or a mounted `useQuery` reads it. Everything else is a link, opt-in one by one:

| Link                               | Does                                                                                      | In `standardLinks()` |
| ---------------------------------- | ----------------------------------------------------------------------------------------- | -------------------- |
| `cacheLink({ staleTime, gcTime })` | Keeps unread entries `gcTime` (5 minutes); fresh data (`staleTime`, 0) makes no request   | yes                  |
| `structuralSharingLink()`          | Refetched data keeps unchanged parts, and unchanged data keeps its promise (no re-render) | yes                  |
| `refetchOnMountLink()`             | A mount on stale data refetches it, except right after the loader's own request           | yes                  |
| `refetchOnWindowFocusLink()`       | Refetches stale, mounted queries when the page is visible again                           | yes                  |
| `refetchOnReconnectLink()`         | The same when the browser comes back online                                               | yes                  |
| `retryLink()` (core)               | Retries failed queries 3 times                                                            | yes                  |
| `invalidateOnMutationLink()`       | After a mutation, invalidates queries and resolves once the mounted ones have refetched   | yes                  |

`standardLinks()` matches TanStack Query's defaults, plus one: like a router after an action, every mutation invalidates queries (all of them, unless `invalidates` narrows it). Stale data is returned at once and refetched in the background.

Query links are tRPC [links](../client/links.md): they sit in the same `links` array, before the link that sends. Write your own with `withQueryFeature(link, feature)`.

## Mutations

`useMutation(trpc.post.create)` calls a mutation and tracks its latest call: `status` (`idle`, `pending`, `success` or `error`), `isPending`, `input`, `data`, and `error`, typed with the procedure's error union as the call's `safe()` result is ([Errors](../client/errors.md)). `mutate` takes the procedure's input and call options and returns its promise; the hook already handles a rejection, so `void create.mutate(input)` is safe, and `await` gets the result or the error. `mutate` is the same function every render, and `reset()` goes back to `idle`.

```tsx twoslash
// ---cut-start---
import {
  createReactClient,
  standardLinks,
  useMutation,
} from '@trpc12/experimental-react';
import { httpLink, routerType } from '@trpc12/trpc/client';
import type { AppRouter } from './server.ts';
const trpc = createReactClient({
  router: routerType<AppRouter>(),
  links: [...standardLinks(), httpLink({ url: '/trpc' })],
});
// ---cut-end---
function NewPost() {
  const create = useMutation(trpc.post.create, { invalidates: 'post.list' });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const title = String(new FormData(event.currentTarget).get('title'));
        void create.mutate({ title });
      }}
    >
      <input name="title" />
      <button disabled={create.isPending}>Add</button>
      {create.error?.code === 'UNAUTHORIZED' && <p>Sign in to post.</p>}
    </form>
  );
}
```

`invalidates` names what a successful call refetches before it resolves, so `isPending` lasts until fresh data is on screen:

- a path prefix: `'post'` is every query under `post.*`;
- a query key: `trpc.post.byId.queryKey({ id })` is that one query;
- an array of both, where `[]` invalidates nothing;
- or a function of the call's `input` and `data` that returns one of those, such as `(opts) => trpc.post.byId.queryKey({ id: opts.input.id })`.

With `invalidateOnMutationLink()` in the links, as in `standardLinks()`, a hook's `invalidates` replaces the link's filter for its calls; without `invalidates`, the link's applies. Without the link, the hook invalidates on its own.

Inside a transition, such as a form's `action`, React shows state updates when the transition ends: there, read `isPending` from `useFormStatus()` or `useTransition()`, and the error from `await create.mutate(…)`.

## Cache methods

```ts twoslash
// ---cut-start---
import { createReactClient } from '@trpc12/experimental-react';
import { httpLink, routerType } from '@trpc12/trpc/client';
import { z } from 'zod';
import { appRouter, db, t } from './server.ts';
const router = t.router({
  ...appRouter,
  post: {
    ...appRouter.post,
    rename: t.procedure
      .input(z.object({ id: z.string(), title: z.string() }))
      .mutation((opts) => db.post.find(opts.input.id)),
  },
});
const trpc = createReactClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: '/trpc' })],
});
declare const id: string;
declare const title: string;
// ---cut-end---
await trpc.post.byId.invalidate({ id }); // refetches it if it's on screen
await trpc.invalidate('post'); // every query under post.*
await trpc.invalidate(trpc.post.byId.queryKey({ id })); // that query
trpc.post.byId.setData({ id }, (prev) => ({ ...prev!, title }));
trpc.post.byId.getData({ id });
await trpc.post.rename.mutate({ id, title }); // as on the plain client; useMutation tracks it
```

## Server rendering

On the server, create one client per request (`isServer` defaults to `typeof window === 'undefined'`; a server's cache never drops entries). After the render, `dehydrate(trpc)` encodes the settled queries with the links' transformer, so `Date`s survive with progressive JSON; `hydrate(trpc, state)` writes them into the browser's client before it renders.

```ts twoslash
// ---cut-start---
import {
  createReactClient,
  dehydrate,
  hydrate,
} from '@trpc12/experimental-react';
import { httpLink, routerType } from '@trpc12/trpc/client';
import type { AppRouter } from './server.ts';
const makeTrpc = (isServer: boolean) =>
  createReactClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: '/trpc' })],
    isServer,
  });
const serverTrpc = makeTrpc(true);
const trpc = makeTrpc(false);
// ---cut-end---
const state = dehydrate(serverTrpc); // send it with the HTML
hydrate(trpc, state); // in the browser, before hydrateRoot
```

A request's client ends with `using`, or with a `scope` when the request is an Effect. Ending it disposes its store: requests still in flight end, and a later `.query()` with no data rejects with `CLIENT_CLOSED_REQUEST`.

```ts twoslash
// ---cut-start---
import { createReactClient } from '@trpc12/experimental-react';
import { httpLink, routerType } from '@trpc12/trpc/client';
import { Effect } from 'effect';
import type { AppRouter } from './server.ts';
const options = {
  router: routerType<AppRouter>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc' })] as const,
};
// ---cut-end---
export async function renderPage(id: string) {
  using trpc = createReactClient(options);
  return await trpc.post.byId.query({ id }); // render with it
}

export const renderPageEffect = (id: string) =>
  Effect.gen(function* () {
    // It ends when the request's scope closes.
    const trpc = createReactClient({ ...options, scope: yield* Effect.scope });
    return yield* Effect.promise(() => trpc.post.byId.query({ id }));
  });
```
