---
title: Message ports
description: Serve calls over a MessagePort, a web Worker or a worker_threads port.
section: Adapters
order: 8
---

`handler.messagePort(port)` serves calls over a `MessagePort`, a web `Worker` or a `worker_threads` port. Messages are structured-cloned objects in the same format as WebSocket messages, so subscriptions, deferred values, aborts and `connectionParams` work as they do over [`wsLink`](../client/links.md).

```ts
// worker.ts
import { parentPort } from 'node:worker_threads';

createFetchHandler({
  router,
  createContext: ({ info }) => ({
    token: info.connectionParams?.['token'],
    transport: info.transport, // 'messagePort'
  }),
}).messagePort(parentPort);
```

On the other side, `experimental_messagePortLink` sends calls to the port:

```ts
import {
  createTrpcClient,
  experimental_messagePortLink,
  routerType,
} from '@trpc12/trpc/client';

const worker = new Worker(new URL('./worker.ts', import.meta.url), {
  type: 'module',
});

const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [experimental_messagePortLink({ port: worker })],
});
```

- `createContext` gets the request passed as `handler.messagePort(port, { request })`, or a placeholder `http://localhost/` request.
- Bytes in [streamed outputs](../server/files.md) pass as they are, without base64. Files as inputs aren't sent; the call fails with a `BAD_REQUEST`.
- Closing the port is up to you. Electron's `MessagePortMain` and iframe windows work too.
