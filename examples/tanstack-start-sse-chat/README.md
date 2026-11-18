# tRPC + Server-sent Events (SSE)

This example showcases the use of `httpSubscriptionLink` to facilitate `useSubscription` via [Server-sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events).

Try demo http://sse.trpc.io/

## Features

- 🧙‍♂️ E2E type safety with [tRPC](https://trpc.io)
- ⚡ Full-stack React with [TanStack Start](https://tanstack.com/start)
- ⚡ Server-Sent-Events / Subscription support
- ⚡ Database with [Drizzle](https://orm.drizzle.team/)
- 🔐 Authorization using [Auth.js](https://authjs.dev/)

## Code

This project includes 2 examples of the subscription pattern:

1. Simple example of `whoIsTyping`
2. A slightly more involved example of `livePosts`

- Hooks for both cases (using `useSubscription`) can be found in [`/src/routes/channels/-components/hooks.ts`](./src/routes/channels/-components/hooks.ts)
- The `EventEmitter` & `whoIsTyping` subscription route can be found in [`/src/server/routers/channel.ts`](./src/server/routers/channel.ts)
- The more complex `post` subscription route can be found in [`/src/server/routers/post.ts`](./src/server/routers/post.ts)

Route loaders start the queries a page needs with `loadHandles` and prefetch entries from `@trpc/tanstack-react-query/unstable-handles`, and return the handles. Components read them with `useSuspenseQuery(fromHandle(trpc, handle))`. During SSR, procedures are called in-process with `localLink`; the browser talks to `/api/trpc` over HTTP.

The [`/blog`](./src/routes/blog/$slug.tsx) pages are a blog whose loaders start queries that depend on each other, in one request, and wait for none of them: every entry is a prefetch entry. The post page's author is built from the post with `experimental_dataOf(post, (post) => entry)`, and its "More from the team" list from the author, an infinite list filtered by the `teamId` that only the author has. The author card finishes its handles with the data they are built from, with `experimental_handleOfItem(handle, data)`. The post list is infinite too, and loads an author for every post with `experimental_entryPerItem()`. A row gets its author's handle from its post, with `experimental_handleOfItem(handles.authors, post)`. Scrolling loads the next page and its authors in one request as well. A post that isn't there fails where it is read, and the route's error component shows it. The blog's settings sit in one bar on every blog page, kept in the URL (`?slow=true&preload=intent`) and carried across the blog's links with TanStack Router's `retainSearchParams`: **Slow queries** makes the server wait 1 to 3 seconds in every query of the blog, so you can watch each part of a page load after the one before it, and **Preload links** picks when a link loads the page it goes to, off by default so each page's request is easy to find. **Reset** puts both back. Dashed notes next to each part say which query loaded it and what it waited for, such as the post page's server-side waterfall: hover or focus one, or an author's name in the list. While a part loads, its Suspense fallback says what it is waiting for. This needs `experimental_pipelining` on the link and `experimental_allowPipelining` on the handler. See [Nested queries in one request](https://trpc.io/docs/client/tanstack-react-query/nested-queries).

## Setup

```sh
git clone git@github.com:trpc/examples-tanstack-start-sse-chat.git
pnpm i
cp .env.example .env
pnpm dev
```
