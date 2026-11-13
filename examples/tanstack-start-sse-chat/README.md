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

The [`/blog`](./src/routes/blog/$slug.tsx) pages are a fake blog that loads a post and its author in one request. The author's id is in the post, so the loader passes `dataOf(post).authorId` and, with `pipelining` on the link and `allowPipelining` on the handler, the server fills it in. The post's "More by" list goes a step further: it is an infinite list filtered by the id of the author, who is loaded with an id from the post. The post list loads an author for every post with `dataOf(posts).items.map((post) => prefetchEntry(trpc.blog.authorById, { id: post.authorId }))`. The pages have a switch for pipelining and show the requests they made.

## Setup

```sh
git clone git@github.com:trpc/examples-tanstack-start-sse-chat.git
pnpm i
cp .env.example .env
pnpm dev
```
