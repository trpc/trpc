# WebSocket keep-alive pings from the client (agent)

- `wsLink` pings every 30 s (`keepAlive: { intervalMs, timeoutMs }`, `false` for none). A connection that answers nothing within 10 s is treated as lost and reconnects, since a dead network may never deliver a close. Each ping's `timeoutMs` runs beside the interval, so pings go out every `intervalMs`, not every `intervalMs + timeoutMs` (human asked: "fix").
- The wire messages are `{ type: 'ping' }` and `{ type: 'pong' }`. Pings are messages, not protocol pings, because browsers can't send those. The server doesn't ping; it only answers.
- Lost: server-initiated pings, which would keep idle hibernated Durable Objects awake.
- Lives in: `packages/trpc/src/client/links/socket.ts`, `src/server/sockets/socket.ts`, `src/internal/protocol.ts`.
