# Cloudflare WebSocket hibernation in v1 (human)

- Alex, 2026-10-15 (issues review Q2, proposal Q14.7): "A". Hibernation ships in v1, not later.
- (agent) An adapter for the Durable Object handler style: `webSocketMessage(ws, message)` and `webSocketClose(ws, code, reason)` on the object call into the same socket core as `handler.websocket`. Per-connection state (the connection params and the request) lives in the socket's serialized attachment, so a woken object rebuilds it.
- (agent) Queries and mutations need nothing kept between messages. A subscription keeps the object awake while its generator runs, as Cloudflare requires for any pending work; hibernation helps idle connections, not open streams.
- Why: Workers are a first-class platform, and idle WebSocket connections on Durable Objects are billed unless they hibernate.
- Lost: oRPC's "durable iterator" (subscriptions that survive hibernation), which would need the publisher to replay into a rebuilt generator.
- Open: resuming subscriptions after the object wakes, through the publisher's resume buffer.
- Lives in: `packages/trpcdev/src/server/hibernation.ts`, `docs/platforms.md`.
