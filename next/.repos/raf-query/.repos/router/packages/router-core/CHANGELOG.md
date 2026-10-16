# @tanstack/router-core

## 1.171.35

### Patch Changes

- [#8605](https://github.com/TanStack/router/pull/8605) [`dfe3dea`](https://github.com/TanStack/router/commit/dfe3dea88a28400db1677111e2b15ae7914782c2) - Drop a duplicated current-location flag and a redundant `createHref` wrapper.

- [#8602](https://github.com/TanStack/router/pull/8602) [`efc2042`](https://github.com/TanStack/router/commit/efc2042c2d02a9780c3e7efe81f123d066a869eb) - Links of a route that the pending navigation leaves skip deriving the destination location, and clicks and preloads follow the href a Link displays. `buildLocation` now builds `mask` and `routeMasks` locations from the same `_fromLocation` as the destination.

- [#8602](https://github.com/TanStack/router/pull/8602) [`efc2042`](https://github.com/TanStack/router/commit/efc2042c2d02a9780c3e7efe81f123d066a869eb) - Fixed Link destinations that resolve to a route mask are now reused across navigations instead of being rebuilt every time. A mounted Link now follows changes to its `href` and `reloadDocument` props, and React Links no longer each subscribe to a hydration flag.

- [#8605](https://github.com/TanStack/router/pull/8605) [`dfe3dea`](https://github.com/TanStack/router/commit/dfe3dea88a28400db1677111e2b15ae7914782c2) - Use `slice` instead of `substring` where the bounds are always ordered and non-negative.

- [#7654](https://github.com/TanStack/router/pull/7654) [`663282b`](https://github.com/TanStack/router/commit/663282b0ebbc494aee3595ed95867ee29d01938e) - Encode slashes in dehydrated SSR match IDs with `#` instead of a null byte, so the inlined hydration payload no longer contains U+0000 (which is invalid in HTML and rejected by markup validators)

- Updated dependencies [[`dfe3dea`](https://github.com/TanStack/router/commit/dfe3dea88a28400db1677111e2b15ae7914782c2), [`dfe3dea`](https://github.com/TanStack/router/commit/dfe3dea88a28400db1677111e2b15ae7914782c2), [`dfe3dea`](https://github.com/TanStack/router/commit/dfe3dea88a28400db1677111e2b15ae7914782c2), [`efc2042`](https://github.com/TanStack/router/commit/efc2042c2d02a9780c3e7efe81f123d066a869eb), [`dfe3dea`](https://github.com/TanStack/router/commit/dfe3dea88a28400db1677111e2b15ae7914782c2)]:
  - @tanstack/history@1.162.5

## 1.171.34

### Patch Changes

- [#8573](https://github.com/TanStack/router/pull/8573) [`d521abd`](https://github.com/TanStack/router/commit/d521abd71c69f1ff010bb3def4d417cb5fa058cb) - Align server function request and response handling.

## 1.171.33

### Patch Changes

- [#8297](https://github.com/TanStack/router/pull/8297) [`488d046`](https://github.com/TanStack/router/commit/488d046a907d330429e2c807ef95326dad87480f) - Update `seroval` and `seroval-plugins` from 1.6.2 to 1.6.7. This picks up the typed array length guard, the `maxBase64Length` and `compactArrayBufferViews` options, and the `isStream` export.

- [#8460](https://github.com/TanStack/router/pull/8460) [`0c1b5e3`](https://github.com/TanStack/router/commit/0c1b5e38de71b7e81bbf1fd81c73ee0cd68ffe47) - Abort reserved loader generations with no remaining owners when invalidation removes them from discovery, ensuring their public abort signals are retired.

- [#8519](https://github.com/TanStack/router/pull/8519) [`3cdd1af`](https://github.com/TanStack/router/commit/3cdd1af04b3e2d6f777797ee7bddf285318dd9d2) - Hand native scroll restoration back to the browser on pagehide, including entries entering BFCache, and reclaim manual restoration when a cached document resumes.

## 1.171.32

### Patch Changes

- [#8363](https://github.com/TanStack/router/pull/8363) [`cecae54`](https://github.com/TanStack/router/commit/cecae5440b8edaea77c5448fe3d74bbd20fe10a4) - Detect plain objects by constructor instead of `Object.prototype.toString` dispatches in `isPlainObject`, which gates every `deepEqual` and `replaceEqualDeep` recursion step. Object literals, `JSON.parse` output and null-prototype objects are still plain; objects from another realm no longer are. Records with an own `constructor` key (for example the search params of `?constructor=foo`) fall back to a prototype check, so they keep structural sharing while class instances stay opaque.

- [#8364](https://github.com/TanStack/router/pull/8364) [`0103578`](https://github.com/TanStack/router/commit/01035782e53af9b929c784b94ddd64b95efb89c7) - Compare and copy plain objects in `replaceEqualDeep` by their string keys only, skipping the symbol-key lookup that dominated key enumeration. Objects with non-enumerable own properties, or symbol keys on the incoming value, now pass through untouched instead of being structurally shared.

- [#8411](https://github.com/TanStack/router/pull/8411) [`ce10dcd`](https://github.com/TanStack/router/commit/ce10dcd4d9d3d23738744e453205aad5c6dbd716) - Reduce structural-sharing allocations by reusing array key storage and returning incoming objects when their children need no replacements. Preserve signed zero consistently, remove stale symbol properties, and keep sparse arrays with extra keys and built-ins with an own `constructor` opaque.

  Null-prototype mode now applies only when constructing a copy; existing incoming objects can be reused with their original prototype.

- [#8362](https://github.com/TanStack/router/pull/8362) [`84936cc`](https://github.com/TanStack/router/commit/84936cc04530bba11059c57b293a794922bbc5aa) - Allocate the `replaceEqualDeep` result only at the first difference, so structural sharing of search, params, state and loader data no longer allocates when the new value is deeply equal to the previous one.

- [#8389](https://github.com/TanStack/router/pull/8389) [`bbd2336`](https://github.com/TanStack/router/commit/bbd2336b8446de3f7dd85070895e7cf43980183e) - Split `replaceEqualDeep` into an equality scan and a copy phase: arrays and objects are scanned by dedicated loops up to the first difference, matching keys prove ownership without a `hasOwnProperty` lookup, and once a difference is found the result is built without any further equality bookkeeping. Deeply equal search, params, state and loader data are recognised faster and changed values are copied with less work per entry.

## 1.171.31

### Patch Changes

- [#8417](https://github.com/TanStack/router/pull/8417) [`bc80866`](https://github.com/TanStack/router/commit/bc80866f6d6eb3e6f152ee3682eb783c96403e83) - Speed up `deepEqual`: identical array elements no longer recurse, the exact comparison keeps a single key counter, and the redundant `typeof` early exit is gone. Equal numeric arrays compare ~70% faster and record comparisons 5–12% faster in the mixed-mode workloads that Link option stabilization and active-state checks produce, with a slightly smaller bundle. Behavior, including key enumeration and getter read order, is unchanged.

- [#8418](https://github.com/TanStack/router/pull/8418) [`e561fa1`](https://github.com/TanStack/router/commit/e561fa1d7118e3d29267cc3b6ce1130d6581f387) - `deepEqual` now takes its flags as positional arguments — `deepEqual(a, b, partial?, explicitUndefined?)` — instead of an options object. The router's hot callers (Link option stabilization and active-state checks, `matchRoute`) no longer allocate an options object per comparison, and the comparator reads two booleans instead of a polymorphic object. `explicitUndefined` replaces `ignoreUndefined: false`. `deepEqual` is an internal helper; it stays exported for compatibility of two-argument calls.

- [#8204](https://github.com/TanStack/router/pull/8204) [`cbbfbe3`](https://github.com/TanStack/router/commit/cbbfbe37ab1dbe328c343cb437c5660769cc9f26) - Reduce per-request SSR overhead: abort settled route matches with one shared `AbortError`-shaped reason instead of building a stack-capturing `DOMException` per match, skip `JSON.parse` for search values that cannot start JSON, wait on request signals with one listener per wait, and keep resolved server-function modules in production builds instead of re-importing them on every call.

- [#8419](https://github.com/TanStack/router/pull/8419) [`a1c8d1a`](https://github.com/TanStack/router/commit/a1c8d1aa759c227eae9601a030321ac4c53c24bd) - `resolvePath` (internal helper) now takes positional arguments — `resolvePath(base, to, trailingSlash?, cache?)` — so `buildLocation` and `matchRoute` no longer allocate an options object per path resolution.

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

- [#8422](https://github.com/TanStack/router/pull/8422) [`a0b2ad9`](https://github.com/TanStack/router/commit/a0b2ad99aee64af08d16b0e4ff26b3ba42a99f0a) - Parse the location once when `router.update()` changes the basepath or rewrite, collect `invalidate()` match ids in a single pass, and specialize internal basepath composition without arrays or loops. Preserve basepath case sensitivity when creating and updating the router.

  Rebuild server route trees when `caseSensitive` changes and reuse the server cache only when the route tree and case sensitivity both match.

- [#8421](https://github.com/TanStack/router/pull/8421) [`1ca361b`](https://github.com/TanStack/router/commit/1ca361ba52a627d2f76ab33323bd83d1d0aa65a3) - Parse masked locations without mutating shared state and simplify input rewrite handling.

## 1.171.30

### Patch Changes

- [#8321](https://github.com/TanStack/router/pull/8321) [`d76a332`](https://github.com/TanStack/router/commit/d76a33284bc0668f7af4c972a6d32bd0f42b22a6) - Cache route branches and interpolated paths on their route objects, removing the fixed template limit for registered routes and reusing cached paths across server requests. Rebuild tree-dependent caches together, preserve decoder and trailing-slash isolation, and keep unregistered templates bounded.

- [#8390](https://github.com/TanStack/router/pull/8390) [`b747fb8`](https://github.com/TanStack/router/commit/b747fb8891b3347b1ffdfe0fa81e7d15049cb776) - Keep the Link location cache out of server bundles: `buildLocation` only creates, reads and writes it when `isServer` is false. Render React Links on the server without the extra prop copies and the forwarded-ref hook. Link SSR rendering is 20-40% faster in the Link benchmarks and the React Start SSR request loop about 7% faster.

  React `activeProps` and `inactiveProps` now follow one precedence rule on every link, including links whose destination is blocked for using a disallowed scheme: state props override element props, `ref` and event handlers, while `href`, `disabled` and `target` stay controlled by the router. Previously a blocked link ignored a `ref` or handler from its inactive props.

  React `Link` and `useLinkProps` split router options from element props with one key set on the client and the server. Element props pass through as given: external links forward them verbatim, falsy values included, and `useLinkProps` now returns `children` for router-controlled links as it already did for external ones.

- [#8382](https://github.com/TanStack/router/pull/8382) [`6cfb1e8`](https://github.com/TanStack/router/commit/6cfb1e8b564be282584765352250bf61747895ed) - `buildLocation` no longer structurally shares the built `search` and `state` with the current location. The observable `location.search` and `location.state` still preserve equal nested references across navigations, because `parseLocation` stabilizes them once a location is committed. A search whose contents equal the current search but list its keys in a different order now serializes in the requested order, so navigating to it creates a new history entry instead of being treated as the same location. A `state` object passed to `navigate` or `buildLocation` is never mutated.

- [#8325](https://github.com/TanStack/router/pull/8325) [`700a714`](https://github.com/TanStack/router/commit/700a714c5fb64199b4edfaa3273d230c9894e274) - Reuse the already-owned raw-param snapshot during lightweight source matching instead of copying it again.

- [#8325](https://github.com/TanStack/router/pull/8325) [`700a714`](https://github.com/TanStack/router/commit/700a714c5fb64199b4edfaa3273d230c9894e274) - Reduce transient JIT compilation memory during navigation by separating search middleware collection from recursive execution.

- [#8252](https://github.com/TanStack/router/pull/8252) [`7e349c3`](https://github.com/TanStack/router/commit/7e349c3071ef7a346698d320fc0989998ad55734) - Collect shared pathname-cache keys during interpolation instead of parsing templates twice, and share dynamic-segment handling to reduce bundle size.

- [#8319](https://github.com/TanStack/router/pull/8319) [`873c830`](https://github.com/TanStack/router/commit/873c830ccb2610a864ee697250e10fcc99772ffa) - Simplify path interpolation into ordered segment-type blocks with shared prefix/value/suffix assembly. Preserve one-pass parsing and optional metadata collection, and reuse the public result object instead of allocating and clearing a missing-parameter callback.

- [#8252](https://github.com/TanStack/router/pull/8252) [`7e349c3`](https://github.com/TanStack/router/commit/7e349c3071ef7a346698d320fc0989998ad55734) - Reuse pathname interpolation across Links with bounded router-scoped caches. Keep parameter callbacks and navigation state independent of the cache.

- [#8327](https://github.com/TanStack/router/pull/8327) [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef) - Make `pathParamsAllowedCharacters` initialization-only. Configure it when creating the router; changing allowed characters requires a new router instance. Remove decoder-update bookkeeping and decoder-change checks from route-owned path caches.

- [#8370](https://github.com/TanStack/router/pull/8370) [`e9396c9`](https://github.com/TanStack/router/commit/e9396c928945d1dd6fd3f3bd8052143794f688b5) - Stop exporting the internal `isPlainObject` and `isPlainArray` helpers.

- [#8327](https://github.com/TanStack/router/pull/8327) [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef) - Initialize routes directly during route-tree processing, removing the callback indirection while preserving parent-first initialization and route indexes.

- [#8328](https://github.com/TanStack/router/pull/8328) [`f151ab0`](https://github.com/TanStack/router/commit/f151ab018eede64ae849b77e68f3cdf31cb95cc5) - Reduce duplication in navigation parameter handling while preserving parameter inheritance, null-prototype dictionaries, and updater isolation.

- [#8410](https://github.com/TanStack/router/pull/8410) [`bc57fa3`](https://github.com/TanStack/router/commit/bc57fa3f12450cf34c731450947c7c8f1ea05e58) - Treat `0` and `false` as provided `_splat` values when interpolating paths. Only `undefined`, `null`, and `''` now omit a splat segment, matching how other path params are stringified.

- [#8354](https://github.com/TanStack/router/pull/8354) [`9872d2a`](https://github.com/TanStack/router/commit/9872d2ac39fc05f4ef6566c0b421f71ceb115244) - Use lightweight request history for SSR and make server navigation a no-op. Use redirect() to issue HTTP redirects. Server hrefs use the same normalization as browser history to handle protocol-relative URLs and control characters.

- [#8321](https://github.com/TanStack/router/pull/8321) [`d76a332`](https://github.com/TanStack/router/commit/d76a33284bc0668f7af4c972a6d32bd0f42b22a6) - Consolidate internal path interpolation into `interpolatePath`, returning a pathname directly and collecting metadata only when requested. Update router and devtools callers without changing route parsing or interpolation caching.

- [#8327](https://github.com/TanStack/router/pull/8327) [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef) - Reduce route-tree initialization work by avoiding temporary path-joining arrays and duplicate ID normalization.

- [#8327](https://github.com/TanStack/router/pull/8327) [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef) - Reuse parsed route segments when generating paths for navigation, Links, and Devtools. Preserve interpolation metadata and refresh segments when the route tree is rebuilt, without reparsing templates for new parameter values.

- [#8252](https://github.com/TanStack/router/pull/8252) [`7e349c3`](https://github.com/TanStack/router/commit/7e349c3071ef7a346698d320fc0989998ad55734) - Reduce the bundle cost of shared Link pathname interpolation while preserving its rendering performance. Reuse one interpolation pass for pathname and optional metadata, keep the bounded cache on the router, and simplify React Link active-state and prop merging.

- [#8385](https://github.com/TanStack/router/pull/8385) [`9448caa`](https://github.com/TanStack/router/commit/9448caa03a89076b9770631c356c0cc502802c09) - Collect search middlewares with a counted loop so the optimized code stays valid across navigations. This removes a JIT recompilation that raised peak memory in the interrupted-navigations client memory benchmark.

- [#8370](https://github.com/TanStack/router/pull/8370) [`e9396c9`](https://github.com/TanStack/router/commit/e9396c928945d1dd6fd3f3bd8052143794f688b5) - Reuse built locations for Links whose destination does not depend on the current location. `buildLocation` keeps the result per options object when the build never read the current location, and the React `Link` passes one stable options object per instance, so navigations resolve unchanged Links with a lookup instead of a full build. The per-route pathname interpolation cache this replaces is removed. Link `params`, `search` and `activeOptions` are compared by value on render, so inline object literals with unchanged contents keep reusing the Link's location. Pass a new object to change a destination; like any other React prop, an object mutated in place is not re-read.

- [#8325](https://github.com/TanStack/router/pull/8325) [`700a714`](https://github.com/TanStack/router/commit/700a714c5fb64199b4edfaa3273d230c9894e274) - Cache normalized route pathnames so repeated Link destinations do not decode the same interpolation result again.

- [#8327](https://github.com/TanStack/router/pull/8327) [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef) - Share compact parsed route segments between matching and interpolation, preserve original parameter names, and avoid reparsing templates while building paths. Simplify route-tree traversal, reuse existing path helpers, and keep Devtools-only navigation validation out of the production formatter. Preserve dynamic match identity for standalone legacy fallback routes.

- [#8327](https://github.com/TanStack/router/pull/8327) [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef) - Pass route initialization indexes directly instead of wrapping each index in an options object.

- Updated dependencies [[`8fff7fa`](https://github.com/TanStack/router/commit/8fff7fa1f2e6f061916b0bf5e0ec486b2e732f94), [`f021f6d`](https://github.com/TanStack/router/commit/f021f6d1c6dce6c9b54d70766f1d636d8fd9e184), [`ae68535`](https://github.com/TanStack/router/commit/ae68535929043607d4ee9438f8ae401f3a064862), [`9872d2a`](https://github.com/TanStack/router/commit/9872d2ac39fc05f4ef6566c0b421f71ceb115244)]:
  - @tanstack/history@1.162.4

## 1.171.29

### Patch Changes

- [#8313](https://github.com/TanStack/router/pull/8313) [`f9836f1`](https://github.com/TanStack/router/commit/f9836f16f0e25b0a8495f5e01e3f303b1cbc8725) - Avoid constructing a query serializer when search is empty or all values are undefined.

- [#8308](https://github.com/TanStack/router/pull/8308) [`9c1871c`](https://github.com/TanStack/router/commit/9c1871ccc88bc1157186b8b460941a304ec740b8) - Validate navigation and redirect destinations, keep ambiguous relative URLs on the current origin, and constrain prerender requests and output paths. Prevent redirect headers from appearing in serialized server function response bodies.

  Preserve native form HTTP redirects, route error handling and masks for document redirects, and per-navigation destinations for shared loader redirects. Avoid redundant origin parsing and reduce link styling and server-rendering work. Configured origins must already be normalized.

  Keep blocked-link inactive props consistent during React hydration, honor explicit redirect Location headers before checking route options, and refresh Vue link state when destinations become internal. Reuse the protocol-relative URL check while parsing redirect schemes once.

  Reduce React link bundle size by sharing pathname comparisons, state-prop selection, and element creation.

  Share normalized pathname comparisons in Solid and Vue links to reduce bundle size.

- [#8288](https://github.com/TanStack/router/pull/8288) [`9871c06`](https://github.com/TanStack/router/commit/9871c0625806001d6bf373524821a00303438a91) - Reduce cache maintenance work during navigation by indexing incoming match IDs once per commit.

- [#8287](https://github.com/TanStack/router/pull/8287) [`0654c0a`](https://github.com/TanStack/router/commit/0654c0a1a427db24d9af13c1d6ad1217a588c0c9) - Use full-document navigation when an output rewrite produces a cross-origin destination, including the public URL of a route mask.

  Respect registered history blockers during document navigation, passing history locations and the requested push or replace action.

- Updated dependencies [[`9c1871c`](https://github.com/TanStack/router/commit/9c1871ccc88bc1157186b8b460941a304ec740b8), [`0654c0a`](https://github.com/TanStack/router/commit/0654c0a1a427db24d9af13c1d6ad1217a588c0c9)]:
  - @tanstack/history@1.162.3

## 1.171.28

### Patch Changes

- [#8222](https://github.com/TanStack/router/pull/8222) [`edf0e16`](https://github.com/TanStack/router/commit/edf0e16ebfe82ec6e8f68f403a1fda8de9e28889) - Make each load transaction's completion follow its current successor so a burst of back-to-back loads wakes each superseded waiter once instead of once per successor. Previously every superseded `load()` re-polled the current transaction on each later completion, which was quadratic in microtask work.

- [#8165](https://github.com/TanStack/router/pull/8165) [`2f20c00`](https://github.com/TanStack/router/commit/2f20c00224c5ba63467551914e0c37012588c4c2) - Exclude structural descendants below error and not-found boundaries from route lifecycle callbacks. Preserve lifecycle membership through invalidation, hydration, background reloads, and superseded navigation publication.

- [#8209](https://github.com/TanStack/router/pull/8209) [`28a5e45`](https://github.com/TanStack/router/commit/28a5e4504e4ea5cb1480667a4bea2588a53e110f) - Preserve falsy thrown values in React and Vue error boundaries. Type React and Vue boundary error components and `onCatch` callbacks as `unknown`. Solid boundary errors remain typed as `Error`; SSR now wraps non-`Error` loader errors to match Solid’s native boundary behavior, preserving the original value in `cause`. Router state and loader `onError` values are unchanged.

  When upgrading React or Vue, narrow boundary errors (for example, with `error instanceof Error`) before reading `message` or `stack`. `ErrorComponentProps<TError>` remains available for values narrowed to a specific error type. Route `onError` types are unchanged.

- [#8207](https://github.com/TanStack/router/pull/8207) [`08eff50`](https://github.com/TanStack/router/commit/08eff50c447a154a3373909009e9e4375cea17ce) - Fix consumer typechecking with `skipLibCheck: false` by omitting the internal beforeLoad context field from published dehydrated match declarations.

  Retain the exported `isAbsoluteUrl` declaration used by framework bindings so the package entry point does not reference a stripped symbol.

- [#8259](https://github.com/TanStack/router/pull/8259) [`216c0c4`](https://github.com/TanStack/router/commit/216c0c48036fd1a33163b70dcabfed2b893808b0) - Reduce Promise allocations during client navigation and static server SSR policy resolution. Skip cancellable waits for synchronous beforeLoad results while preserving navigation cancellation.

- [#8240](https://github.com/TanStack/router/pull/8240) [`2f91503`](https://github.com/TanStack/router/commit/2f9150309bc472f4a75cbe98adcdb50c76b12c7a) - Avoid quadratic resource handoff scans when navigating with many cached route matches.

- [#8161](https://github.com/TanStack/router/pull/8161) [`f0b5eda`](https://github.com/TanStack/router/commit/f0b5eda544606686a8a8d675a686ca1366428b96) - Retain successful not-found matches as terminal shared boundaries during client navigation, preserving route context while the destination loads.

- [#8142](https://github.com/TanStack/router/pull/8142) [`50eafca`](https://github.com/TanStack/router/commit/50eafcaebbbedb6fde3b2816de7a0ace8cde4832) - Avoid unnecessary JSON.parse calls for search parameter values that cannot begin valid JSON, while preserving custom parser behavior.

- [#8251](https://github.com/TanStack/router/pull/8251) [`0497cae`](https://github.com/TanStack/router/commit/0497caeef3ff7e1c1c6080eca38bca24e7ec320b) - Use URL.canParse for absolute URL checks in links, navigation, redirects, and build configuration. Preserve a URL constructor fallback for older browsers.

- [#8230](https://github.com/TanStack/router/pull/8230) [`ee28348`](https://github.com/TanStack/router/commit/ee283480dfa51150a2e0b096a6eff94a89ff8b3f) - Replace the internal LRU cache behind path resolution, route matching and the SSR manifest lookup with a smaller SIEVE cache whose hits no longer relink a list, and fix an eviction edge case in the old implementation.

- [#8244](https://github.com/TanStack/router/pull/8244) [`c18e690`](https://github.com/TanStack/router/commit/c18e69081475a7c98f9d40bd0fe6da78ccb84598) - Reduce promise allocations during client navigation when loader data and route components are already available.

- Updated dependencies [[`9035abc`](https://github.com/TanStack/router/commit/9035abc41163d83409ef582f7743a3c7be57dd93)]:
  - @tanstack/history@1.162.2

## 1.171.27

### Patch Changes

- [#8132](https://github.com/TanStack/router/pull/8132) [`fa65287`](https://github.com/TanStack/router/commit/fa652872812c9433ba8b9d9a285e51b535e7367c) - Build client preload locations on demand and remove the prebuilt-location argument used by framework links.

- [#8130](https://github.com/TanStack/router/pull/8130) [`cb281d7`](https://github.com/TanStack/router/commit/cb281d70c1f5fe780f9d07bc500ea3a284a4e04b) - preserve context during reloads

## 1.171.26

### Patch Changes

- [#8117](https://github.com/TanStack/router/pull/8117) [`3e016ac`](https://github.com/TanStack/router/commit/3e016ac84ffec8119f0c25cfdd1fb17e5292bd34) - optimize buildLocation path resolution https://github.com/TanStack/router/pull/8108
  skip building search validation when disabled https://github.com/TanStack/router/pull/8112
  skip location state sharing when impossible https://github.com/TanStack/router/pull/8110
  fix cache hits for mask resolution when entry is null https://github.com/TanStack/router/pull/8111

## 1.171.25

### Patch Changes

- [#8084](https://github.com/TanStack/router/pull/8084) [`5d3785d`](https://github.com/TanStack/router/commit/5d3785dcc366b66b1c261b5d01e66af778ff1175) - preserve pending UI across retained routes

- [#8092](https://github.com/TanStack/router/pull/8092) [`63d2cc9`](https://github.com/TanStack/router/commit/63d2cc9155ff5374112f7d067d0b278bafeb8486) - Render route errors when redirect target construction fails and let successor transactions own navigation and HMR presentation.

## 1.171.24

### Patch Changes

- [#8071](https://github.com/TanStack/router/pull/8071) [`4c89b15`](https://github.com/TanStack/router/commit/4c89b15dd2b46491ee5e57985559bae8e31d62c2) - inline getOpenAndCloseBraces in parseSegment for byte shaving

- [#8069](https://github.com/TanStack/router/pull/8069) [`cf6ab17`](https://github.com/TanStack/router/commit/cf6ab178b39e7628bf784759f384e0f4230e6d9e) - inline isFunction utility fn for byte shaving

- [#8070](https://github.com/TanStack/router/pull/8070) [`bdaf73a`](https://github.com/TanStack/router/commit/bdaf73a4063ee2b02e3c9cc105ad10ce82a5a0ff) - inline buildWithMatches inside buildLocation for byte shaving

## 1.171.23

### Patch Changes

- [#8054](https://github.com/TanStack/router/pull/8054) [`31882c7`](https://github.com/TanStack/router/commit/31882c7fa87debef236228831655cb112c20ce90) - Reuse resolved lazy route components when revisiting code-split routes, preventing unnecessary pending UI.

## 1.171.22

### Patch Changes

- [#8039](https://github.com/TanStack/router/pull/8039) [`7e93431`](https://github.com/TanStack/router/commit/7e93431ae9ff58c91c3c5ca10ffcb8414c1d0b13) - load-client can cache settles abandonned loader work without preload authority

## 1.171.21

### Patch Changes

- [#8019](https://github.com/TanStack/router/pull/8019) [`51138a8`](https://github.com/TanStack/router/commit/51138a824cea053738f125c4c95073bd6286ff05) - handle excessive parent relative links

## 1.171.20

### Patch Changes

- [#8006](https://github.com/TanStack/router/pull/8006) [`44a8c3e`](https://github.com/TanStack/router/commit/44a8c3e1d2af305064b2363d97fc7847c6f1a246) - skip impossible JSON parse attempts

- [#8010](https://github.com/TanStack/router/pull/8010) [`5253e70`](https://github.com/TanStack/router/commit/5253e70db2083d68a788fb7c9a043bb0c5518f2a) - perf: speed up structural sharing (`replaceEqualDeep`) by computing enumerable own keys with `Object.keys` + a length compare instead of `getOwnPropertyNames` followed by a `propertyIsEnumerable` call per key. This runs on every selector result on every state update when `defaultStructuralSharing` is enabled, and is ~1.3-1.5x faster on typical router state objects with identical behavior.

## 1.171.19

### Patch Changes

- [#7992](https://github.com/TanStack/router/pull/7992) [`ea3a665`](https://github.com/TanStack/router/commit/ea3a665d81cbb5074c2d77ec953255ab534e7db9) - retain mounted UI during revalidation

## 1.171.18

### Patch Changes

- [#7984](https://github.com/TanStack/router/pull/7984) [`84db4a8`](https://github.com/TanStack/router/commit/84db4a842311df3f7e58073f6f12aaf371aeb5c7) - Improve route-tree construction and matching performance by fusing static and
  dynamic node creation, sorting only dynamic sibling lists that need it, and
  deriving matcher depth from trie nodes.

- [#7985](https://github.com/TanStack/router/pull/7985) [`9cac62a`](https://github.com/TanStack/router/commit/9cac62a5c7f99ef070991ea6f1fa7e42c746d46b) - perf: compact private bundle boundaries- [#7975](https://github.com/TanStack/router/issues/7975)

- [#7967](https://github.com/TanStack/router/pull/7967) [`6aefb33`](https://github.com/TanStack/router/commit/6aefb3392595a07a93f89301d7b5e3558ff9190c) - Preserve path params in their raw string form while matching routes so structured values returned by `params.parse` produce stable match IDs and do not reuse stale loader data.

  `RouterCore.getMatchedRoutes()` now returns `[matchedRoutes, rawParams, foundRoute]` instead of an object.

- Updated dependencies [[`9cac62a`](https://github.com/TanStack/router/commit/9cac62a5c7f99ef070991ea6f1fa7e42c746d46b)]:
  - @tanstack/history@1.162.1

## 1.171.17

### Patch Changes

- [#7962](https://github.com/TanStack/router/pull/7962) [`b2908c6`](https://github.com/TanStack/router/commit/b2908c642ac09aa08e6d965d2a820d7186e42fd5) - Update Seroval dependencies to version 1.6.2.

## 1.171.16

### Patch Changes

- [#7805](https://github.com/TanStack/router/pull/7805) [`45c4ad8`](https://github.com/TanStack/router/commit/45c4ad8d629e291fab70c37900525449e415ffcd) - Rewrite match loading around a lane-based scheduler that tracks each navigation, preload, and background reload as an ordered unit of work. This fixes pending/redirect/retry state leaking between overlapping navigations, restores correct SSR status codes for redirects, errors, and not-found responses, and closes hydration gaps where the client re-ran work the server had already completed.
  - Invalidation now retires matching active preloads so older speculative loader results cannot become fresh cache data after invalidation.
  - Route `headers()` now only runs on the server, matching the documented behavior — it is no longer invoked during client-side asset projection.
  - The documented default `gcTime` and `preloadGcTime` now match the existing runtime default of 5 minutes (`300_000`).

  **Removed / changed exported internals**
  - `RouterState` no longer includes `loadedAt`, `isTransitioning`, `statusCode`, or `redirect`. Use `match.updatedAt` in place of `loadedAt`; subscribe to `router.state.status` / `router.state.isLoading` in place of `isTransitioning`; server response status and redirect handling are now internal to the server loader and are no longer exposed on `router.state`.
  - `RouteMatch.fetchCount` has been removed, with no replacement — it was purely informational.
  - `RouteMatch.status` no longer includes `'redirected'` (it remains `'pending' | 'success' | 'error' | 'notFound'`) — redirected matches are dropped from the match list instead of being rendered.
  - `RouteMatch.globalNotFound` has been renamed and privatized to the internal `_notFound` field. Use `match.status === 'notFound'` instead.
  - The exported React, Solid, and Vue `Match` components now accept `routeId` instead of `matchId`.
  - The exported `RouterStores` adapter contract now uses route-keyed presentation stores: `matchesId` is replaced by `ids`, `matchStores` by `byRoute`, and `getRouteMatchStore()` by `getMatchStore()`. The separate `loadedAt`, `isLoading`, `isTransitioning`, `statusCode`, and `redirect` stores have been removed, along with the pending/cache stores and their setters. `StoreConfig.init` has also been removed. Read application-facing state from `router.state`; preload and cache coordination are now internal.
  - Removed `RouterCore` members `getMatch()`, `updateMatch()`, `cancelMatch()`, and `cancelMatches()` — read matches from `router.state.matches` (e.g. `router.state.matches.find((m) => m.id === id)`); there is no replacement for mutating or cancelling an individual in-flight match from outside the router.
  - Removed `RouterCore.hasNotFoundMatch()` — use `router.state.matches.some((m) => m.status === 'notFound')`.
  - Removed `RouterCore.looseRoutesById` — use `routesById`.
  - Removed `RouterCore.isPrerendering()`, `RouterCore.isViewTransitionTypesSupported`, and `RouterCore.viewTransitionPromise`, with no replacement.
  - Removed `RouterCore.getParsedLocationHref()` and `RouterCore.clearExpiredCache()`, with no replacement — expired cache entries are now reconciled automatically as part of match commit.
  - Removed `RouterCore.latestLoadPromise` and `RouterCore.beforeLoad()`, with no replacement.
  - `RouterCore.commitLocationPromise` and `RouterCore.pendingBuiltLocation` have been replaced by the internal `_commitPromise` and `_pendingLocation` fields.
  - Removed the exported `GetMatchFn` and `UpdateMatchFn` types, along with the methods they typed.
  - Removed the standalone `getMatchedRoutes()` export from `@tanstack/router-core` — use the `router.getMatchedRoutes()` instance method instead.
  - `RouterCore.loadRouteChunk()` no longer accepts an array of component types as its second argument. One-argument usage is unchanged; the optional second argument is now `'errorComponent'`, `'notFoundComponent'`, or `false` for internal boundary loading.
  - Removed `Redirect.redirectHandled`, which was internal redirect bookkeeping.
  - `MatchRoutesOpts.preload` and `MatchRoutesOpts.dest` have been removed.
  - `StartTransitionFn` is now `(fn, expected) => Promise<boolean>` (previously `(fn) => void`). This only affects custom framework adapters that implement `startTransition`.

## 1.171.15

### Patch Changes

- [#7807](https://github.com/TanStack/router/pull/7807) [`e2dd204`](https://github.com/TanStack/router/commit/e2dd2049cb42eb219d3b447b8605066d19d9c1fa) - fix(router-core): handle window and element scroll restoration independently

  Window and element scroll targets are now handled independently. Restoring one target no longer suppresses resets for other uncached configured targets, and a restored element is no longer reset when the window has no cached position.

  Hash navigation no longer resets elements configured through `scrollToTopSelectors` and retains precedence over stale window positions through destination invalidations.

  Scroll positions are sampled when leaving a route, preserving live changes made after the most recent scroll event. This also prevents client hydration from undoing nested positions restored by the SSR script.

  Fixes [#7687](https://github.com/TanStack/router/issues/7687).

## 1.171.14

### Patch Changes

- [#7695](https://github.com/TanStack/router/pull/7695) [`9809a06`](https://github.com/TanStack/router/commit/9809a0619d4ed3fe8c2a393af5b9eca4b6c7695b) - fix(router-core): re-encode URL-unsafe characters in `sanitizePathSegment` to prevent infinite redirect loops

  `sanitizePathSegment` now re-encodes characters in the WHATWG URL "path percent-encode set" (`<`, `>`, `"`, `` ` ``, `{`, `}`) and ASCII control characters back to their percent-encoded form, instead of stripping control characters. This prevents mismatches between the original URL and the router's internal representation that previously caused infinite 307 redirect loops on paths containing these characters (e.g. `/%7B%7Btemplate%7D%7D`).

  Fixes [#7587](https://github.com/TanStack/router/issues/7587).

## 1.171.13

### Patch Changes

- [#7562](https://github.com/TanStack/router/pull/7562) [`776d8ef`](https://github.com/TanStack/router/commit/776d8ef283e5bd9ffe97d43bc3a7f58064cd7e03) - Prevent scroll restoration listeners from being installed when scroll restoration is disabled.

## 1.171.12

### Patch Changes

- [#7559](https://github.com/TanStack/router/pull/7559) [`df1076c`](https://github.com/TanStack/router/commit/df1076c03ae5a51ab384bebd4d6afda20fb6f107) - Fix retained search params overriding explicit default-valued navigations when used with `stripSearchParams`.

## 1.171.11

### Patch Changes

- [#7555](https://github.com/TanStack/router/pull/7555) [`ac10815`](https://github.com/TanStack/router/commit/ac10815f387d25b15163ff711b4049e8f8482d01) - Fix search middleware composition so `retainSearchParams` does not restore search params that a downstream `stripSearchParams` removed.

## 1.171.10

### Patch Changes

- [#7381](https://github.com/TanStack/router/pull/7381) [`2cca73c`](https://github.com/TanStack/router/commit/2cca73c92262ffd96dac4e283c9f69fb37f4b43a) - fix(router-core): use search validator output type for search middleware context

- [#7549](https://github.com/TanStack/router/pull/7549) [`7a83e67`](https://github.com/TanStack/router/commit/7a83e67e6596fbef21cb0a88a7127f5935bed2ba) - Fix `retainSearchParams` preserving current search params when validation adds default search values during navigation.

- [#7533](https://github.com/TanStack/router/pull/7533) [`76b3d3b`](https://github.com/TanStack/router/commit/76b3d3b24522bd3d1d216674c441252c9b8f184c) - delete $\_TSR immediately on stream end

## 1.171.9

### Patch Changes

- [#7524](https://github.com/TanStack/router/pull/7524) [`b4cd5af`](https://github.com/TanStack/router/commit/b4cd5af8d0f9d4aaa2d29095e6a261b9181bc778) - defer `$_TSR` teardown until DOMContentLoaded

## 1.171.8

### Patch Changes

- [#7505](https://github.com/TanStack/router/pull/7505) [`2f53749`](https://github.com/TanStack/router/commit/2f5374945e2138559a51464f45a5152eae67e1dd) - Preserve primitive values thrown from beforeLoad error handling.

## 1.171.7

### Patch Changes

- [#7497](https://github.com/TanStack/router/pull/7497) [`d1997b6`](https://github.com/TanStack/router/commit/d1997b66d7c24c1d64772bb8bab5caf9c6d9cc48) - fix streaming

## 1.171.6

### Patch Changes

- Add support for Rsbuild client output formats, including module output by default and IIFE output for classic script environments. ([#7477](https://github.com/TanStack/router/pull/7477))

  Client entry scripts and preloads are now represented as root route manifest assets, script preloads follow the manifest script format, and script asset cross-origin configuration uses the `script` key. The `transformAssets` script callback context now exposes only `kind: 'script'` and `url`, keeping script format handling internal to manifest rendering.

## 1.171.5

### Patch Changes

- Fix hash scrolling with `resetScroll={false}` ([#7464](https://github.com/TanStack/router/pull/7464))

## 1.171.4

### Patch Changes

- Fix hash navigation being overridden by stale scroll restoration entries. ([#7447](https://github.com/TanStack/router/pull/7447))

- Preserve carried scroll positions across SPA navigations that create new restoration keys. ([#7447](https://github.com/TanStack/router/pull/7447))

## 1.171.3

### Patch Changes

- Add deferred Hydrate boundary support for TanStack Start. ([#7362](https://github.com/TanStack/router/pull/7362))

  Hydrate boundaries can now be code-split by the Start compiler, preload their generated client chunks, preserve server-rendered fallback HTML, and replay interaction-triggered events after hydration. The compiler integration now uses a Start-owned compiler plugin for Hydrate virtual modules across Vite and Rsbuild, with dev invalidation for generated virtual modules.

  Shared AST utilities used by the router code-splitter and Hydrate virtual modules were moved into `@tanstack/router-utils` so both pipelines can retain referenced top-level declarations, unwrap local exports, and let dead-code elimination remove unused route module code.

## 1.171.2

### Patch Changes

- Fix route mismatch warnings, HMR route index refresh, and generated route type preferences for duplicate pathless/index routes. ([#7422](https://github.com/TanStack/router/pull/7422))

## 1.171.1

### Patch Changes

- Run custom router hydration before the initial client route match so hydrated router configuration, such as request-specific URL rewrites, can be installed before SSR hydration compares matches. ([#7416](https://github.com/TanStack/router/pull/7416))

## 1.171.0

### Minor Changes

- params.priority route option as tie breaker in route matching algorithm ([#7411](https://github.com/TanStack/router/pull/7411))

## 1.170.1

### Patch Changes

- Add runtime-configurable inline CSS and opt-in CSS URL templates for transformAssets. ([#7380](https://github.com/TanStack/router/pull/7380))

## 1.170.0

### Minor Changes

- Clean minor bump, fresh start ([#7395](https://github.com/TanStack/router/pull/7395))

### Patch Changes

- fix(router-core): fix missing closing paren in CSS.supports check for view transition types ([#7369](https://github.com/TanStack/router/pull/7369))

- Updated dependencies [[`201e150`](https://github.com/TanStack/router/commit/201e150bd1412bae2faa9ce53f0fefcb7574ac14)]:
  - @tanstack/history@1.162.0

## 1.169.2

### Patch Changes

- Update seroval dependencies to version 1.5.4. ([#7340](https://github.com/TanStack/router/pull/7340))

## 1.169.1

### Patch Changes

- Fix params.parse inference for discriminated union path params while preserving path key validation. ([#7306](https://github.com/TanStack/router/pull/7306))

## 1.169.0

### Minor Changes

- Allow `params.parse` to experimentally return `false` to skip an incoming route candidate during path matching. Thrown parse errors still surface on the selected match instead of falling through, and outgoing typed route-template links continue to use exact route lookup followed by `params.stringify` for URL generation. ([#7263](https://github.com/TanStack/router/pull/7263))

## 1.168.18

### Patch Changes

- prevent isServer exports from being transformed to top-level vars so rspack can dead-code eliminate them ([#7293](https://github.com/TanStack/router/pull/7293))

## 1.168.17

### Patch Changes

- wildcard nodes have the same priority rules as other nodes in route matching ([#7273](https://github.com/TanStack/router/pull/7273))

## 1.168.16

### Patch Changes

- Add TanStack Start inline CSS manifest support for SSR so route styles can be embedded in the HTML response and hydrated without duplicate stylesheet links. ([#7253](https://github.com/TanStack/router/pull/7253))

## 1.168.15

### Patch Changes

- Fix async loaders that throw or return `notFound()` so they do not briefly mark the match as `success` before the final not-found boundary is resolved. ([#7184](https://github.com/TanStack/router/pull/7184))

  This prevents route components from rendering with missing loader data during navigation when React observes the intermediate match state before not-found finalization completes.

## 1.168.14

### Patch Changes

- chore: bump to h3 v2-rc.20 ([#7140](https://github.com/TanStack/router/pull/7140))

## 1.168.13

### Patch Changes

- Reduce React Start SSR manifest payload size by omitting unmatched route assets from dehydrated router state while keeping start-manifest asset serialization deduplicated by shared object identity. ([#7157](https://github.com/TanStack/router/pull/7157))

  This improves SSR HTML size for apps with many routes that share the same CSS assets and adds regression coverage for CSS module hydration, navigation, and start-manifest asset reuse.

## 1.168.12

### Patch Changes

- avoid false notFound matches for proxied loader data ([#7156](https://github.com/TanStack/router/pull/7156))

## 1.168.11

### Patch Changes

- shorten internal non-minifiable store names for byte shaving ([#7152](https://github.com/TanStack/router/pull/7152))

## 1.168.10

### Patch Changes

- migrate createStore > createAtom for simpler API ([#7150](https://github.com/TanStack/router/pull/7150))

## 1.168.9

### Patch Changes

- Preserve component-thrown `notFound()` errors through framework error boundaries so route `notFoundComponent` handlers render without requiring an explicit `routeId`. ([#7077](https://github.com/TanStack/router/pull/7077))

## 1.168.8

### Patch Changes

- Fix preload from continuing into child `beforeLoad` and `head` handlers after a parent `beforeLoad` fails. ([#7075](https://github.com/TanStack/router/pull/7075))

## 1.168.7

### Patch Changes

- Avoid re-running hash scrolling after SSR hydration when later preload or invalidate cycles resolve without a location change. ([#7066](https://github.com/TanStack/router/pull/7066))

## 1.168.6

### Patch Changes

- Fix a regression where browser back/forward navigation could fail to restore the previous scroll position for an existing history entry. ([#7055](https://github.com/TanStack/router/pull/7055))

## 1.168.5

### Patch Changes

- fix: scroll restoration without throttling ([#7042](https://github.com/TanStack/router/pull/7042))

## 1.168.4

### Patch Changes

- tanstack/store 0.9.3 ([#7041](https://github.com/TanStack/router/pull/7041))

## 1.168.3

### Patch Changes

- feat: transformAssets ([#7023](https://github.com/TanStack/router/pull/7023))

## 1.168.2

### Patch Changes

- Replace tiny-invariant and tiny-warning with in-house solution for bundle-size ([#7007](https://github.com/TanStack/router/pull/7007))

## 1.168.1

### Patch Changes

- Update store to 0.9.2 ([#6993](https://github.com/TanStack/router/pull/6993))

## 1.168.0

### Minor Changes

- remove pendingMatches, cachedMatches ([#6704](https://github.com/TanStack/router/pull/6704))
  move to signal-based reactivity
  solid uses its own native signals

## 1.167.5

### Patch Changes

- chore: bump esbuild to 0.27.4 ([#6975](https://github.com/TanStack/router/pull/6975))

## 1.167.4

### Patch Changes

- Add @tanstack/intent AI agent skills and CLI entry points for Router and Start packages ([#6866](https://github.com/TanStack/router/pull/6866))

## 1.167.3

### Patch Changes

- Fix retained chained router promise refs during route loads and commits. ([#6929](https://github.com/TanStack/router/pull/6929))

## 1.167.2

### Patch Changes

- build: update to vite-config 5.x (rolldown) ([#6926](https://github.com/TanStack/router/pull/6926))

- Updated dependencies [[`838b0eb`](https://github.com/TanStack/router/commit/838b0eb9a8bbbb987a0a6972c1446e01423bbd7b)]:
  - @tanstack/history@1.161.6

## 1.167.1

### Patch Changes

- fix: build with @tanstack/vite-config 0.4.3 ([#6923](https://github.com/TanStack/router/pull/6923))

- Updated dependencies [[`ef9b241`](https://github.com/TanStack/router/commit/ef9b241f3cfe95cee40daa96da669f0ffd4a971a)]:
  - @tanstack/history@1.161.5

## 1.167.0

### Minor Changes

- feat: add staleReloadMode ([#6921](https://github.com/TanStack/router/pull/6921))
