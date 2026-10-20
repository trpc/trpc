# `subscribe()` gets its `AsyncIterable` from the link that carries subscriptions (agent)

- (agent) The core client held `subscribe()`, and with it Effect's `Stream.toAsyncIterable`, which reports close failures through `Effect.logError` and so brings the logger and `Duration`. Every client paid for it, also one that never subscribes. Cut 4 of [`client-bundle-anatomy.md`](../notes/client-bundle-anatomy.md), done the way that keeps Effect's API ([`effect-apis-over-hand-rolled.md`](./effect-apis-over-hand-rolled.md)) rather than with a hand-written iterator.
- (agent) A link that carries subscriptions records the converter: `withSubscriptions(link)` from `@trpc12/trpc/client`. `httpLink`, `localLink`, `wsLink`, `experimental_socketLink`, `experimental_messagePortLink`, `experimental_openApiLink` and `fromV11Link` do, `splitLink` and `switchLink` pass on their branches', and `subscribe()` uses the first one on the chain. `httpLink({ subscriptions: false })` still records it, so its subscriptions keep failing with `METHOD_NOT_SUPPORTED` from the link. The Effect client (`createEffectClient`) hands out the `Stream` itself and needs none.
- (agent) A chain where nothing records one: `subscribe()` fails with `CLIENT_ERROR` ("No link on this chain carries subscriptions; wrap a custom one in withSubscriptions()"). A custom link that ends a subscription's chain needs the wrapper. The types don't ask for it: subscriptions are typed by `unsupported`, and a link's type can't say whether it was wrapped.
- (agent, 2026-10-20) Gzipped bytes, `pnpm bench budget`'s bundler, `v12` at 454a3d1de before / after:

  | client                                 | before |  after |
  | -------------------------------------- | -----: | -----: |
  | bare (`createTrpcClient`, no links)    | 16,966 | 12,474 |
  | minimal (`httpLink`, JSON)             | 39,770 | 39,853 |
  | full (`retryLink`, `httpLink`, danSON) | 44,060 | 44,156 |

  It saves only on clients without a subscription link: `httpLink` carries SSE subscriptions, so it keeps the iterator, and the full client keeps it either way through danSON's `AsyncIterable`s (`serializer/danson/stream.ts`). The saving reaches `httpLink` clients once SSE is an import of its own ([bundle cut 3](https://github.com/trpc/trpc/pull/7688)), which would record the iterator instead of `httpLink`.

- Why: the iterator is subscription code, and an app that subscribes imports a link that carries them. The registry follows the per-link metadata the client already reads (`withSerializer`, `setSwitchNames`).
- Lost: about 0.1 kB on clients that keep the iterator (the registry, and the error's message). Custom subscription links must be wrapped.
- Lives in: `packages/trpc/src/client/subscriptions.ts` (`withSubscriptions`), `src/client/link.ts` (`setSubscriptionIterator`, `chainSubscriptionIterator`), `src/client/client.ts` (`createUntypedClient`), `src/client/links/basic.ts` (`splitLink`), `src/client/links/switch.ts`, `docs/client/custom-links.md`.
