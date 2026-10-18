# Realtime example

A chat whose server processes share events through a `Publisher` on Redis or on Postgres. Clients subscribe over WebSockets (`wsLink`) or read the SSE endpoint with a plain `EventSource`, and resume from their last event id when they come back, when their server restarts, and when a server drops their idle socket.

```
server.ts     the router, and a server process: BACKEND=redis|postgres PORT=3000 node server.ts
publisher.ts  the Redis and Postgres publisher recipes (docs/subscriptions/backends.md)
index.ts      the smoke: starts server processes and runs each scenario on both backends
```

What `index.ts` checks, on Redis and then on Postgres:

- **Across servers:** Bob subscribes on server B, Alice posts on server A, and Bob gets her messages (with their `Date`s, through danSON).
- **Resume:** Bob leaves, misses a message, and subscribes again on A with `lastEventId`; the backend's history replays what he missed.
- **A channel per audience:** each user's inbox is its own channel, named from the token in `ctx`, so Bob and Carol get only their own messages, and a client without a token gets `UNAUTHORIZED`. `wsLink` sends the token as `connectionParams`, since browsers can't set WebSocket headers.
- **Server restart:** server A gets SIGTERM while Bob (`wsLink`) and a browser-style `EventSource` read a room on it. Alice posts through B while A is down, and A comes back on the same port. Both readers reconnect on their own and get the missed message, then the next one.
- **Keep-alive:** server B closes sockets that send nothing for a second (`websocket: { idleTimeoutMs }`). Bob's link pings and keeps one connection through quiet seconds; a link with `keepAlive: false` is dropped, reconnects and still gets every message.

`server.ts` sets `gracefulShutdownTimeout` on Node's server: on shutdown it waits that long for open connections to end, 20 s by default, and subscriptions never end on their own.

Run it from `next/` with `pnpm example`, or here with `pnpm smoke`. It needs Redis (`REDIS_URL`, default `redis://127.0.0.1:6379`) and Postgres (`DATABASE_URL`, default `postgres://postgres:postgres@127.0.0.1:5432/postgres`); `index.ts` creates the Postgres recipe's `trpc_events` table. Node 24 has `EventSource` behind `--experimental-eventsource`, which `pnpm smoke` passes.

`Publisher` is tagged stable, but its docs pages (and the backend recipes') are still hidden for review, so treat that part as unreviewed.
