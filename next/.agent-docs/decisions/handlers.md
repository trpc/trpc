# One fetch handler, created once, serves HTTP, WebSockets and message ports (human)

- Human, 2026-10-15 (Q12.2): "A". The handler is created once, not per request: routes, layers and the serializer are set up a single time, and the handler owns sockets and `dispose()`.
- Lost: v11's per-request `fetchRequestHandler({ req, router, … })`.
- (agent, P-A) `createFetchHandler({ router, createContext?, layer?, serializer?, onError?, batch?, endpoint? })` returns `{ fetch, websocket, messagePort, dispose }`.
- (agent) `websocket(socket, { request })` takes any standard `WebSocket` ([`websocket-standard-interface.md`](./websocket-standard-interface.md)). `messagePort(port)` takes a `MessagePort`, a `Worker` or a `worker_threads` port.
- (agent) On sockets, `createContext` runs once per request message, with `info.transport` and `info.connectionParams`. A port without a request gets a placeholder `http://localhost/` request.
- (agent, Q13.4; human: "Pick what you want for now") Plugins only handle requests and responses (CORS, body limits). They don't contribute typed context; middleware does that.
- Serving on each runtime is [`platforms-through-effect-layers.md`](./platforms-through-effect-layers.md).
- Lives in: `packages/trpc/src/server/fetch.ts`, `core.ts`, `socket.ts`.
