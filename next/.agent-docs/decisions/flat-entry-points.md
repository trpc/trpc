# Entry points are flat: `trpcdev/server` includes the fetch handler (agent)

- Answers Q1.2 (proposal 01), unanswered by a human, the Effect-native way: one subpath per concern, not per runtime. `trpcdev/server` holds the builder, routers and the web-standard fetch handler; runtimes come from Effect platform layers (`NodeHttpServer.layer`, `BunHttpServer.layer`) through `trpcdev/http`, so there is no `./server/node` or `./ws` ([`platforms-through-effect-layers.md`](./platforms-through-effect-layers.md)).
- (agent) Runtime-specific code that can't be a layer gets its own subpath named after the platform: `trpcdev/cloudflare` (hibernation), `trpcdev/aws-lambda`.
- Why: Effect already abstracts the runtime, so per-runtime subpaths would split one handler into copies; fewer entry points are fewer import paths to learn and keep stable.
- Lost: importing only the fetch handler without the builder (tree-shaking covers it).
- Lives in: `packages/trpcdev/package.json` (`exports`), `README.md` (entry points).
