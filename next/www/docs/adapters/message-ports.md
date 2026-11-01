---
title: Message ports
description: Serve calls over a `MessagePort`, a web Worker or a `worker_threads` port.
section: Adapters
order: 8
experiment: adapters
---

`handler.messagePort(port)` serves calls over a `MessagePort`, a web `Worker` or a `worker_threads` port. Messages are structured-cloned objects in the same format as WebSocket messages, so subscriptions, deferred values, aborts and `connectionParams` work as they do over [`wsLink`](../client/links.md).

```ts twoslash
// ---cut-start---
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
const t = initTrpc();
const router = t.router({ health: t.procedure.query(() => 'ok') });
// ---cut-end---
// worker.ts
import { parentPort } from 'node:worker_threads';

if (!parentPort) throw new Error('worker.ts runs in a worker thread');

createFetchHandler({
  router,
  createContext: (opts) => ({
    token: opts.info.connectionParams?.['token'],
    transport: opts.info.transport, // 'messagePort'
  }),
}).messagePort(parentPort);
```

On the other side, `experimental_messagePortLink` sends calls to the port:

```ts twoslash
// ---cut-start---
import type { AppRouter } from './server.ts';
// ---cut-end---
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
- When the port closes or `handler.dispose()` runs, the handler removes the listeners it added, if the port has `off` or `removeEventListener`.

The [`examples/experimental/worker-threads`](../../../examples/experimental/worker-threads/README.md) app serves a router from a Node worker thread: CPU work off the main thread, `connectionParams`, files, and a subscription left early.

## Credits

Serving calls over message ports follows [oRPC's Message Port adapter](https://orpc.dev/docs/adapters/message-port).
