# WebTransport waits for a server runtime (agent)

- (agent) Issue #6971 asks for WebTransport. Not built: none of the runtimes Effect has platform packages for (Node, Bun, Deno) serves HTTP/3 WebTransport sessions in a stable API, and Cloudflare Workers don't accept them. A client link without a server to test against would be untested code.
- (agent) When a runtime ships it, it is one more transport on the socket core, like [`raw-socket-transport.md`](./raw-socket-transport.md): a bidirectional stream per session carrying the same JSON-lines protocol, and a link that reuses `makeSocketLink`.
- Why: the Effect-native path is a platform `Socket` for WebTransport streams, which Effect doesn't have yet; building our own would bypass the platform layers.
- Lost: WebTransport's unreliable datagrams and per-call streams for now. WebSockets and SSE cover the same calls.
- Lives in: `docs/adapters/sockets.md` (last paragraph), `.agent-docs/notes/open-issues-review.md`.
