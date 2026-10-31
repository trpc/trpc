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

Route loaders prefetch the queries a page needs ([`/src/queries.ts`](./src/queries.ts)) and components read them with `useSuspenseQuery`. During SSR, procedures are called in-process with `unstable_localLink`; the browser talks to `/api/trpc` over HTTP.

## Setup

```sh
git clone git@github.com:trpc/examples-next-sse-chat.git
pnpm i
cp .env.example .env
pnpm dev
```
