# Worker threads example (experimental)

A tRPC server inside a Node `worker_threads` Worker (`worker.ts`, `handler.messagePort(parentPort)`), called from the main thread with `experimental_messagePortLink({ port: worker })`:

- `createContext` gets the link's `connectionParams` and `info.transport` (`'messagePort'`).
- A CPU-heavy query runs on the worker while the main thread's timers keep firing.
- Deferred values and a `File` output cross the port with danSON, set on both ends.
- Leaving a subscription early aborts the worker's resolver.

See [Message ports](../../../docs/adapters/message-ports.md). `experimental_messagePortLink` is experimental and may change in any release; the server side, `handler.messagePort()`, is stable but its docs page is still hidden (unreviewed). The same code serves a browser Web Worker, an iframe or Electron's `MessagePortMain`.

Run it from `next/` with `pnpm example`, or here with `pnpm smoke`.
