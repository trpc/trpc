# One fetch handler serves HTTP, WebSockets and message ports (agent)

- P-A: `createFetchHandler({ router, createContext?, layer?, serializer?, onError?, batch?, endpoint? })` returns `{ fetch, websocket, messagePort, dispose }`.
- `websocket(socket, { request })` takes any standard `WebSocket` ([`websocket-standard-interface.md`](./websocket-standard-interface.md)). `messagePort(port)` takes a `MessagePort`, a `Worker` or a `worker_threads` port.
- On sockets, `createContext` runs once per request message, with `info.transport` and `info.connectionParams`. A port without a request gets a placeholder `http://localhost/` request.
- Serving on Node or Bun is [`platforms-through-effect-layers.md`](./platforms-through-effect-layers.md).
- Lives in: `packages/trpcdev/src/server/fetch.ts`, `core.ts`, `socket.ts`.
