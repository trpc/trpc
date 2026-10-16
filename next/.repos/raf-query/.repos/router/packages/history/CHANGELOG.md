# @tanstack/history

## 1.162.5

### Patch Changes

- [#8605](https://github.com/TanStack/router/pull/8605) [`dfe3dea`](https://github.com/TanStack/router/commit/dfe3dea88a28400db1677111e2b15ae7914782c2) - Drop a duplicated current-location flag and a redundant `createHref` wrapper.

- [#8605](https://github.com/TanStack/router/pull/8605) [`dfe3dea`](https://github.com/TanStack/router/commit/dfe3dea88a28400db1677111e2b15ae7914782c2) - Avoid temporary arrays when reading hash-history locations.

- [#8605](https://github.com/TanStack/router/pull/8605) [`dfe3dea`](https://github.com/TanStack/router/commit/dfe3dea88a28400db1677111e2b15ae7914782c2) - Keep a leading query or fragment out of the parsed pathname, so hash-history URLs like `/#?x=1` no longer repeat the query in the router location.

- [#8602](https://github.com/TanStack/router/pull/8602) [`efc2042`](https://github.com/TanStack/router/commit/efc2042c2d02a9780c3e7efe81f123d066a869eb) - Fixed Link destinations that resolve to a route mask are now reused across navigations instead of being rebuilt every time. A mounted Link now follows changes to its `href` and `reloadDocument` props, and React Links no longer each subscribe to a hydration flag.

- [#8605](https://github.com/TanStack/router/pull/8605) [`dfe3dea`](https://github.com/TanStack/router/commit/dfe3dea88a28400db1677111e2b15ae7914782c2) - Use `slice` instead of `substring` where the bounds are always ordered and non-negative.

## 1.162.4

### Patch Changes

- [#8359](https://github.com/TanStack/router/pull/8359) [`8fff7fa`](https://github.com/TanStack/router/commit/8fff7fa1f2e6f061916b0bf5e0ec486b2e732f94) - Normalize memory history hrefs consistently with browser and server history, including protocol-relative paths and control characters.

- [#8352](https://github.com/TanStack/router/pull/8352) [`f021f6d`](https://github.com/TanStack/router/commit/f021f6d1c6dce6c9b54d70766f1d636d8fd9e184) - Avoid temporary arrays when replacing forward memory-history entries.

- [#8349](https://github.com/TanStack/router/pull/8349) [`ae68535`](https://github.com/TanStack/router/commit/ae68535929043607d4ee9438f8ae401f3a064862) - Avoid generating unused history keys for locations with existing state.

- [#8354](https://github.com/TanStack/router/pull/8354) [`9872d2a`](https://github.com/TanStack/router/commit/9872d2ac39fc05f4ef6566c0b421f71ceb115244) - Use lightweight request history for SSR and make server navigation a no-op. Use redirect() to issue HTTP redirects. Server hrefs use the same normalization as browser history to handle protocol-relative URLs and control characters.

## 1.162.3

### Patch Changes

- [#8308](https://github.com/TanStack/router/pull/8308) [`9c1871c`](https://github.com/TanStack/router/commit/9c1871ccc88bc1157186b8b460941a304ec740b8) - Validate navigation and redirect destinations, keep ambiguous relative URLs on the current origin, and constrain prerender requests and output paths. Prevent redirect headers from appearing in serialized server function response bodies.

  Preserve native form HTTP redirects, route error handling and masks for document redirects, and per-navigation destinations for shared loader redirects. Avoid redundant origin parsing and reduce link styling and server-rendering work. Configured origins must already be normalized.

  Keep blocked-link inactive props consistent during React hydration, honor explicit redirect Location headers before checking route options, and refresh Vue link state when destinations become internal. Reuse the protocol-relative URL check while parsing redirect schemes once.

  Reduce React link bundle size by sharing pathname comparisons, state-prop selection, and element creation.

  Share normalized pathname comparisons in Solid and Vue links to reduce bundle size.

- [#8287](https://github.com/TanStack/router/pull/8287) [`0654c0a`](https://github.com/TanStack/router/commit/0654c0a1a427db24d9af13c1d6ad1217a588c0c9) - Use full-document navigation when an output rewrite produces a cross-origin destination, including the public URL of a route mask.

  Respect registered history blockers during document navigation, passing history locations and the requested push or replace action.

## 1.162.2

### Patch Changes

- [#8264](https://github.com/TanStack/router/pull/8264) [`9035abc`](https://github.com/TanStack/router/commit/9035abc41163d83409ef582f7743a3c7be57dd93) - Respect `ignoreBlocker` during `go()` navigation, including document unload warnings. Preserve beforeunload warnings during back and forward navigation unless `ignoreBlocker` is requested, and clear the bypass after same-document traversal so later document navigation still warns about unsaved changes.

  Restore the original browser history entry when forward or multi-entry navigation is blocked.

## 1.162.1

### Patch Changes

- [#7985](https://github.com/TanStack/router/pull/7985) [`9cac62a`](https://github.com/TanStack/router/commit/9cac62a5c7f99ef070991ea6f1fa7e42c746d46b) - perf: compact private bundle boundaries- [#7975](https://github.com/TanStack/router/issues/7975)

## 1.162.0

### Minor Changes

- Clean minor bump, fresh start ([#7395](https://github.com/TanStack/router/pull/7395))

## 1.161.6

### Patch Changes

- build: update to vite-config 5.x (rolldown) ([#6926](https://github.com/TanStack/router/pull/6926))

## 1.161.5

### Patch Changes

- fix: build with @tanstack/vite-config 0.4.3 ([#6923](https://github.com/TanStack/router/pull/6923))
