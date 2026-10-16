# No built-in compression; the platform or an `HttpMiddleware` compresses (agent)

- Proposal 13's plugin table listed `compression` as "off … may be better left to the platform"; the human Q13 answer "C" ([`plugins-are-effect-middleware.md`](./plugins-are-effect-middleware.md)) leaves request-level concerns to Effect `HttpMiddleware`.
- (agent) @trpc12/trpc ships no compression. CDNs, Cloudflare, Vercel, nginx and Bun/Node proxies already negotiate `Accept-Encoding`; a handler-level gzip would double-compress there.
- (agent) Streaming responses (`application/jsonl`, `text/event-stream`) must flush every line. A `CompressionStream` buffers until its window fills, which stalls subscriptions and streamed mutations. Anyone adding compression via `middleware: […]` must skip those content types; `docs/platforms.md` shows the pattern.
- Why: Effect-native first ([`effect-native-by-default.md`](./effect-native-by-default.md)) means a plain `HttpMiddleware`, not a flag; the platform does it better.
- Lost: one-line `compression: true`.
- Lives in: `docs/platforms.md` ("Compression").
