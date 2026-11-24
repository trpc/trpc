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

Both subscriptions cover every channel, so switching channels doesn't resubscribe. New posts are added to the channel's cached posts; a channel that isn't loaded yet gets them when it loads. Typing names are picked out per channel.

- The channel page subscribes to both (with `useSubscription`) in [`/src/routes/channels/$channelId.tsx`](./src/routes/channels/$channelId.tsx); `useLivePosts` in [`/src/routes/channels/-components/hooks.ts`](./src/routes/channels/-components/hooks.ts) adds new posts to the query cache
- The `EventEmitter` & `whoIsTyping` subscription route can be found in [`/src/server/routers/channel.ts`](./src/server/routers/channel.ts)
- The more complex `post` subscription route can be found in [`/src/server/routers/post.ts`](./src/server/routers/post.ts)

Route loaders start the queries a page needs with `loadHandles` and prefetch entries from `@trpc/tanstack-react-query/unstable-handles`, and return the handles. Components read them with `useSuspenseQuery(fromHandle(trpc, handle))`. During SSR, procedures are called in-process with `localLink`; the browser talks to `/api/trpc` over HTTP.

## Setup

```sh
git clone git@github.com:trpc/examples-tanstack-start-sse-chat.git
pnpm i
cp .env.example .env
pnpm dev
```
