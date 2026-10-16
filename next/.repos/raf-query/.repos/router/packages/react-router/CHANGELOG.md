# @tanstack/react-router

## 1.170.42

### Patch Changes

- [#8594](https://github.com/TanStack/router/pull/8594) [`2413cc0`](https://github.com/TanStack/router/commit/2413cc009826fba4f97b166a35a8a50a4a8fe4bb) - reduce component nesting per route match

- [#8602](https://github.com/TanStack/router/pull/8602) [`efc2042`](https://github.com/TanStack/router/commit/efc2042c2d02a9780c3e7efe81f123d066a869eb) - Links of a route that the pending navigation leaves skip deriving the destination location, and clicks and preloads follow the href a Link displays. `buildLocation` now builds `mask` and `routeMasks` locations from the same `_fromLocation` as the destination.

- [#8602](https://github.com/TanStack/router/pull/8602) [`efc2042`](https://github.com/TanStack/router/commit/efc2042c2d02a9780c3e7efe81f123d066a869eb) - Fixed Link destinations that resolve to a route mask are now reused across navigations instead of being rebuilt every time. A mounted Link now follows changes to its `href` and `reloadDocument` props, and React Links no longer each subscribe to a hydration flag.

- [#8579](https://github.com/TanStack/router/pull/8579) [`d35aab4`](https://github.com/TanStack/router/commit/d35aab425b07b46e222a507c0f0239644669757b) - Cancel pending link preload timers when starting navigation to avoid redundant preloading while the destination is loading.

- Updated dependencies [[`dfe3dea`](https://github.com/TanStack/router/commit/dfe3dea88a28400db1677111e2b15ae7914782c2), [`dfe3dea`](https://github.com/TanStack/router/commit/dfe3dea88a28400db1677111e2b15ae7914782c2), [`dfe3dea`](https://github.com/TanStack/router/commit/dfe3dea88a28400db1677111e2b15ae7914782c2), [`efc2042`](https://github.com/TanStack/router/commit/efc2042c2d02a9780c3e7efe81f123d066a869eb), [`efc2042`](https://github.com/TanStack/router/commit/efc2042c2d02a9780c3e7efe81f123d066a869eb), [`dfe3dea`](https://github.com/TanStack/router/commit/dfe3dea88a28400db1677111e2b15ae7914782c2), [`663282b`](https://github.com/TanStack/router/commit/663282b0ebbc494aee3595ed95867ee29d01938e)]:
  - @tanstack/history@1.162.5
  - @tanstack/router-core@1.171.35

## 1.170.41

### Patch Changes

- [#8529](https://github.com/TanStack/router/pull/8529) [`60b8ad1`](https://github.com/TanStack/router/commit/60b8ad1ad00812bf966a8eeee6be238c37ddad74) - Compose only enabled route boundaries instead of rendering inactive wrapper components.

- [#8568](https://github.com/TanStack/router/pull/8568) [`614bc27`](https://github.com/TanStack/router/commit/614bc27034c8ec98747bf305ed41d4a619640949) - Update TanStack Store to 0.11.2 to prevent unrelated atom reads inside subscription observers from triggering extra notifications.

- [#8530](https://github.com/TanStack/router/pull/8530) [`ff66a03`](https://github.com/TanStack/router/commit/ff66a03df4816f44a48a4a37189fc4021b1c8480) - Consolidate the root match context provider while preserving match context in the root shell.

- [#8522](https://github.com/TanStack/router/pull/8522) [`863c8a7`](https://github.com/TanStack/router/commit/863c8a736b96746c56278a16c50554356f5523d1) - Reuse Link href classification and active/inactive results across location updates while preserving live history href formatting.

- Updated dependencies [[`d521abd`](https://github.com/TanStack/router/commit/d521abd71c69f1ff010bb3def4d417cb5fa058cb)]:
  - @tanstack/router-core@1.171.34

## 1.170.40

### Patch Changes

- [#8436](https://github.com/TanStack/router/pull/8436) [`f5ffd38`](https://github.com/TanStack/router/commit/f5ffd3884ba26778a2a8ce53b379a5bded231676) - Skip unused Link preload cleanup when preloading is disabled and ignore queued viewport notifications after their effect has been cleaned up.

- Updated dependencies [[`488d046`](https://github.com/TanStack/router/commit/488d046a907d330429e2c807ef95326dad87480f), [`0c1b5e3`](https://github.com/TanStack/router/commit/0c1b5e38de71b7e81bbf1fd81c73ee0cd68ffe47), [`3cdd1af`](https://github.com/TanStack/router/commit/3cdd1af04b3e2d6f777797ee7bddf285318dd9d2)]:
  - @tanstack/router-core@1.171.33

## 1.170.39

### Patch Changes

- [#8435](https://github.com/TanStack/router/pull/8435) [`73bfc15`](https://github.com/TanStack/router/commit/73bfc153eef460e9b670556215a5adb2b5cbf542) - Avoid hydration-triggered rerenders for links that do not compare URL hashes while preserving hash-sensitive active state and ClientOnly behavior.

## 1.170.38

### Patch Changes

- Updated dependencies [[`cecae54`](https://github.com/TanStack/router/commit/cecae5440b8edaea77c5448fe3d74bbd20fe10a4), [`0103578`](https://github.com/TanStack/router/commit/01035782e53af9b929c784b94ddd64b95efb89c7), [`ce10dcd`](https://github.com/TanStack/router/commit/ce10dcd4d9d3d23738744e453205aad5c6dbd716), [`84936cc`](https://github.com/TanStack/router/commit/84936cc04530bba11059c57b293a794922bbc5aa), [`bbd2336`](https://github.com/TanStack/router/commit/bbd2336b8446de3f7dd85070895e7cf43980183e)]:
  - @tanstack/router-core@1.171.32

## 1.170.37

### Patch Changes

- [#8418](https://github.com/TanStack/router/pull/8418) [`e561fa1`](https://github.com/TanStack/router/commit/e561fa1d7118e3d29267cc3b6ce1130d6581f387) - `deepEqual` now takes its flags as positional arguments — `deepEqual(a, b, partial?, explicitUndefined?)` — instead of an options object. The router's hot callers (Link option stabilization and active-state checks, `matchRoute`) no longer allocate an options object per comparison, and the comparator reads two booleans instead of a polymorphic object. `explicitUndefined` replaces `ignoreUndefined: false`. `deepEqual` is an internal helper; it stays exported for compatibility of two-argument calls.

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

- [#8420](https://github.com/TanStack/router/pull/8420) [`8e164d2`](https://github.com/TanStack/router/commit/8e164d28f9e9eb1a7301109230d7ece9817492a8) - `useLinkProps` no longer calls through an internal wrapper. The host element `Link` renders on is an `@internal` overload parameter that is stripped from the published declarations, so the public `useLinkProps(options, forwardedRef?)` signature is unchanged.

- Updated dependencies [[`bc80866`](https://github.com/TanStack/router/commit/bc80866f6d6eb3e6f152ee3682eb783c96403e83), [`e561fa1`](https://github.com/TanStack/router/commit/e561fa1d7118e3d29267cc3b6ce1130d6581f387), [`cbbfbe3`](https://github.com/TanStack/router/commit/cbbfbe37ab1dbe328c343cb437c5660769cc9f26), [`a1c8d1a`](https://github.com/TanStack/router/commit/a1c8d1aa759c227eae9601a030321ac4c53c24bd), [`cbbfbe3`](https://github.com/TanStack/router/commit/cbbfbe37ab1dbe328c343cb437c5660769cc9f26), [`a0b2ad9`](https://github.com/TanStack/router/commit/a0b2ad99aee64af08d16b0e4ff26b3ba42a99f0a), [`1ca361b`](https://github.com/TanStack/router/commit/1ca361ba52a627d2f76ab33323bd83d1d0aa65a3)]:
  - @tanstack/router-core@1.171.31

## 1.170.36

### Patch Changes

- [#8390](https://github.com/TanStack/router/pull/8390) [`b747fb8`](https://github.com/TanStack/router/commit/b747fb8891b3347b1ffdfe0fa81e7d15049cb776) - Keep the Link location cache out of server bundles: `buildLocation` only creates, reads and writes it when `isServer` is false. Render React Links on the server without the extra prop copies and the forwarded-ref hook. Link SSR rendering is 20-40% faster in the Link benchmarks and the React Start SSR request loop about 7% faster.

  React `activeProps` and `inactiveProps` now follow one precedence rule on every link, including links whose destination is blocked for using a disallowed scheme: state props override element props, `ref` and event handlers, while `href`, `disabled` and `target` stay controlled by the router. Previously a blocked link ignored a `ref` or handler from its inactive props.

  React `Link` and `useLinkProps` split router options from element props with one key set on the client and the server. Element props pass through as given: external links forward them verbatim, falsy values included, and `useLinkProps` now returns `children` for router-controlled links as it already did for external ones.

- [#8324](https://github.com/TanStack/router/pull/8324) [`6387d58`](https://github.com/TanStack/router/commit/6387d581eabc6e6a3acc87a0bc924e5a38d9c8b2) - Reuse hydration snapshot getters to avoid unnecessary store-instance effect updates when Links and other hydration-aware components rerender.

- [#8318](https://github.com/TanStack/router/pull/8318) [`9b2adaf`](https://github.com/TanStack/router/commit/9b2adaf8c3fca905f156c42f6a4fe17a787afcc8) - Allow active and inactive Link props to override base element props in React and Solid while preserving class/style merging. Keep React's `href`, `target`, and `disabled` values controlled by routing options. Preserve Vue object and nested-array class bindings, including reactive updates and server rendering, without mutating cached bindings during VNode normalization.

- [#8327](https://github.com/TanStack/router/pull/8327) [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef) - Make `pathParamsAllowedCharacters` initialization-only. Configure it when creating the router; changing allowed characters requires a new router instance. Remove decoder-update bookkeeping and decoder-change checks from route-owned path caches.

- [#8370](https://github.com/TanStack/router/pull/8370) [`e9396c9`](https://github.com/TanStack/router/commit/e9396c928945d1dd6fd3f3bd8052143794f688b5) - Stop exporting the internal `isPlainObject` and `isPlainArray` helpers.

- [#8324](https://github.com/TanStack/router/pull/8324) [`6387d58`](https://github.com/TanStack/router/commit/6387d581eabc6e6a3acc87a0bc924e5a38d9c8b2) - Avoid a redundant prop copy when rendering native Links while preserving custom-component props and the public hook result.

- [#8252](https://github.com/TanStack/router/pull/8252) [`7e349c3`](https://github.com/TanStack/router/commit/7e349c3071ef7a346698d320fc0989998ad55734) - Reduce the bundle cost of shared Link pathname interpolation while preserving its rendering performance. Reuse one interpolation pass for pathname and optional metadata, keep the bounded cache on the router, and simplify React Link active-state and prop merging.

- [#8370](https://github.com/TanStack/router/pull/8370) [`e9396c9`](https://github.com/TanStack/router/commit/e9396c928945d1dd6fd3f3bd8052143794f688b5) - Reuse built locations for Links whose destination does not depend on the current location. `buildLocation` keeps the result per options object when the build never read the current location, and the React `Link` passes one stable options object per instance, so navigations resolve unchanged Links with a lookup instead of a full build. The per-route pathname interpolation cache this replaces is removed. Link `params`, `search` and `activeOptions` are compared by value on render, so inline object literals with unchanged contents keep reusing the Link's location. Pass a new object to change a destination; like any other React prop, an object mutated in place is not re-read.

- Updated dependencies [[`d76a332`](https://github.com/TanStack/router/commit/d76a33284bc0668f7af4c972a6d32bd0f42b22a6), [`b747fb8`](https://github.com/TanStack/router/commit/b747fb8891b3347b1ffdfe0fa81e7d15049cb776), [`6cfb1e8`](https://github.com/TanStack/router/commit/6cfb1e8b564be282584765352250bf61747895ed), [`700a714`](https://github.com/TanStack/router/commit/700a714c5fb64199b4edfaa3273d230c9894e274), [`700a714`](https://github.com/TanStack/router/commit/700a714c5fb64199b4edfaa3273d230c9894e274), [`8fff7fa`](https://github.com/TanStack/router/commit/8fff7fa1f2e6f061916b0bf5e0ec486b2e732f94), [`f021f6d`](https://github.com/TanStack/router/commit/f021f6d1c6dce6c9b54d70766f1d636d8fd9e184), [`ae68535`](https://github.com/TanStack/router/commit/ae68535929043607d4ee9438f8ae401f3a064862), [`7e349c3`](https://github.com/TanStack/router/commit/7e349c3071ef7a346698d320fc0989998ad55734), [`873c830`](https://github.com/TanStack/router/commit/873c830ccb2610a864ee697250e10fcc99772ffa), [`7e349c3`](https://github.com/TanStack/router/commit/7e349c3071ef7a346698d320fc0989998ad55734), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef), [`e9396c9`](https://github.com/TanStack/router/commit/e9396c928945d1dd6fd3f3bd8052143794f688b5), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef), [`f151ab0`](https://github.com/TanStack/router/commit/f151ab018eede64ae849b77e68f3cdf31cb95cc5), [`bc57fa3`](https://github.com/TanStack/router/commit/bc57fa3f12450cf34c731450947c7c8f1ea05e58), [`9872d2a`](https://github.com/TanStack/router/commit/9872d2ac39fc05f4ef6566c0b421f71ceb115244), [`d76a332`](https://github.com/TanStack/router/commit/d76a33284bc0668f7af4c972a6d32bd0f42b22a6), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef), [`7e349c3`](https://github.com/TanStack/router/commit/7e349c3071ef7a346698d320fc0989998ad55734), [`9448caa`](https://github.com/TanStack/router/commit/9448caa03a89076b9770631c356c0cc502802c09), [`e9396c9`](https://github.com/TanStack/router/commit/e9396c928945d1dd6fd3f3bd8052143794f688b5), [`700a714`](https://github.com/TanStack/router/commit/700a714c5fb64199b4edfaa3273d230c9894e274), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef)]:
  - @tanstack/router-core@1.171.30
  - @tanstack/history@1.162.4

## 1.170.35

### Patch Changes

- [#7824](https://github.com/TanStack/router/pull/7824) [`8c43c71`](https://github.com/TanStack/router/commit/8c43c712523fc63dc3a814f3a19617e270ce8ed1) - Upgrade TanStack Store to 0.11 and migrate router subscriptions to useSelector, preserving selector comparisons and Vue subscription cleanup.

## 1.170.34

### Patch Changes

- [#8279](https://github.com/TanStack/router/pull/8279) [`aee42c6`](https://github.com/TanStack/router/commit/aee42c6b641d8e919bfed9e0f04bb1b72092f3a6) - Avoid allocating event-handler arrays and wrapper functions for links without user-supplied event handlers.

- [#8308](https://github.com/TanStack/router/pull/8308) [`9c1871c`](https://github.com/TanStack/router/commit/9c1871ccc88bc1157186b8b460941a304ec740b8) - Validate navigation and redirect destinations, keep ambiguous relative URLs on the current origin, and constrain prerender requests and output paths. Prevent redirect headers from appearing in serialized server function response bodies.

  Preserve native form HTTP redirects, route error handling and masks for document redirects, and per-navigation destinations for shared loader redirects. Avoid redundant origin parsing and reduce link styling and server-rendering work. Configured origins must already be normalized.

  Keep blocked-link inactive props consistent during React hydration, honor explicit redirect Location headers before checking route options, and refresh Vue link state when destinations become internal. Reuse the protocol-relative URL check while parsing redirect schemes once.

  Reduce React link bundle size by sharing pathname comparisons, state-prop selection, and element creation.

  Share normalized pathname comparisons in Solid and Vue links to reduce bundle size.

- [#8311](https://github.com/TanStack/router/pull/8311) [`9aec5a7`](https://github.com/TanStack/router/commit/9aec5a7012c47e83ec23bb4763494b72a5e68bfc) - React Links resolve state props without temporary class-name arrays or unnecessary style copies.

- Updated dependencies [[`f9836f1`](https://github.com/TanStack/router/commit/f9836f16f0e25b0a8495f5e01e3f303b1cbc8725), [`9c1871c`](https://github.com/TanStack/router/commit/9c1871ccc88bc1157186b8b460941a304ec740b8), [`9871c06`](https://github.com/TanStack/router/commit/9871c0625806001d6bf373524821a00303438a91), [`0654c0a`](https://github.com/TanStack/router/commit/0654c0a1a427db24d9af13c1d6ad1217a588c0c9)]:
  - @tanstack/router-core@1.171.29
  - @tanstack/history@1.162.3

## 1.170.33

### Patch Changes

- [#8165](https://github.com/TanStack/router/pull/8165) [`2f20c00`](https://github.com/TanStack/router/commit/2f20c00224c5ba63467551914e0c37012588c4c2) - Exclude structural descendants below error and not-found boundaries from route lifecycle callbacks. Preserve lifecycle membership through invalidation, hydration, background reloads, and superseded navigation publication.

- [#8209](https://github.com/TanStack/router/pull/8209) [`28a5e45`](https://github.com/TanStack/router/commit/28a5e4504e4ea5cb1480667a4bea2588a53e110f) - Preserve falsy thrown values in React and Vue error boundaries. Type React and Vue boundary error components and `onCatch` callbacks as `unknown`. Solid boundary errors remain typed as `Error`; SSR now wraps non-`Error` loader errors to match Solid’s native boundary behavior, preserving the original value in `cause`. Router state and loader `onError` values are unchanged.

  When upgrading React or Vue, narrow boundary errors (for example, with `error instanceof Error`) before reading `message` or `stack`. `ErrorComponentProps<TError>` remains available for values narrowed to a specific error type. Route `onError` types are unchanged.

- [#8161](https://github.com/TanStack/router/pull/8161) [`f0b5eda`](https://github.com/TanStack/router/commit/f0b5eda544606686a8a8d675a686ca1366428b96) - Retain successful not-found matches as terminal shared boundaries during client navigation, preserving route context while the destination loads.

- [#8251](https://github.com/TanStack/router/pull/8251) [`0497cae`](https://github.com/TanStack/router/commit/0497caeef3ff7e1c1c6080eca38bca24e7ec320b) - Use URL.canParse for absolute URL checks in links, navigation, redirects, and build configuration. Preserve a URL constructor fallback for older browsers.

- [#8169](https://github.com/TanStack/router/pull/8169) [`0caf6b9`](https://github.com/TanStack/router/commit/0caf6b9a2b7e14b0b146c74cc27cb05c19d700a5) - Fix route-scoped `useMatch`, `useSearch`, and `useParams` APIs to forward the `shouldThrow` option and preserve optional return types when `shouldThrow: false`.

- [#8257](https://github.com/TanStack/router/pull/8257) [`cf166d1`](https://github.com/TanStack/router/commit/cf166d160e6397007a979bfc7065b45ff69ea543) - Fix repeated `innerHTML` writes for unchanged styles and data scripts during React re-renders. This prevents unnecessary CSS parsing and Trusted Types errors during client navigation.

- Updated dependencies [[`edf0e16`](https://github.com/TanStack/router/commit/edf0e16ebfe82ec6e8f68f403a1fda8de9e28889), [`2f20c00`](https://github.com/TanStack/router/commit/2f20c00224c5ba63467551914e0c37012588c4c2), [`28a5e45`](https://github.com/TanStack/router/commit/28a5e4504e4ea5cb1480667a4bea2588a53e110f), [`08eff50`](https://github.com/TanStack/router/commit/08eff50c447a154a3373909009e9e4375cea17ce), [`216c0c4`](https://github.com/TanStack/router/commit/216c0c48036fd1a33163b70dcabfed2b893808b0), [`2f91503`](https://github.com/TanStack/router/commit/2f9150309bc472f4a75cbe98adcdb50c76b12c7a), [`f0b5eda`](https://github.com/TanStack/router/commit/f0b5eda544606686a8a8d675a686ca1366428b96), [`50eafca`](https://github.com/TanStack/router/commit/50eafcaebbbedb6fde3b2816de7a0ace8cde4832), [`0497cae`](https://github.com/TanStack/router/commit/0497caeef3ff7e1c1c6080eca38bca24e7ec320b), [`ee28348`](https://github.com/TanStack/router/commit/ee283480dfa51150a2e0b096a6eff94a89ff8b3f), [`9035abc`](https://github.com/TanStack/router/commit/9035abc41163d83409ef582f7743a3c7be57dd93), [`c18e690`](https://github.com/TanStack/router/commit/c18e69081475a7c98f9d40bd0fe6da78ccb84598)]:
  - @tanstack/router-core@1.171.28
  - @tanstack/history@1.162.2

## 1.170.32

### Patch Changes

- [#8130](https://github.com/TanStack/router/pull/8130) [`cb281d7`](https://github.com/TanStack/router/commit/cb281d70c1f5fe780f9d07bc500ea3a284a4e04b) - preserve context during reloads

- Updated dependencies [[`fa65287`](https://github.com/TanStack/router/commit/fa652872812c9433ba8b9d9a285e51b535e7367c), [`cb281d7`](https://github.com/TanStack/router/commit/cb281d70c1f5fe780f9d07bc500ea3a284a4e04b)]:
  - @tanstack/router-core@1.171.27

## 1.170.31

### Patch Changes

- Updated dependencies [[`3e016ac`](https://github.com/TanStack/router/commit/3e016ac84ffec8119f0c25cfdd1fb17e5292bd34)]:
  - @tanstack/router-core@1.171.26

## 1.170.30

### Patch Changes

- [#8084](https://github.com/TanStack/router/pull/8084) [`5d3785d`](https://github.com/TanStack/router/commit/5d3785dcc366b66b1c261b5d01e66af778ff1175) - preserve pending UI across retained routes

- [#8068](https://github.com/TanStack/router/pull/8068) [`f75cada`](https://github.com/TanStack/router/commit/f75cada01707e51fb9650dd301bc04f8b2265a2a) - direct export of CatchBoundary class component, remove function wrapper

- Updated dependencies [[`5d3785d`](https://github.com/TanStack/router/commit/5d3785dcc366b66b1c261b5d01e66af778ff1175), [`63d2cc9`](https://github.com/TanStack/router/commit/63d2cc9155ff5374112f7d067d0b278bafeb8486)]:
  - @tanstack/router-core@1.171.25

## 1.170.29

### Patch Changes

- [#8073](https://github.com/TanStack/router/pull/8073) [`0fdf9ff`](https://github.com/TanStack/router/commit/0fdf9ff16fc532de9fc131d18df167ebd8038720) - inline isCtrlKey inside Link component for byte shaving

- Updated dependencies [[`4c89b15`](https://github.com/TanStack/router/commit/4c89b15dd2b46491ee5e57985559bae8e31d62c2), [`cf6ab17`](https://github.com/TanStack/router/commit/cf6ab178b39e7628bf784759f384e0f4230e6d9e), [`bdaf73a`](https://github.com/TanStack/router/commit/bdaf73a4063ee2b02e3c9cc105ad10ce82a5a0ff)]:
  - @tanstack/router-core@1.171.24

## 1.170.28

### Patch Changes

- [#8055](https://github.com/TanStack/router/pull/8055) [`0c25a7b`](https://github.com/TanStack/router/commit/0c25a7b43b5331ee6ebf94d50e9793002783adab) - Avoid wrapping root components that may render the HTML document in a Suspense boundary during SSR and hydration.

- [#8054](https://github.com/TanStack/router/pull/8054) [`31882c7`](https://github.com/TanStack/router/commit/31882c7fa87debef236228831655cb112c20ce90) - Reuse resolved lazy route components when revisiting code-split routes, preventing unnecessary pending UI.

- Updated dependencies [[`31882c7`](https://github.com/TanStack/router/commit/31882c7fa87debef236228831655cb112c20ce90)]:
  - @tanstack/router-core@1.171.23

## 1.170.27

### Patch Changes

- [#8047](https://github.com/TanStack/router/pull/8047) [`b0817f5`](https://github.com/TanStack/router/commit/b0817f50cc639ae50b6c30cd11c5adbf7eed028c) - useMatchRoute w/ React Compiler

## 1.170.26

### Patch Changes

- [#8045](https://github.com/TanStack/router/pull/8045) [`f500760`](https://github.com/TanStack/router/commit/f5007607d62e932b8df19de866cdc6bddcff8db3) - Warn when an Outlet is rendered inside a pending, error, or not-found component.

- [#8043](https://github.com/TanStack/router/pull/8043) [`1aafca9`](https://github.com/TanStack/router/commit/1aafca9b45d24f8f0dba78e716fc9582346c6ca1) - remove the undocumented Link `isTransitioning` state and `data-transitioning` attribute

- [#8044](https://github.com/TanStack/router/pull/8044) [`aa10b65`](https://github.com/TanStack/router/commit/aa10b6589eeda215f5a60ea0af95a3101d8c414e) - Apply `preloadDelay` to viewport link preloading and cancel pending preloads when links leave the viewport.

- Updated dependencies [[`7e93431`](https://github.com/TanStack/router/commit/7e93431ae9ff58c91c3c5ca10ffcb8414c1d0b13)]:
  - @tanstack/router-core@1.171.22

## 1.170.25

### Patch Changes

- Updated dependencies [[`51138a8`](https://github.com/TanStack/router/commit/51138a824cea053738f125c4c95073bd6286ff05)]:
  - @tanstack/router-core@1.171.21

## 1.170.24

### Patch Changes

- Updated dependencies [[`44a8c3e`](https://github.com/TanStack/router/commit/44a8c3e1d2af305064b2363d97fc7847c6f1a246), [`5253e70`](https://github.com/TanStack/router/commit/5253e70db2083d68a788fb7c9a043bb0c5518f2a)]:
  - @tanstack/router-core@1.171.20

## 1.170.23

### Patch Changes

- [#7952](https://github.com/TanStack/router/pull/7952) [`95dec51`](https://github.com/TanStack/router/commit/95dec51018d01483949c6f1fe3094b019ccf3b4f) - bail out of `Link` re-renders when the resolved href and active state are unchanged

## 1.170.22

### Patch Changes

- [#7992](https://github.com/TanStack/router/pull/7992) [`ea3a665`](https://github.com/TanStack/router/commit/ea3a665d81cbb5074c2d77ec953255ab534e7db9) - retain mounted UI during revalidation

- Updated dependencies [[`ea3a665`](https://github.com/TanStack/router/commit/ea3a665d81cbb5074c2d77ec953255ab534e7db9)]:
  - @tanstack/router-core@1.171.19

## 1.170.21

### Patch Changes

- [#7961](https://github.com/TanStack/router/pull/7961) [`697ebb6`](https://github.com/TanStack/router/commit/697ebb6ddbd433d052b6b4707938a5c595865d58) - Prevent a blank frame before zero-delay initial pending UI by using a
  component-scoped React transition for match publication. Pending timing,
  boundary selection, and rendered matches continue to come from the router
  core.

- [#7970](https://github.com/TanStack/router/pull/7970) [`2435885`](https://github.com/TanStack/router/commit/2435885fa8b5e31c8c4b74d93920919f27316ebf) - createFileRoute does not rely on FileRoute class

- [#7971](https://github.com/TanStack/router/pull/7971) [`86bf510`](https://github.com/TanStack/router/commit/86bf510c2923afb76804223bd04afc2a809b33e7) - clean intersection observer options in link component

- [#7967](https://github.com/TanStack/router/pull/7967) [`6aefb33`](https://github.com/TanStack/router/commit/6aefb3392595a07a93f89301d7b5e3558ff9190c) - Preserve path params in their raw string form while matching routes so structured values returned by `params.parse` produce stable match IDs and do not reuse stale loader data.

  `RouterCore.getMatchedRoutes()` now returns `[matchedRoutes, rawParams, foundRoute]` instead of an object.

- Updated dependencies [[`84db4a8`](https://github.com/TanStack/router/commit/84db4a842311df3f7e58073f6f12aaf371aeb5c7), [`9cac62a`](https://github.com/TanStack/router/commit/9cac62a5c7f99ef070991ea6f1fa7e42c746d46b), [`6aefb33`](https://github.com/TanStack/router/commit/6aefb3392595a07a93f89301d7b5e3558ff9190c)]:
  - @tanstack/router-core@1.171.18
  - @tanstack/history@1.162.1

## 1.170.20

### Patch Changes

- Updated dependencies [[`b2908c6`](https://github.com/TanStack/router/commit/b2908c642ac09aa08e6d965d2a820d7186e42fd5)]:
  - @tanstack/router-core@1.171.17

## 1.170.19

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

- Updated dependencies [[`45c4ad8`](https://github.com/TanStack/router/commit/45c4ad8d629e291fab70c37900525449e415ffcd)]:
  - @tanstack/router-core@1.171.16

## 1.170.18

### Patch Changes

- Updated dependencies [[`e2dd204`](https://github.com/TanStack/router/commit/e2dd2049cb42eb219d3b447b8605066d19d9c1fa)]:
  - @tanstack/router-core@1.171.15

## 1.170.17

### Patch Changes

- Updated dependencies [[`9809a06`](https://github.com/TanStack/router/commit/9809a0619d4ed3fe8c2a393af5b9eca4b6c7695b)]:
  - @tanstack/router-core@1.171.14

## 1.170.16

### Patch Changes

- [#7595](https://github.com/TanStack/router/pull/7595) [`52db703`](https://github.com/TanStack/router/commit/52db7034fd83b17cc45da9ba775ec253f2a9a149) - Perf improvement of useMatch and derived hooks when navigating away from previous match

- [#7575](https://github.com/TanStack/router/pull/7575) [`4a93cff`](https://github.com/TanStack/router/commit/4a93cffffca34702e419bc47db827f964fd0cb65) - useMatches can skip useRef for structural sharing during SSR

- [#7600](https://github.com/TanStack/router/pull/7600) [`f046b06`](https://github.com/TanStack/router/commit/f046b064d32222cad0b7ea061311ca9a474f5990) - Reduce Match rerenders during navigations (PR [#7596](https://github.com/TanStack/router/issues/7596))

- [#7577](https://github.com/TanStack/router/pull/7577) [`689d88e`](https://github.com/TanStack/router/commit/689d88e04c48ec76a18453ab8b82d8d58f2668b6) - Reduce bundle size by sharing structuralSharing selector logic

- [#7627](https://github.com/TanStack/router/pull/7627) [`689c5ab`](https://github.com/TanStack/router/commit/689c5ab32e9bb18d90a5a94c33237b0e418df3e3) - Silence AbortError in renderRouterToStream, this is normal operation

## 1.170.15

### Patch Changes

- Updated dependencies [[`776d8ef`](https://github.com/TanStack/router/commit/776d8ef283e5bd9ffe97d43bc3a7f58064cd7e03)]:
  - @tanstack/router-core@1.171.13

## 1.170.14

### Patch Changes

- Updated dependencies [[`df1076c`](https://github.com/TanStack/router/commit/df1076c03ae5a51ab384bebd4d6afda20fb6f107)]:
  - @tanstack/router-core@1.171.12

## 1.170.13

### Patch Changes

- [#7555](https://github.com/TanStack/router/pull/7555) [`ac10815`](https://github.com/TanStack/router/commit/ac10815f387d25b15163ff711b4049e8f8482d01) - Fix search middleware composition so `retainSearchParams` does not restore search params that a downstream `stripSearchParams` removed.

- Updated dependencies [[`ac10815`](https://github.com/TanStack/router/commit/ac10815f387d25b15163ff711b4049e8f8482d01)]:
  - @tanstack/router-core@1.171.11

## 1.170.12

### Patch Changes

- Updated dependencies [[`2cca73c`](https://github.com/TanStack/router/commit/2cca73c92262ffd96dac4e283c9f69fb37f4b43a), [`7a83e67`](https://github.com/TanStack/router/commit/7a83e67e6596fbef21cb0a88a7127f5935bed2ba), [`76b3d3b`](https://github.com/TanStack/router/commit/76b3d3b24522bd3d1d216674c441252c9b8f184c)]:
  - @tanstack/router-core@1.171.10

## 1.170.11

### Patch Changes

- Updated dependencies [[`b4cd5af`](https://github.com/TanStack/router/commit/b4cd5af8d0f9d4aaa2d29095e6a261b9181bc778)]:
  - @tanstack/router-core@1.171.9

## 1.170.10

### Patch Changes

- [#7505](https://github.com/TanStack/router/pull/7505) [`2f53749`](https://github.com/TanStack/router/commit/2f5374945e2138559a51464f45a5152eae67e1dd) - Preserve primitive values thrown from beforeLoad error handling.

- Updated dependencies [[`2f53749`](https://github.com/TanStack/router/commit/2f5374945e2138559a51464f45a5152eae67e1dd)]:
  - @tanstack/router-core@1.171.8

## 1.170.9

### Patch Changes

- [#7497](https://github.com/TanStack/router/pull/7497) [`d1997b6`](https://github.com/TanStack/router/commit/d1997b66d7c24c1d64772bb8bab5caf9c6d9cc48) - fix streaming

- Updated dependencies [[`d1997b6`](https://github.com/TanStack/router/commit/d1997b66d7c24c1d64772bb8bab5caf9c6d9cc48)]:
  - @tanstack/router-core@1.171.7

## 1.170.8

### Patch Changes

- Add support for Rsbuild client output formats, including module output by default and IIFE output for classic script environments. ([#7477](https://github.com/TanStack/router/pull/7477))

  Client entry scripts and preloads are now represented as root route manifest assets, script preloads follow the manifest script format, and script asset cross-origin configuration uses the `script` key. The `transformAssets` script callback context now exposes only `kind: 'script'` and `url`, keeping script format handling internal to manifest rendering.

- Updated dependencies [[`51a97a1`](https://github.com/TanStack/router/commit/51a97a167fb3ef1b8ca70fbb63db635158f43509)]:
  - @tanstack/router-core@1.171.6

## 1.170.7

### Patch Changes

- Updated dependencies [[`5268ba4`](https://github.com/TanStack/router/commit/5268ba4566233ea58880df85f167ad0401a93a46)]:
  - @tanstack/router-core@1.171.5

## 1.170.6

### Patch Changes

- Fix hash navigation being overridden by stale scroll restoration entries. ([#7447](https://github.com/TanStack/router/pull/7447))

- Updated dependencies [[`0300f87`](https://github.com/TanStack/router/commit/0300f87ec5a7f878ffbe0b181acf84cba9139960), [`0300f87`](https://github.com/TanStack/router/commit/0300f87ec5a7f878ffbe0b181acf84cba9139960)]:
  - @tanstack/router-core@1.171.4

## 1.170.5

### Patch Changes

- Updated dependencies [[`5fa9e55`](https://github.com/TanStack/router/commit/5fa9e555f3a2edb5e45586623e6bcbfa7f7c7a6b)]:
  - @tanstack/router-core@1.171.3

## 1.170.4

### Patch Changes

- Updated dependencies [[`b60eb36`](https://github.com/TanStack/router/commit/b60eb36e59e8a468ee0742cbcf7f47aca1ff1c67)]:
  - @tanstack/router-core@1.171.2

## 1.170.3

### Patch Changes

- Updated dependencies [[`d9cf933`](https://github.com/TanStack/router/commit/d9cf9331b83fcbd2abfee75d839d862f9bb18e6b)]:
  - @tanstack/router-core@1.171.1

## 1.170.2

### Patch Changes

- Updated dependencies [[`d533f87`](https://github.com/TanStack/router/commit/d533f87976704098a40b48f160b37c28c8182806)]:
  - @tanstack/router-core@1.171.0

## 1.170.1

### Patch Changes

- Updated dependencies [[`2387a2e`](https://github.com/TanStack/router/commit/2387a2eea0683004cc400b9f71bed5944eb60110)]:
  - @tanstack/router-core@1.170.1

## 1.170.0

### Minor Changes

- Clean minor bump, fresh start ([#7395](https://github.com/TanStack/router/pull/7395))

### Patch Changes

- Updated dependencies [[`b1c061a`](https://github.com/TanStack/router/commit/b1c061aff9185cdf5fdc08c0136382a9dce0302f), [`201e150`](https://github.com/TanStack/router/commit/201e150bd1412bae2faa9ce53f0fefcb7574ac14)]:
  - @tanstack/router-core@1.170.0
  - @tanstack/history@1.162.0

## 1.169.2

### Patch Changes

- Updated dependencies [[`35e88f0`](https://github.com/TanStack/router/commit/35e88f04996d71019a1868b7b06ecb4ddbc9df9e)]:
  - @tanstack/router-core@1.169.2

## 1.169.1

### Patch Changes

- Updated dependencies [[`4a1e63f`](https://github.com/TanStack/router/commit/4a1e63f1d1230b1ed8234609acad4639d8982c13)]:
  - @tanstack/router-core@1.169.1

## 1.169.0

### Minor Changes

- Allow `params.parse` to experimentally return `false` to skip an incoming route candidate during path matching. Thrown parse errors still surface on the selected match instead of falling through, and outgoing typed route-template links continue to use exact route lookup followed by `params.stringify` for URL generation. ([#7263](https://github.com/TanStack/router/pull/7263))

### Patch Changes

- Updated dependencies [[`c992495`](https://github.com/TanStack/router/commit/c992495bf4010ff4c3597bb1f3b1ba02594e857e)]:
  - @tanstack/router-core@1.169.0

## 1.168.26

### Patch Changes

- Updated dependencies [[`b5c4183`](https://github.com/TanStack/router/commit/b5c4183ab8b44be8a75647b7f7b588ad7c146ece)]:
  - @tanstack/router-core@1.168.18

## 1.168.25

### Patch Changes

- Updated dependencies [[`493148b`](https://github.com/TanStack/router/commit/493148bc5378b7f9de1544d87f6aaa425c12eb34)]:
  - @tanstack/router-core@1.168.17

## 1.168.24

### Patch Changes

- Add TanStack Start inline CSS manifest support for SSR so route styles can be embedded in the HTML response and hydrated without duplicate stylesheet links. ([#7253](https://github.com/TanStack/router/pull/7253))

- Updated dependencies [[`4d864ee`](https://github.com/TanStack/router/commit/4d864eebbd184265eabb563d326ab409c93feb17)]:
  - @tanstack/router-core@1.168.16

## 1.168.23

### Patch Changes

- fix(react-router): prevent webpack static analysis of `React.use` with let binding ([#7182](https://github.com/TanStack/router/pull/7182))

## 1.168.22

### Patch Changes

- Preserve shared route stylesheet links across client navigation by rendering route CSS assets with React stylesheet precedence. ([#7186](https://github.com/TanStack/router/pull/7186))

## 1.168.21

### Patch Changes

- Updated dependencies [[`16f6892`](https://github.com/TanStack/router/commit/16f6892d6b7ceadf606677c5a40e743f29163aa6)]:
  - @tanstack/router-core@1.168.15

## 1.168.20

### Patch Changes

- Fix React Server Component imports from `@tanstack/react-router` by adding a `react-server` root export that preserves the normal API surface while resolving `notFound` and `redirect` from a server-safe entry. ([#7183](https://github.com/TanStack/router/pull/7183))

  This fixes RSC routes that throw `notFound()` or `redirect()` from server functions so they behave correctly during SSR and client navigation.

## 1.168.19

### Patch Changes

- Fix route file transforms to preserve route ID quoting, handle more exported `Route` patterns, and avoid incorrect import rewrites in edge cases. ([#7167](https://github.com/TanStack/router/pull/7167))

  Improve transform robustness with clearer route-call detection, safer import removal, and expanded test coverage for quote preservation, constructor swaps, and unsupported route definitions.

## 1.168.18

### Patch Changes

- Updated dependencies [[`0e2c900`](https://github.com/TanStack/router/commit/0e2c9003c18ae07c09969189c028f277ea562a7a)]:
  - @tanstack/router-core@1.168.14

## 1.168.17

### Patch Changes

- Updated dependencies [[`812792f`](https://github.com/TanStack/router/commit/812792fbda3caf97b300770855cf5641252f413b)]:
  - @tanstack/router-core@1.168.13

## 1.168.16

### Patch Changes

- Updated dependencies [[`8ec9ca9`](https://github.com/TanStack/router/commit/8ec9ca97b472779de878c2a6510f21deb24d386c)]:
  - @tanstack/router-core@1.168.12

## 1.168.15

### Patch Changes

- shorten internal non-minifiable store names for byte shaving ([#7152](https://github.com/TanStack/router/pull/7152))

- Updated dependencies [[`6355bb7`](https://github.com/TanStack/router/commit/6355bb75f7637ba77f06a923c18fdaf37720bb48)]:
  - @tanstack/router-core@1.168.11

## 1.168.14

### Patch Changes

- migrate createStore > createAtom for simpler API ([#7150](https://github.com/TanStack/router/pull/7150))

- Updated dependencies [[`459057c`](https://github.com/TanStack/router/commit/459057cd2d90cff20d20e51d4964b0a8c950555e)]:
  - @tanstack/router-core@1.168.10

## 1.168.13

### Patch Changes

- Fix `MatchRoute` child callback param inference to resolve params from the target `to` route instead of the route path key across React, Solid, and Vue adapters. ([#7139](https://github.com/TanStack/router/pull/7139))

- Fix a stale route error boundary state issue that could briefly render the next route's `errorComponent` after navigating away from a failed route. ([#7136](https://github.com/TanStack/router/pull/7136))

## 1.168.12

### Patch Changes

- Fix redirected pending route transitions so lazy target routes can finish loading without stale redirected matches causing render errors. ([#7137](https://github.com/TanStack/router/pull/7137))

## 1.168.11

### Patch Changes

- Fix `Link` to keep internal routing props like `preloadIntentProximity`, `from`, and `unsafeRelative` from leaking to rendered DOM elements across React, Solid, and Vue. ([#7138](https://github.com/TanStack/router/pull/7138))

## 1.168.10

### Patch Changes

- Preserve component-thrown `notFound()` errors through framework error boundaries so route `notFoundComponent` handlers render without requiring an explicit `routeId`. ([#7077](https://github.com/TanStack/router/pull/7077))

- Updated dependencies [[`796406d`](https://github.com/TanStack/router/commit/796406da66cfb12b518bb3ca326c9d541368fb06)]:
  - @tanstack/router-core@1.168.9

## 1.168.9

### Patch Changes

- Updated dependencies [[`2d1ec86`](https://github.com/TanStack/router/commit/2d1ec865a446926f7db6e29dbbde82d265de6d36)]:
  - @tanstack/router-core@1.168.8

## 1.168.8

### Patch Changes

- Updated dependencies [[`6ee0e79`](https://github.com/TanStack/router/commit/6ee0e795b085651beb2f1ac6503cdbd7eaffedd1)]:
  - @tanstack/router-core@1.168.7

## 1.168.7

### Patch Changes

- Updated dependencies [[`42c3f3b`](https://github.com/TanStack/router/commit/42c3f3b3a3a478fd6d6894310ef94b2d23794b8e)]:
  - @tanstack/router-core@1.168.6

## 1.168.6

### Patch Changes

- Remove the extra SSR sentinel tag used for `onRendered` in React Router while ([#7054](https://github.com/TanStack/router/pull/7054))
  preserving the client-side render timing needed for scroll restoration and
  `onRendered` subscribers.

## 1.168.5

### Patch Changes

- fix: scroll restoration without throttling ([#7042](https://github.com/TanStack/router/pull/7042))

- Updated dependencies [[`cf5f554`](https://github.com/TanStack/router/commit/cf5f5542476137a81515099ad740747e84512f9a)]:
  - @tanstack/router-core@1.168.5

## 1.168.4

### Patch Changes

- tanstack/store 0.9.3 ([#7041](https://github.com/TanStack/router/pull/7041))

- Updated dependencies [[`71a8b68`](https://github.com/TanStack/router/commit/71a8b684c87c37fd4a033d99f5ba4a05c7a179f5)]:
  - @tanstack/router-core@1.168.4

## 1.168.3

### Patch Changes

- feat: transformAssets ([#7023](https://github.com/TanStack/router/pull/7023))

- Updated dependencies [[`d81d21a`](https://github.com/TanStack/router/commit/d81d21ad05c9401bf54b24acd29401e1e4fd624c)]:
  - @tanstack/router-core@1.168.3

## 1.168.2

### Patch Changes

- Replace tiny-invariant and tiny-warning with in-house solution for bundle-size ([#7007](https://github.com/TanStack/router/pull/7007))

- Updated dependencies [[`c9e1855`](https://github.com/TanStack/router/commit/c9e18555f3a5531e96de8f574cfca9edcdb18e5c)]:
  - @tanstack/router-core@1.168.2

## 1.168.1

### Patch Changes

- Update store to 0.9.2 ([#6993](https://github.com/TanStack/router/pull/6993))

- Updated dependencies [[`91cc628`](https://github.com/TanStack/router/commit/91cc62899b75ca920fe83c5ee7f3dbb5c71a523f)]:
  - @tanstack/router-core@1.168.1

## 1.168.0

### Minor Changes

- remove pendingMatches, cachedMatches ([#6704](https://github.com/TanStack/router/pull/6704))
  move to signal-based reactivity
  solid uses its own native signals

### Patch Changes

- Updated dependencies [[`0545239`](https://github.com/TanStack/router/commit/054523900b2ee19308e5a88417dadfc6923afe30)]:
  - @tanstack/router-core@1.168.0

## 1.167.5

### Patch Changes

- Updated dependencies [[`5ff4f0b`](https://github.com/TanStack/router/commit/5ff4f0b8dce1fac2bb0b0bfe2684fc677a8ee505)]:
  - @tanstack/router-core@1.167.5

## 1.167.4

### Patch Changes

- Add @tanstack/intent AI agent skills and CLI entry points for Router and Start packages ([#6866](https://github.com/TanStack/router/pull/6866))

- Updated dependencies [[`940151c`](https://github.com/TanStack/router/commit/940151cbed0c76c92a5cf196c0905b17a956ca7e)]:
  - @tanstack/router-core@1.167.4

## 1.167.3

### Patch Changes

- Updated dependencies [[`32fcba7`](https://github.com/TanStack/router/commit/32fcba7b044b03f5901308b870f70b0b4910c220)]:
  - @tanstack/router-core@1.167.3

## 1.167.2

### Patch Changes

- build: update to vite-config 5.x (rolldown) ([#6926](https://github.com/TanStack/router/pull/6926))

- Updated dependencies [[`838b0eb`](https://github.com/TanStack/router/commit/838b0eb9a8bbbb987a0a6972c1446e01423bbd7b)]:
  - @tanstack/history@1.161.6
  - @tanstack/router-core@1.167.2

## 1.167.1

### Patch Changes

- fix: build with @tanstack/vite-config 0.4.3 ([#6923](https://github.com/TanStack/router/pull/6923))

- Updated dependencies [[`ef9b241`](https://github.com/TanStack/router/commit/ef9b241f3cfe95cee40daa96da669f0ffd4a971a)]:
  - @tanstack/router-core@1.167.1
  - @tanstack/history@1.161.5

## 1.167.0

### Minor Changes

- feat: add staleReloadMode ([#6921](https://github.com/TanStack/router/pull/6921))

### Patch Changes

- Updated dependencies [[`6f297a2`](https://github.com/TanStack/router/commit/6f297a249424c0fd1c1a56aa4fc12c8217be7b6a)]:
  - @tanstack/router-core@1.167.0

## 1.166.8

### Patch Changes

- fix: hoist inline component definitions for proper React HMR#6919 ([#6919](https://github.com/TanStack/router/pull/6919))
