# @tanstack/router-ssr-query-core

## 1.169.3

### Patch Changes

- [#8204](https://github.com/TanStack/router/pull/8204) [`cbbfbe3`](https://github.com/TanStack/router/commit/cbbfbe37ab1dbe328c343cb437c5660769cc9f26) - Stream large deferred SSR hydration payloads through a backpressure-aware router transport, fail known setup errors before response creation, and close cancelled or expired transforms safely.

  Start now cancels discarded middleware and HEAD response bodies, including plain streams and derived branches.

  Server-function raw streams share one ordered response. Arbitrary or sequential consumption can require potentially unbounded buffering of unread data on the client. Cancelling one raw stream discards it locally, while aborting the whole call cancels the response and server work. Consume streams concurrently, cancel unused streams promptly, or use separate calls when independent backpressure is required. A raw stream that exceeds its unread-byte limit now fails alone; sibling streams and the JSON result keep flowing.

  The JSON wire shape of a `RawStream` server-function argument changed. Clients and servers must run matching versions for requests that pass a `RawStream`.

  The frame-protocol constants (`FRAME_TYPE_*`, `MAX_FRAME_PAYLOAD_SIZE`, `MAX_FRAMED_STREAMS`) moved from the `@tanstack/start-client-core` root to the `@tanstack/start-client-core/client-rpc` subpath.

  Router requests whose `Accept` header allows neither `text/html` nor `*/*` now receive `406 Not Acceptable` instead of `500`.

  Framework adapters share the body `<Scripts>` composition (`getSsrBodyScriptParts`, `composeSsrBodyScripts`) and the eager HTML response wrapper (`renderSsrHtmlResponse`) from `@tanstack/router-core`.

  Solid SSR now emits one document type and renders late lazy errors through route boundaries. A Solid `<Await>` without a `fallback` no longer holds the streamed shell; it renders inside the nearest `<Suspense>` boundary like React and Vue, and now renders falsy resolved values.

  Static server functions decode cached `RawStream` values with the client deserializer plugins.

  SSR Query integrations now keep request cleanup and stream ownership aligned with the router lifecycle.

## 1.169.2

### Patch Changes

- [#8175](https://github.com/TanStack/router/pull/8175) [`79e3533`](https://github.com/TanStack/router/commit/79e35335b4bb1c3b5e2275a8df5181aa05036628) - Dehydrate only queries for SSR transport, preserve pending-query promises, batch render-time query streaming, and clean up request-owned QueryClient resources.

## 1.169.1

### Patch Changes

- [#7497](https://github.com/TanStack/router/pull/7497) [`d1997b6`](https://github.com/TanStack/router/commit/d1997b66d7c24c1d64772bb8bab5caf9c6d9cc48) - fix streaming

## 1.169.0

### Minor Changes

- Clean minor bump, fresh start ([#7395](https://github.com/TanStack/router/pull/7395))

## 1.168.0

### Minor Changes

- Add support for custom `dehydrateOptions` and `hydrateOptions` in the SSR query integration ([#7246](https://github.com/TanStack/router/pull/7246))

## 1.167.1

### Patch Changes

- migrate createStore > createAtom for simpler API ([#7150](https://github.com/TanStack/router/pull/7150))

## 1.167.0

### Minor Changes

- remove pendingMatches, cachedMatches ([#6704](https://github.com/TanStack/router/pull/6704))
  move to signal-based reactivity
  solid uses its own native signals

## 1.166.9

### Patch Changes

- build: update to vite-config 5.x (rolldown) ([#6926](https://github.com/TanStack/router/pull/6926))

## 1.166.8

### Patch Changes

- fix: build with @tanstack/vite-config 0.4.3 ([#6923](https://github.com/TanStack/router/pull/6923))
