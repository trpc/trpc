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
  const upgrade = Deno.upgradeWebSocket(request);
  handler.websocket(upgrade.socket, { request });
  return upgrade.response;
});
```

Deno's `WebSocket` is the web-standard one, so `handler.websocket` serves it directly: subscriptions, `connectionParams` and keep-alive pings work as they do on Node.
