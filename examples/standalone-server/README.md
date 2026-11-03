Bare-minimum example.

- Standalone HTTP-server + WebSocket
- Vanilla `TRPCClient` in node

Browsers don't apply CORS to WebSockets, so the server rejects pages from origins other than `http://localhost:2022`. List the origins you serve pages from in `WS_ALLOWED_ORIGINS`, separated by commas.

Try in StackBlitz: https://stackblitz.com/github/trpc/trpc/tree/main/examples/standalone-server?file=src%2Fserver.ts,src%2Fclient.ts&view=editor&terminal=dev

---

### Get started

Created by [@alexdotjs](https://twitter.com/alexdotjs).
