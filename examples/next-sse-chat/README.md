# tRPC + Server-sent Events (SSE)

This example showcases the use of `httpSubscriptionLink` to facilitate `.useSubscription` via [Server-sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events).

Try demo http://sse.trpc.io/

## Features

- 🧙‍♂️ E2E type safety with [tRPC](https://trpc.io)
- ⚡ Full-stack React with Next.js
- ⚡ Server-Sent-Events / Subscription support
- ⚡ Database with [Drizzle](https://orm.drizzle.team/)
- 🔐 Authorization using [next-auth](https://next-auth.js.org/)

## Code

This project includes 2 examples of the subscription pattern:

1. Simple example of `whoIsTyping`
2. A slightly more involved example of `livePosts`

- Hooks for both cases (using `trpc.{x}.useSubscription`) can be found in [`/src/app/channels/[channelId]/hooks.ts`](./src/app/channels/[channelId]/hooks.ts)
- The `EventEmitter` & `whoIsTyping` subscription route can be found in [`/src/server/routers/channel.ts`](./src/server/routers/channel.ts)
- The more complex `post` subscription route can be found in [`/src/server/routers/post.ts`](./src/server/routers/post.ts)

## Setup

```sh
git clone git@github.com:trpc/examples-next-sse-chat.git
pnpm i
cp .env.example .env
pnpm dev
```
