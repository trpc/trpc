# Worker threads example (experimental)

A tRPC server inside a Node `worker_threads` Worker (`server.ts`, `handler.messagePort(parentPort)`), called from the main thread with `experimental_messagePortLink({ port: worker })`:

- `createContext` gets the link's `connectionParams` and `info.transport` (`'messagePort'`).
- A CPU-heavy query runs on the worker while the main thread's timers keep firing.
- Deferred values and a `File` output cross the port with danSON, set on both ends.
- Leaving a subscription early aborts the worker's resolver.

See [Message ports](https://trpc.io/v12/docs/adapters/message-ports). `experimental_messagePortLink` is experimental and might change or go away in any release; the server side, `handler.messagePort()`, is stable but its docs page is still hidden (unreviewed). The same code serves a browser Web Worker, an iframe or Electron's `MessagePortMain`.

The server is a worker thread rather than a port, so this example bends the [examples layout](../../README.md): `server.ts` is the Worker's entry, `client.ts` exports `main(port)`, and `start.ts` starts the Worker and passes it to `main`. There are no `pnpm server` or `pnpm client` scripts, since a worker runs only inside the process that starts it. `pnpm start` runs it.
