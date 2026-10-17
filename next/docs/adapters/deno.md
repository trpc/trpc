---
title: Deno
description: Deno.serve with handler.fetch, and handler.websocket for upgrades.
section: Adapters
order: 4
---

```ts
Deno.serve((request) => {
  if (request.headers.get('upgrade') !== 'websocket')
    return handler.fetch(request);
  const { socket, response } = Deno.upgradeWebSocket(request);
  handler.websocket(socket, { request });
  return response;
});
```

Deno's `WebSocket` is the web-standard one, so `handler.websocket` serves it directly: subscriptions, `connectionParams` and keep-alive pings work as they do on Node.
