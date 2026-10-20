---
title: Which client bundle cuts should land before `0.1.0`?
summary: Six draft PRs shrink the 39.8 kB minimal client; four change `httpLink`'s options, one drops `effect/http`, one drops Effect from the default client.
area: bundle
recommended: C
links:
  - kind: pr
    label: 'Cut 1: raw fetch (#7710)'
    url: https://github.com/trpc/trpc/pull/7710
  - kind: preview
    label: 'Cut 1: httpLink'
    url: https://trpc-v12-git-v12-bundle-cut-1-raw-fetch-trpc.vercel.app/v12/docs/client/links/http
  - kind: pr
    label: 'Cut 2: deferred framing out of Serializer (#7713)'
    url: https://github.com/trpc/trpc/pull/7713
  - kind: preview
    label: 'Cut 2: your own serializer'
    url: https://trpc-v12-git-v12-bundle-cut-2-split-deferred-2-trpc.vercel.app/v12/docs/server/serializers#your-own-serializer
  - kind: pr
    label: 'Cut 3: batching() and sse() (#7711)'
    url: https://github.com/trpc/trpc/pull/7711
  - kind: preview
    label: 'Cut 3: httpLink'
    url: https://trpc-v12-git-v12-bundle-cut-3-sse-batching-trpc.vercel.app/v12/docs/client/links/http
  - kind: pr
    label: 'Cut 4: withSubscriptions (#7712)'
    url: https://github.com/trpc/trpc/pull/7712
  - kind: preview
    label: 'Cut 4: sending subscriptions'
    url: https://trpc-v12-git-v12-bundle-cut-4-subscribe-iterator-trpc.vercel.app/v12/docs/client/custom-links#sending-subscriptions
  - kind: pr
    label: 'Cut 5: experimental_httpStreams() (#7714)'
    url: https://github.com/trpc/trpc/pull/7714
  - kind: preview
    label: 'Cut 5: streamed outputs and files'
    url: https://trpc-v12-git-v12-bundle-cut-5-http-streams-trpc.vercel.app/v12/docs/client/links/http#streamed-outputs-and-files
  - kind: pr
    label: 'Cut 6: a client without Effect (#7715)'
    url: https://github.com/trpc/trpc/pull/7715
  - kind: preview
    label: 'Cut 6: httpLink and httpStreamLink'
    url: https://trpc-v12-git-v12-bundle-cut-6-max-squeeze-2-trpc.vercel.app/v12/docs/client/links/http
  - kind: spike
    label: client-bundle
    url: ../../spikes/client-bundle/
  - kind: note
    label: client-bundle-anatomy
    url: ../notes/client-bundle-anatomy.md
  - kind: decision
    label: http-link-on-effect-http
    url: ../decisions/http-link-on-effect-http.md
  - kind: decision
    label: one-http-link
    url: ../decisions/one-http-link.md
  - kind: decision
    label: orpc-v2-parity
    url: ../decisions/orpc-v2-parity.md
  - kind: decision
    label: effect-apis-over-hand-rolled
    url: ../decisions/effect-apis-over-hand-rolled.md
---

# Which client bundle cuts should land before `0.1.0`?

## Why it matters

The minimal client (`createTrpcClient` + `httpLink`, JSON) is 39.8 kB gzipped and the full one (`retryLink`, SSE, danSON) 44.1 kB, against aims of 18 and 25 kB; v11's like-for-like client is 9.4 kB and oRPC's 9.6 kB. The research found no accidental imports: the bytes are `effect/http`, every `httpLink` feature switched by a runtime flag, the server's encoder inside `jsonSerializer`, and `subscribe()`'s iterator in the core. Each cut is a draft PR; four change public options, which is cheapest before the first publish. Sizes don't block a publish ([orpc-v2-parity](../decisions/orpc-v2-parity.md), "c)").

## Options

### A) Keep it as it is for `0.1.0`

Land none of the cuts now; `httpLink` keeps its flags.

```ts
httpLink({
  url: '/trpc',
  batch: { maxItems: 20 }, // or batch: true; off by default
  binary: true,
  reconnect: { attempts: 3 }, // SSE subscriptions are on by default
});
```

- ✅ No API churn; the docs, codemod and examples stay as they are
- ❌ 39.8 kB minimal and 44.1 kB full, every flag's code shipped whether it's on or not
- ❌ The option changes come after users have adopted `batch: true`

### B) Cuts 2 to 5: features become imports

`batching()`, `sse()` and `experimental_httpStreams()` are passed to `httpLink`; what isn't passed isn't bundled. Deferred-value framing leaves `Serializer`, and `subscribe()`'s iterator comes from the link that carries subscriptions. Still one link, still Effect and `effect/http`.

```ts
// before
httpLink({ url: '/trpc', batch: true, binary: true }); // SSE on by default

// after
import { batching, experimental_httpStreams, httpLink, sse } from '@trpc12/trpc/client';

httpLink({ url: '/trpc' }); // JSON only: no batching, no .subscribe(), no streamed outputs
httpLink({
  url: '/trpc',
  batch: batching({ maxItems: 20 }),
  subscriptions: sse({ reconnect: { attempts: 3 } }),
  streams: experimental_httpStreams({ binary: true }),
});

// a custom link that ends a subscription's chain
const eventsLink = withSubscriptions(link((opts) => /* … */));
```

- ✅ Reverses no human decision: one `httpLink` stays, and the human's "opt out of batching etc" becomes opt-in imports
- ✅ About 27.6 kB minimal (research estimate, all four stacked); the bare client 17.0 → 12.5 kB
- ❌ Breaks today's options: `batch: true`, SSE on by default, `binary`, a custom `Serializer`'s two stream methods, unwrapped custom subscription links
- ❌ Without `experimental_httpStreams()`, a streamed output fails at runtime with `UNSUPPORTED_PROTOCOL`; the types don't catch it

### C) B, plus cut 1: send with `fetch` through Effect's primitives

As B, and `httpLink` drops `effect/http`'s `HttpClient` for `fetch` in `Effect.tryPromise`, a `Scope` finalizer that aborts, and `Stream.fromReadableStream`. No public API changes beyond B's.

```ts
import { batching, httpLink, sse } from '@trpc12/trpc/client';

// the same options as B; a custom fetch still gets a string URL and web Headers
httpLink({
  url: '/trpc',
  fetch: myFetch,
  batch: batching(),
  subscriptions: sse(),
});
```

- ✅ Reaches the 18 kB aim with Effect as the runtime: about 16–17 kB minimal, 28–30 kB full
- ✅ Still Effect primitives, the human's own words for `httpLink` ("use effects primitive for fetch etc")
- ❌ Reverses [http-link-on-effect-http](../decisions/http-link-on-effect-http.md) (human asked): about 40 lines of request building and body reading are ours, and Effect's `HttpClient` fixes no longer arrive with a version bump
- ❌ Apps that already use `HttpClient` bundle it next to `httpLink`'s own `fetch` path

### D) Cut 6: a Promise client without Effect

`createTrpcClient` runs links as Promises; `httpLink` becomes a plain `fetch` link for queries and mutations, and the old link is renamed `httpStreamLink`. Effect links still mix in, and the first one brings the runtime.

```ts
// before
httpLink({ url, batch: true });

// after
import { httpLink, httpStreamLink, promiseLink } from '@trpc12/trpc/client';

httpLink({ url }); // fetch, queries and mutations, no Effect: 3.85 kB
httpStreamLink({ url, batch: true }); // the old httpLink: batching, streams, SSE

const auth = promiseLink((opts) =>
  opts.next({
    ...opts.op,
    context: { ...opts.op.context, headers: { authorization: token() } },
  }),
);
createTrpcClient({ router, links: [retryLink(), auth, httpLink({ url })] });
```

- ✅ 3.85 kB minimal, smaller than v11's `httpLink` alone (5.3 kB) and oRPC (9.6 kB); v11's `httpLink` maps to it one to one
- ❌ Reverses human decisions: links on Effect with an 18 kB target ([orpc-v2-parity](../decisions/orpc-v2-parity.md), "B"), one HTTP link ([one-http-link](../decisions/one-http-link.md), tentative), and [http-link-on-effect-http](../decisions/http-link-on-effect-http.md) and [effect-apis-over-hand-rolled](../decisions/effect-apis-over-hand-rolled.md) (both human asked)
- ❌ The full client grows (44.5 kB), `TrpcError` becomes yieldable only on first Effect use, and two link kinds to document

## Recommendation

**C.** It's the only way to the 18 kB aim that keeps Effect as the client's runtime ([effect-native-by-default](../decisions/effect-native-by-default.md)), and it keeps one `httpLink`. Cut 1 still uses Effect primitives, as the human first asked for `httpLink`; what it gives up is `effect/http`'s request models. D is the size v11 users expect, but it reverses "links stay on Effect", which the human picked over a Promise core.

## Blocked until answered

- The six PRs stay drafts. Cuts 3 and 4 need a one-line merge (`sse()` marks the link with `withSubscriptions`); cut 5 is stacked on cut 3; cut 6 conflicts with the others.
- `httpLink`'s docs, the v11 codemod's output and the examples change with B, C or D, so publishing `0.1.0` first means a breaking change after it.
- The tentative "one `httpLink`" decision ([one-http-link](../decisions/one-http-link.md), queue item "Should one `httpLink` stay the only HTTP link, or should simple apps get a slimmer one?"): B and C answer it "one link, features as imports"; D answers it "a slim `httpLink` and an `httpStreamLink`".

## Details

Sizes are gzip -9 with `pnpm bench budget`'s bundler, from each PR's body. They were measured on different `v12` commits, so treat them as close, not exact; today's budget run gives 39.8 kB minimal and 44.1 kB full.

- **Cut 1, raw `fetch` ([#7710](https://github.com/trpc/trpc/pull/7710)).** Minimal 39.8 → 31.8 kB, full 44.1 → 36.1 kB alone. No public API change. Reverses [http-link-on-effect-http](../decisions/http-link-on-effect-http.md); a middle ground the PR names is an opt-in `httpLink({ client: HttpClient })`.
- **Cut 2, deferred framing out of `Serializer` ([#7713](https://github.com/trpc/trpc/pull/7713)).** Minimal 39.8 → 39.2 kB, full 44.1 → 43.0 kB alone; with the spike's other cuts stacked, minimal 27.3 → 17.1 kB. `Serializer` keeps `name`, `kind`, `serialize` and `deserialize`; `serializeDeferred(serializer, value)` and `deserializeStream(serializer, frames)` move to `@trpc12/trpc/serializer`. The wire format is unchanged.
- **Cut 3, `batching()` and `sse()` ([#7711](https://github.com/trpc/trpc/pull/7711)).** Minimal 39.8 → 36.6 kB, full 44.1 → 42.7 kB; a client passing both pays about 0.2 kB more. `batch: true` throws a `TypeError` naming the import; subscriptions over HTTP need `sse()`, and `reconnect` moves into it. The codemod writes `batching()` and `sse()`.
- **Cut 4, `withSubscriptions` ([#7712](https://github.com/trpc/trpc/pull/7712)).** The bare client 17.0 → 12.5 kB; minimal +0.1 kB alone, since `httpLink` still carries SSE. With cut 3: minimal 36.6 kB, and 16.0 kB with the spike's other cuts. A custom terminal link that carries subscriptions must be wrapped, or `subscribe()` fails with `CLIENT_ERROR`; the types can't catch it.
- **Cut 5, `experimental_httpStreams()` ([#7714](https://github.com/trpc/trpc/pull/7714)).** On cut 3: minimal 36.6 → 35.1 kB, full 42.6 → 41.9 kB; 22.6 → 16.7 kB under the spike's `json`, `iterable` and `fetch` patches. `binary` moves into it. The handler answers a streamed output as JSONL whatever `accept` says, so without `streams` the link fails the call with `UNSUPPORTED_PROTOCOL` and cancels the body. Batched calls still read deferred values. It answers the Open bullet in [one-http-link](../decisions/one-http-link.md) (no opt-out of streamed results).
- **Cut 6, a client without Effect ([#7715](https://github.com/trpc/trpc/pull/7715)).** Bare 17.0 → 2.0 kB, minimal 39.8 → 3.85 kB, `retryLink` + `httpLink` 40.0 → 20.2 kB, full (with `httpStreamLink`) 44.1 → 44.5 kB, `createEffectClient` 39.9 → 40.6 kB. New exports `promiseLink` and `httpStreamLink`; the codemod maps v11's batch, stream and SSE links to `httpStreamLink`.
- **Where Effect's floor sits.** Links as `Stream`s can't go below about 11 kB of Effect plus 3 kB of tRPC; 10 kB needs a Promise core, which is D. The research's "all five on Effect" estimate is 16.3 kB minimal and 28.2 kB full.
