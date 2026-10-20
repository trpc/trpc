# Realtime example

A chat whose servers share events through an `experimental_Publisher` on Redis or on Postgres. Clients subscribe over WebSockets (`wsLink`) or read the SSE endpoint with a plain `EventSource`, and resume from their last event id when they come back, when their server restarts, and when a server drops their idle socket.

```
server.ts     the router and listen(port, { backend, idleTimeout })
client.ts     main(url, cluster?): the clients and what they check
start.ts      two servers per backend, Redis then Postgres, and main() against them
publisher.ts  the Redis and Postgres publisher recipes (https://v12.trpc.io/v12/docs/subscriptions/backends)
```

What `client.ts` checks:

- **Across servers:** Bob subscribes on the other server, Alice posts on hers, and Bob gets her messages (with their `Date`s, through danSON).
- **Resume:** Bob leaves, misses a message, and subscribes again on Alice's server with `lastEventId`; the backend's history replays what he missed.
- **A channel per audience:** each user's inbox is its own channel, named from the token in `ctx`, so Bob and Carol get only their own messages, and a client without a token gets `UNAUTHORIZED`. `wsLink` sends the token as `connectionParams`, since browsers can't set WebSocket headers.
- **Server restart:** Alice's server stops while Bob (`wsLink`) and a browser-style `EventSource` read a room on it. Alice posts through the other server while it's down, and it comes back on the same port. Both readers reconnect on their own and get the missed message, then the next one.
- **Keep-alive:** the other server closes sockets that send nothing for a second (`websocket: { idleTimeout }`). Bob's link pings and keeps one connection through quiet seconds; a link with `keepAlive: false` is dropped, reconnects and still gets every message.

The restart and keep-alive checks need the second server and the restart that `start.ts` passes as `cluster`; `main(url)` alone runs the others against one server.

`listen` sets `gracefulShutdownTimeout` on Node's server: on close it waits that long for open connections to end, 20 s by default, and subscriptions never end on their own. It then closes the connections left idle, since a client reusing one would hang.

Run it with `pnpm start` here, or `pnpm example` from `next/`. `pnpm server` (`BACKEND=postgres`, `PORT`) and `pnpm client [url]` run the halves apart; start a second server on another port and point a client at each to see events cross servers. It needs Redis (`REDIS_URL`, default `redis://127.0.0.1:6379`) and Postgres (`DATABASE_URL`, default `postgres://postgres:postgres@127.0.0.1:5432/postgres`); the Postgres backend creates its `trpc_events` table on start. Node 24 has `EventSource` behind `--experimental-eventsource`, which `pnpm start` and `pnpm client` pass.

`experimental_Publisher` is experimental: its docs pages (and the backend recipes') are still hidden for review, and it might change or go away in any release.
