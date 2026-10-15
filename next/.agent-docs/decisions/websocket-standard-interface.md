# The WebSocket handler takes a standard `WebSocket` (human)

- Alex, 2026-10-09 (Q12.4): "yes I think effect has good websocket stuff". `handler.websocket(socket, { request })` accepts any WHATWG `WebSocket`-shaped object (`readyState`, `send`, `close`, `addEventListener`), so `trpcdev` has no `ws` dependency.
- Why: Bun, Deno, Cloudflare and browsers expose that interface, and Effect's `Socket` maps onto it. Servers without one get it from their platform layer (see [platforms-through-effect-layers.md](./platforms-through-effect-layers.md)).
- Lost: nothing in our code; on Node the platform's `ws` does the protocol.
- Lives in: `packages/trpcdev/src/server/socket.ts` (`WebSocketLike`).
