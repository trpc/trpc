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

The [`/blog`](./src/routes/blog/$slug.tsx) pages are a blog whose loaders start queries that depend on each other, in one request. The post page's author is loaded with `experimental_dataOf(post).authorId`, and its "More by" list is an infinite list filtered by that author's id. The post list is infinite too, and loads an author for every post with `experimental_entryPerItem()`. A row gets its author's handle from its post, with `experimental_handleOfItem(handles.authors, post)`. Scrolling loads the next page and its authors in one request as well. The list's **Slow queries** switch makes the server wait 1 to 3 seconds in the author and “More by” queries, so you can watch each part of a page load after the one before it. This needs `experimental_pipelining` on the link and `experimental_allowPipelining` on the handler.

## Setup

```sh
git clone git@github.com:trpc/examples-tanstack-start-sse-chat.git
pnpm i
cp .env.example .env
pnpm dev
```
