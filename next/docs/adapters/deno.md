---
title: Deno
description: Deno.serve with handler.fetch, which upgrades WebSockets with Deno.upgradeWebSocket.
section: Adapters
order: 4
---

```ts
const handler = createFetchHandler({
  router,
  middleware: [cors({ allowedOrigins: ['https://app.example.com'] })],
  websocket: { upgrade: Deno.upgradeWebSocket },
});
Deno.serve((request) => handler.fetch(request));
```

With `websocket.upgrade`, `handler.fetch` upgrades WebSocket requests to the endpoint inside the handler's `middleware`, as `serve(handler)` does on Node and Bun. `cors()` answers an upgrade from another origin with a `403` before the socket opens. Deno's `WebSocket` is the web-standard one, so subscriptions, `connectionParams` and keep-alive pings work as they do on Node.

Already upgraded the socket yourself? `handler.websocket(socket, { request })` serves it, but skips `middleware`: check the origin before you upgrade.
