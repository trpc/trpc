# WebSocket keep-alive is ratified; servers drop silent sockets (human)

- Human, 2026-10-16 (decisions round 3, Q23): "B".
- [`websocket-keep-alive.md`](./websocket-keep-alive.md) stands as built: `wsLink` pings every 30 s and reconnects after 10 s without an answer; the server answers `pong`.
- The server closes a socket that sends nothing, pings included, for `websocket.idleTimeoutMs` (default 60 s, `false` to disable), and stops its subscriptions.
- (agent) The close code is 1001 ("going away"), so a live client that was merely slow reconnects and resumes from `lastEventId`.
- (agent) Hibernating Durable Object sockets don't get the timer: it would wake the object, and Cloudflare already handles dead sockets there.
- Why: dead clients' subscriptions are cleaned up from the pings clients already send, with no new wire message.
- Lost: server-initiated pings for clients that never ping (a non-browser client must ping, or set its own idle handling).
- Lives in: `packages/trpc/src/server/socket.ts` (`serveConnection`), `src/server/fetch.ts` (`websocket.idleTimeoutMs`); `packages/trpc/src/server/websockets.test.ts`.
