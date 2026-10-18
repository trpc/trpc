# The WebSocket handler takes a standard `WebSocket` (human)

- Human, 2026-10-09 (Q12.4): "yes I think effect has good websocket stuff". `handler.websocket(socket, { request })` accepts any WHATWG `WebSocket`-shaped object (`readyState`, `send`, `close`, `addEventListener`), so `@trpc12/trpc` has no `ws` dependency.
- Why: Bun, Deno, Cloudflare and browsers expose that interface, and Effect's `Socket` maps onto it. Servers without one get it from their platform layer (see [platforms-through-effect-layers.md](./platforms-through-effect-layers.md)).
- Lost: nothing in our code; on Node the platform's `ws` does the protocol.
- (agent) `handler.websocket()` turns the socket into an Effect `Socket` with `Socket.fromWebSocket`, so `WebSocketLike` also has `removeEventListener` ([`websocket-sessions-on-effect-socket.md`](./websocket-sessions-on-effect-socket.md)). Upgrades under `@trpc12/trpc/http` skip the `WebSocket` shape and serve Effect's `Socket` directly.
- Lives in: `packages/trpc/src/server/socket.ts` (`WebSocketLike`), `src/server/socket-session.ts` (`fromWebSocketLike`).
