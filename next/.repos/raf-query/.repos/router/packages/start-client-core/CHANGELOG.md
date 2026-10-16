# @tanstack/start-client-core

## 1.170.35

### Patch Changes

- Updated dependencies [[`dfe3dea`](https://github.com/TanStack/router/commit/dfe3dea88a28400db1677111e2b15ae7914782c2), [`efc2042`](https://github.com/TanStack/router/commit/efc2042c2d02a9780c3e7efe81f123d066a869eb), [`efc2042`](https://github.com/TanStack/router/commit/efc2042c2d02a9780c3e7efe81f123d066a869eb), [`dfe3dea`](https://github.com/TanStack/router/commit/dfe3dea88a28400db1677111e2b15ae7914782c2), [`663282b`](https://github.com/TanStack/router/commit/663282b0ebbc494aee3595ed95867ee29d01938e)]:
  - @tanstack/router-core@1.171.35
  - @tanstack/start-storage-context@1.167.37

## 1.170.34

### Patch Changes

- Updated dependencies [[`d521abd`](https://github.com/TanStack/router/commit/d521abd71c69f1ff010bb3def4d417cb5fa058cb)]:
  - @tanstack/router-core@1.171.34
  - @tanstack/start-storage-context@1.167.36

## 1.170.33

### Patch Changes

- [#8297](https://github.com/TanStack/router/pull/8297) [`488d046`](https://github.com/TanStack/router/commit/488d046a907d330429e2c807ef95326dad87480f) - Update `seroval` and `seroval-plugins` from 1.6.2 to 1.6.7. This picks up the typed array length guard, the `maxBase64Length` and `compactArrayBufferViews` options, and the `isStream` export.

- [#8353](https://github.com/TanStack/router/pull/8353) [`76a7c0b`](https://github.com/TanStack/router/commit/76a7c0bfadb42d5f7fe7b9e1748acc7333178c91) - Avoid an unused array when registering server-function middleware.

- Updated dependencies [[`488d046`](https://github.com/TanStack/router/commit/488d046a907d330429e2c807ef95326dad87480f), [`0c1b5e3`](https://github.com/TanStack/router/commit/0c1b5e38de71b7e81bbf1fd81c73ee0cd68ffe47), [`3cdd1af`](https://github.com/TanStack/router/commit/3cdd1af04b3e2d6f777797ee7bddf285318dd9d2)]:
  - @tanstack/router-core@1.171.33
  - @tanstack/start-storage-context@1.167.35

## 1.170.32

### Patch Changes

- Updated dependencies [[`cecae54`](https://github.com/TanStack/router/commit/cecae5440b8edaea77c5448fe3d74bbd20fe10a4), [`0103578`](https://github.com/TanStack/router/commit/01035782e53af9b929c784b94ddd64b95efb89c7), [`ce10dcd`](https://github.com/TanStack/router/commit/ce10dcd4d9d3d23738744e453205aad5c6dbd716), [`84936cc`](https://github.com/TanStack/router/commit/84936cc04530bba11059c57b293a794922bbc5aa), [`bbd2336`](https://github.com/TanStack/router/commit/bbd2336b8446de3f7dd85070895e7cf43980183e)]:
  - @tanstack/router-core@1.171.32
  - @tanstack/start-storage-context@1.167.34

## 1.170.31

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

- Updated dependencies [[`bc80866`](https://github.com/TanStack/router/commit/bc80866f6d6eb3e6f152ee3682eb783c96403e83), [`e561fa1`](https://github.com/TanStack/router/commit/e561fa1d7118e3d29267cc3b6ce1130d6581f387), [`cbbfbe3`](https://github.com/TanStack/router/commit/cbbfbe37ab1dbe328c343cb437c5660769cc9f26), [`a1c8d1a`](https://github.com/TanStack/router/commit/a1c8d1aa759c227eae9601a030321ac4c53c24bd), [`cbbfbe3`](https://github.com/TanStack/router/commit/cbbfbe37ab1dbe328c343cb437c5660769cc9f26), [`a0b2ad9`](https://github.com/TanStack/router/commit/a0b2ad99aee64af08d16b0e4ff26b3ba42a99f0a), [`1ca361b`](https://github.com/TanStack/router/commit/1ca361ba52a627d2f76ab33323bd83d1d0aa65a3)]:
  - @tanstack/router-core@1.171.31
  - @tanstack/start-storage-context@1.167.33

## 1.170.30

### Patch Changes

- Updated dependencies [[`d76a332`](https://github.com/TanStack/router/commit/d76a33284bc0668f7af4c972a6d32bd0f42b22a6), [`b747fb8`](https://github.com/TanStack/router/commit/b747fb8891b3347b1ffdfe0fa81e7d15049cb776), [`6cfb1e8`](https://github.com/TanStack/router/commit/6cfb1e8b564be282584765352250bf61747895ed), [`700a714`](https://github.com/TanStack/router/commit/700a714c5fb64199b4edfaa3273d230c9894e274), [`700a714`](https://github.com/TanStack/router/commit/700a714c5fb64199b4edfaa3273d230c9894e274), [`7e349c3`](https://github.com/TanStack/router/commit/7e349c3071ef7a346698d320fc0989998ad55734), [`873c830`](https://github.com/TanStack/router/commit/873c830ccb2610a864ee697250e10fcc99772ffa), [`7e349c3`](https://github.com/TanStack/router/commit/7e349c3071ef7a346698d320fc0989998ad55734), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef), [`e9396c9`](https://github.com/TanStack/router/commit/e9396c928945d1dd6fd3f3bd8052143794f688b5), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef), [`f151ab0`](https://github.com/TanStack/router/commit/f151ab018eede64ae849b77e68f3cdf31cb95cc5), [`bc57fa3`](https://github.com/TanStack/router/commit/bc57fa3f12450cf34c731450947c7c8f1ea05e58), [`9872d2a`](https://github.com/TanStack/router/commit/9872d2ac39fc05f4ef6566c0b421f71ceb115244), [`d76a332`](https://github.com/TanStack/router/commit/d76a33284bc0668f7af4c972a6d32bd0f42b22a6), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef), [`7e349c3`](https://github.com/TanStack/router/commit/7e349c3071ef7a346698d320fc0989998ad55734), [`9448caa`](https://github.com/TanStack/router/commit/9448caa03a89076b9770631c356c0cc502802c09), [`e9396c9`](https://github.com/TanStack/router/commit/e9396c928945d1dd6fd3f3bd8052143794f688b5), [`700a714`](https://github.com/TanStack/router/commit/700a714c5fb64199b4edfaa3273d230c9894e274), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef)]:
  - @tanstack/router-core@1.171.30
  - @tanstack/start-storage-context@1.167.32

## 1.170.29

### Patch Changes

- Updated dependencies [[`f9836f1`](https://github.com/TanStack/router/commit/f9836f16f0e25b0a8495f5e01e3f303b1cbc8725), [`9c1871c`](https://github.com/TanStack/router/commit/9c1871ccc88bc1157186b8b460941a304ec740b8), [`9871c06`](https://github.com/TanStack/router/commit/9871c0625806001d6bf373524821a00303438a91), [`0654c0a`](https://github.com/TanStack/router/commit/0654c0a1a427db24d9af13c1d6ad1217a588c0c9)]:
  - @tanstack/router-core@1.171.29
  - @tanstack/start-storage-context@1.167.31

## 1.170.28

### Patch Changes

- Updated dependencies [[`edf0e16`](https://github.com/TanStack/router/commit/edf0e16ebfe82ec6e8f68f403a1fda8de9e28889), [`2f20c00`](https://github.com/TanStack/router/commit/2f20c00224c5ba63467551914e0c37012588c4c2), [`28a5e45`](https://github.com/TanStack/router/commit/28a5e4504e4ea5cb1480667a4bea2588a53e110f), [`08eff50`](https://github.com/TanStack/router/commit/08eff50c447a154a3373909009e9e4375cea17ce), [`216c0c4`](https://github.com/TanStack/router/commit/216c0c48036fd1a33163b70dcabfed2b893808b0), [`2f91503`](https://github.com/TanStack/router/commit/2f9150309bc472f4a75cbe98adcdb50c76b12c7a), [`f0b5eda`](https://github.com/TanStack/router/commit/f0b5eda544606686a8a8d675a686ca1366428b96), [`50eafca`](https://github.com/TanStack/router/commit/50eafcaebbbedb6fde3b2816de7a0ace8cde4832), [`0497cae`](https://github.com/TanStack/router/commit/0497caeef3ff7e1c1c6080eca38bca24e7ec320b), [`ee28348`](https://github.com/TanStack/router/commit/ee283480dfa51150a2e0b096a6eff94a89ff8b3f), [`c18e690`](https://github.com/TanStack/router/commit/c18e69081475a7c98f9d40bd0fe6da78ccb84598)]:
  - @tanstack/router-core@1.171.28
  - @tanstack/start-storage-context@1.167.30

## 1.170.27

### Patch Changes

- Updated dependencies [[`fa65287`](https://github.com/TanStack/router/commit/fa652872812c9433ba8b9d9a285e51b535e7367c), [`cb281d7`](https://github.com/TanStack/router/commit/cb281d70c1f5fe780f9d07bc500ea3a284a4e04b)]:
  - @tanstack/router-core@1.171.27
  - @tanstack/start-storage-context@1.167.29

## 1.170.26

### Patch Changes

- Updated dependencies [[`3e016ac`](https://github.com/TanStack/router/commit/3e016ac84ffec8119f0c25cfdd1fb17e5292bd34)]:
  - @tanstack/router-core@1.171.26
  - @tanstack/start-storage-context@1.167.28

## 1.170.25

### Patch Changes

- Updated dependencies [[`5d3785d`](https://github.com/TanStack/router/commit/5d3785dcc366b66b1c261b5d01e66af778ff1175), [`63d2cc9`](https://github.com/TanStack/router/commit/63d2cc9155ff5374112f7d067d0b278bafeb8486)]:
  - @tanstack/router-core@1.171.25
  - @tanstack/start-storage-context@1.167.27

## 1.170.24

### Patch Changes

- Updated dependencies [[`4c89b15`](https://github.com/TanStack/router/commit/4c89b15dd2b46491ee5e57985559bae8e31d62c2), [`cf6ab17`](https://github.com/TanStack/router/commit/cf6ab178b39e7628bf784759f384e0f4230e6d9e), [`bdaf73a`](https://github.com/TanStack/router/commit/bdaf73a4063ee2b02e3c9cc105ad10ce82a5a0ff)]:
  - @tanstack/router-core@1.171.24
  - @tanstack/start-storage-context@1.167.26

## 1.170.23

### Patch Changes

- Updated dependencies [[`31882c7`](https://github.com/TanStack/router/commit/31882c7fa87debef236228831655cb112c20ce90)]:
  - @tanstack/router-core@1.171.23
  - @tanstack/start-storage-context@1.167.25

## 1.170.22

### Patch Changes

- Updated dependencies [[`7e93431`](https://github.com/TanStack/router/commit/7e93431ae9ff58c91c3c5ca10ffcb8414c1d0b13)]:
  - @tanstack/router-core@1.171.22
  - @tanstack/start-storage-context@1.167.24

## 1.170.21

### Patch Changes

- Updated dependencies [[`51138a8`](https://github.com/TanStack/router/commit/51138a824cea053738f125c4c95073bd6286ff05)]:
  - @tanstack/router-core@1.171.21
  - @tanstack/start-storage-context@1.167.23

## 1.170.20

### Patch Changes

- [#8009](https://github.com/TanStack/router/pull/8009) [`c59788c`](https://github.com/TanStack/router/commit/c59788ca20f2d2e7f264a859ebe01b7646ba3154) - perf: drop consumed chunks from the client frame decoder buffer with an O(1) head pointer instead of `Array.prototype.shift()` (O(n)). The previous approach degraded to O(n^2) when a single large frame (e.g. a big `RawStream` payload) was assembled from many small network reads.

- Updated dependencies [[`44a8c3e`](https://github.com/TanStack/router/commit/44a8c3e1d2af305064b2363d97fc7847c6f1a246), [`5253e70`](https://github.com/TanStack/router/commit/5253e70db2083d68a788fb7c9a043bb0c5518f2a)]:
  - @tanstack/router-core@1.171.20
  - @tanstack/start-storage-context@1.167.22

## 1.170.19

### Patch Changes

- [#7978](https://github.com/TanStack/router/pull/7978) [`2fbc99f`](https://github.com/TanStack/router/commit/2fbc99f2c262b057cb957e6ebba1ee073c655186) - compact private frame decoder result keys

- [#7980](https://github.com/TanStack/router/pull/7980) [`6bede65`](https://github.com/TanStack/router/commit/6bede65d7074dcd83455151b66b4574268bc782c) - compact deferred hydration private state

## 1.170.18

### Patch Changes

- Updated dependencies [[`ea3a665`](https://github.com/TanStack/router/commit/ea3a665d81cbb5074c2d77ec953255ab534e7db9)]:
  - @tanstack/router-core@1.171.19
  - @tanstack/start-storage-context@1.167.21

## 1.170.17

### Patch Changes

- [#7985](https://github.com/TanStack/router/pull/7985) [`9cac62a`](https://github.com/TanStack/router/commit/9cac62a5c7f99ef070991ea6f1fa7e42c746d46b) - perf: compact private bundle boundaries- [#7975](https://github.com/TanStack/router/issues/7975)

- Updated dependencies [[`84db4a8`](https://github.com/TanStack/router/commit/84db4a842311df3f7e58073f6f12aaf371aeb5c7), [`9cac62a`](https://github.com/TanStack/router/commit/9cac62a5c7f99ef070991ea6f1fa7e42c746d46b), [`6aefb33`](https://github.com/TanStack/router/commit/6aefb3392595a07a93f89301d7b5e3558ff9190c)]:
  - @tanstack/router-core@1.171.18
  - @tanstack/start-storage-context@1.167.20

## 1.170.16

### Patch Changes

- [#7962](https://github.com/TanStack/router/pull/7962) [`b2908c6`](https://github.com/TanStack/router/commit/b2908c642ac09aa08e6d965d2a820d7186e42fd5) - Update Seroval dependencies to version 1.6.2.

- Updated dependencies [[`b2908c6`](https://github.com/TanStack/router/commit/b2908c642ac09aa08e6d965d2a820d7186e42fd5)]:
  - @tanstack/router-core@1.171.17
  - @tanstack/start-storage-context@1.167.19

## 1.170.15

### Patch Changes

- Updated dependencies [[`45c4ad8`](https://github.com/TanStack/router/commit/45c4ad8d629e291fab70c37900525449e415ffcd)]:
  - @tanstack/router-core@1.171.16
  - @tanstack/start-storage-context@1.167.18

## 1.170.14

### Patch Changes

- Updated dependencies [[`e2dd204`](https://github.com/TanStack/router/commit/e2dd2049cb42eb219d3b447b8605066d19d9c1fa)]:
  - @tanstack/router-core@1.171.15
  - @tanstack/start-storage-context@1.167.17

## 1.170.13

### Patch Changes

- [#7662](https://github.com/TanStack/router/pull/7662) [`ba52d2b`](https://github.com/TanStack/router/commit/ba52d2b8f9e95d6becd1be14c020b35f3231e02c) - perf: zero-copy frame payload extraction in the client frame decoder. When a frame's bytes are fully contained in the first buffered chunk (the common case), return a subarray view instead of allocating a new buffer and copying. This is on the hot path for decoding streamed server-function responses and `RawStream` payloads.

- Updated dependencies [[`9809a06`](https://github.com/TanStack/router/commit/9809a0619d4ed3fe8c2a393af5b9eca4b6c7695b)]:
  - @tanstack/router-core@1.171.14
  - @tanstack/start-storage-context@1.167.16

## 1.170.12

### Patch Changes

- [#7566](https://github.com/TanStack/router/pull/7566) [`9bebf8d`](https://github.com/TanStack/router/commit/9bebf8dc9f2bf74b680c065a5aa63d03b9622825) - Add `validator()` as the canonical server function and middleware validator method. Deprecate `inputValidator()` and emit compiler warnings for remaining uses.

## 1.170.11

### Patch Changes

- Updated dependencies [[`776d8ef`](https://github.com/TanStack/router/commit/776d8ef283e5bd9ffe97d43bc3a7f58064cd7e03)]:
  - @tanstack/router-core@1.171.13
  - @tanstack/start-storage-context@1.167.15

## 1.170.10

### Patch Changes

- Updated dependencies [[`df1076c`](https://github.com/TanStack/router/commit/df1076c03ae5a51ab384bebd4d6afda20fb6f107)]:
  - @tanstack/router-core@1.171.12
  - @tanstack/start-storage-context@1.167.14

## 1.170.9

### Patch Changes

- Updated dependencies [[`ac10815`](https://github.com/TanStack/router/commit/ac10815f387d25b15163ff711b4049e8f8482d01)]:
  - @tanstack/router-core@1.171.11
  - @tanstack/start-storage-context@1.167.13

## 1.170.8

### Patch Changes

- Updated dependencies [[`2cca73c`](https://github.com/TanStack/router/commit/2cca73c92262ffd96dac4e283c9f69fb37f4b43a), [`7a83e67`](https://github.com/TanStack/router/commit/7a83e67e6596fbef21cb0a88a7127f5935bed2ba), [`76b3d3b`](https://github.com/TanStack/router/commit/76b3d3b24522bd3d1d216674c441252c9b8f184c)]:
  - @tanstack/router-core@1.171.10
  - @tanstack/start-storage-context@1.167.12

## 1.170.7

### Patch Changes

- Updated dependencies [[`b4cd5af`](https://github.com/TanStack/router/commit/b4cd5af8d0f9d4aaa2d29095e6a261b9181bc778)]:
  - @tanstack/router-core@1.171.9
  - @tanstack/start-storage-context@1.167.11

## 1.170.6

### Patch Changes

- Updated dependencies [[`2f53749`](https://github.com/TanStack/router/commit/2f5374945e2138559a51464f45a5152eae67e1dd)]:
  - @tanstack/router-core@1.171.8
  - @tanstack/start-storage-context@1.167.10

## 1.170.5

### Patch Changes

- Updated dependencies [[`d1997b6`](https://github.com/TanStack/router/commit/d1997b66d7c24c1d64772bb8bab5caf9c6d9cc48)]:
  - @tanstack/router-core@1.171.7
  - @tanstack/start-storage-context@1.167.9

## 1.170.4

### Patch Changes

- Fix serialization adapter module resolution in TanStack Start. Vite dev now uses clean runtime-specific virtual module IDs instead of browser requests containing encoded null-byte virtual IDs, which avoids reverse proxy failures. When no serialization adapters are configured, Vite and Rsbuild now resolve `#tanstack-start-plugin-adapters` through the package empty-adapter fallback. ([#7484](https://github.com/TanStack/router/pull/7484))

## 1.170.3

### Patch Changes

- Updated dependencies [[`51a97a1`](https://github.com/TanStack/router/commit/51a97a167fb3ef1b8ca70fbb63db635158f43509)]:
  - @tanstack/router-core@1.171.6
  - @tanstack/start-storage-context@1.167.8

## 1.170.2

### Patch Changes

- Updated dependencies [[`5268ba4`](https://github.com/TanStack/router/commit/5268ba4566233ea58880df85f167ad0401a93a46)]:
  - @tanstack/router-core@1.171.5
  - @tanstack/start-storage-context@1.167.7

## 1.170.1

### Patch Changes

- Updated dependencies [[`0300f87`](https://github.com/TanStack/router/commit/0300f87ec5a7f878ffbe0b181acf84cba9139960), [`0300f87`](https://github.com/TanStack/router/commit/0300f87ec5a7f878ffbe0b181acf84cba9139960)]:
  - @tanstack/router-core@1.171.4
  - @tanstack/start-storage-context@1.167.6

## 1.170.0

### Minor Changes

- Add deferred Hydrate boundary support for TanStack Start. ([#7362](https://github.com/TanStack/router/pull/7362))

  Hydrate boundaries can now be code-split by the Start compiler, preload their generated client chunks, preserve server-rendered fallback HTML, and replay interaction-triggered events after hydration. The compiler integration now uses a Start-owned compiler plugin for Hydrate virtual modules across Vite and Rsbuild, with dev invalidation for generated virtual modules.

  Shared AST utilities used by the router code-splitter and Hydrate virtual modules were moved into `@tanstack/router-utils` so both pipelines can retain referenced top-level declarations, unwrap local exports, and let dead-code elimination remove unused route module code.

### Patch Changes

- Updated dependencies [[`5fa9e55`](https://github.com/TanStack/router/commit/5fa9e555f3a2edb5e45586623e6bcbfa7f7c7a6b)]:
  - @tanstack/router-core@1.171.3
  - @tanstack/start-storage-context@1.167.5

## 1.169.4

### Patch Changes

- Updated dependencies [[`b60eb36`](https://github.com/TanStack/router/commit/b60eb36e59e8a468ee0742cbcf7f47aca1ff1c67)]:
  - @tanstack/router-core@1.171.2
  - @tanstack/start-storage-context@1.167.4

## 1.169.3

### Patch Changes

- Updated dependencies [[`d9cf933`](https://github.com/TanStack/router/commit/d9cf9331b83fcbd2abfee75d839d862f9bb18e6b)]:
  - @tanstack/router-core@1.171.1
  - @tanstack/start-storage-context@1.167.3

## 1.169.2

### Patch Changes

- Updated dependencies [[`d533f87`](https://github.com/TanStack/router/commit/d533f87976704098a40b48f160b37c28c8182806)]:
  - @tanstack/router-core@1.171.0
  - @tanstack/start-storage-context@1.167.2

## 1.169.1

### Patch Changes

- Updated dependencies [[`2387a2e`](https://github.com/TanStack/router/commit/2387a2eea0683004cc400b9f71bed5944eb60110)]:
  - @tanstack/router-core@1.170.1
  - @tanstack/start-storage-context@1.167.1

## 1.169.0

### Minor Changes

- Clean minor bump, fresh start ([#7395](https://github.com/TanStack/router/pull/7395))

### Patch Changes

- Updated dependencies [[`b1c061a`](https://github.com/TanStack/router/commit/b1c061aff9185cdf5fdc08c0136382a9dce0302f), [`201e150`](https://github.com/TanStack/router/commit/201e150bd1412bae2faa9ce53f0fefcb7574ac14), [`5ae2ae5`](https://github.com/TanStack/router/commit/5ae2ae5e0f8ce32e02667a482ea9be52a6150240)]:
  - @tanstack/router-core@1.170.0
  - @tanstack/start-fn-stubs@1.162.0
  - @tanstack/start-storage-context@1.167.0

## 1.168.2

### Patch Changes

- Update seroval dependencies to version 1.5.4. ([#7340](https://github.com/TanStack/router/pull/7340))

- Updated dependencies [[`35e88f0`](https://github.com/TanStack/router/commit/35e88f04996d71019a1868b7b06ecb4ddbc9df9e)]:
  - @tanstack/router-core@1.169.2
  - @tanstack/start-storage-context@1.166.35

## 1.168.1

### Patch Changes

- Updated dependencies [[`4a1e63f`](https://github.com/TanStack/router/commit/4a1e63f1d1230b1ed8234609acad4639d8982c13)]:
  - @tanstack/router-core@1.169.1
  - @tanstack/start-storage-context@1.166.34

## 1.168.0

### Minor Changes

- Add a `strict` option to `createServerFn` for type-level server function serialization checks. Use `strict: false` to opt out for input and output values, or `strict: { output: false }` to opt out for return values only. ([#7277](https://github.com/TanStack/router/pull/7277))

## 1.167.22

### Patch Changes

- Updated dependencies [[`c992495`](https://github.com/TanStack/router/commit/c992495bf4010ff4c3597bb1f3b1ba02594e857e)]:
  - @tanstack/router-core@1.169.0
  - @tanstack/start-storage-context@1.166.33

## 1.167.21

### Patch Changes

- Updated dependencies [[`b5c4183`](https://github.com/TanStack/router/commit/b5c4183ab8b44be8a75647b7f7b588ad7c146ece)]:
  - @tanstack/router-core@1.168.18
  - @tanstack/start-storage-context@1.166.32

## 1.167.20

### Patch Changes

- Updated dependencies [[`493148b`](https://github.com/TanStack/router/commit/493148bc5378b7f9de1544d87f6aaa425c12eb34)]:
  - @tanstack/router-core@1.168.17
  - @tanstack/start-storage-context@1.166.31

## 1.167.19

### Patch Changes

- refactor(start-client-core): use a more explicit typing to `CustomFetch` type ([#7258](https://github.com/TanStack/router/pull/7258))

## 1.167.18

### Patch Changes

- Updated dependencies [[`4d864ee`](https://github.com/TanStack/router/commit/4d864eebbd184265eabb563d326ab409c93feb17)]:
  - @tanstack/router-core@1.168.16
  - @tanstack/start-storage-context@1.166.30

## 1.167.17

### Patch Changes

- Updated dependencies [[`16f6892`](https://github.com/TanStack/router/commit/16f6892d6b7ceadf606677c5a40e743f29163aa6)]:
  - @tanstack/router-core@1.168.15
  - @tanstack/start-storage-context@1.166.29

## 1.167.16

### Patch Changes

- Updated dependencies [[`0e2c900`](https://github.com/TanStack/router/commit/0e2c9003c18ae07c09969189c028f277ea562a7a)]:
  - @tanstack/router-core@1.168.14
  - @tanstack/start-storage-context@1.166.28

## 1.167.15

### Patch Changes

- Updated dependencies [[`812792f`](https://github.com/TanStack/router/commit/812792fbda3caf97b300770855cf5641252f413b)]:
  - @tanstack/router-core@1.168.13
  - @tanstack/start-storage-context@1.166.27

## 1.167.14

### Patch Changes

- Updated dependencies [[`8ec9ca9`](https://github.com/TanStack/router/commit/8ec9ca97b472779de878c2a6510f21deb24d386c)]:
  - @tanstack/router-core@1.168.12
  - @tanstack/start-storage-context@1.166.26

## 1.167.13

### Patch Changes

- Updated dependencies [[`6355bb7`](https://github.com/TanStack/router/commit/6355bb75f7637ba77f06a923c18fdaf37720bb48)]:
  - @tanstack/router-core@1.168.11
  - @tanstack/start-storage-context@1.166.25

## 1.167.12

### Patch Changes

- migrate createStore > createAtom for simpler API ([#7150](https://github.com/TanStack/router/pull/7150))

- Updated dependencies [[`459057c`](https://github.com/TanStack/router/commit/459057cd2d90cff20d20e51d4964b0a8c950555e)]:
  - @tanstack/router-core@1.168.10
  - @tanstack/start-storage-context@1.166.24

## 1.167.11

### Patch Changes

- fix publishing ([`f8ac427`](https://github.com/TanStack/router/commit/f8ac427000c3fec99225926e72f9f2fc7a37231f))

## 1.167.10

### Patch Changes

- Ensure request middleware context wins over colliding client-provided context in server function execution paths, including SSR, GET, and FormData requests. ([#7135](https://github.com/TanStack/router/pull/7135))

## 1.167.9

### Patch Changes

- Updated dependencies [[`796406d`](https://github.com/TanStack/router/commit/796406da66cfb12b518bb3ca326c9d541368fb06)]:
  - @tanstack/router-core@1.168.9
  - @tanstack/start-storage-context@1.166.23

## 1.167.8

### Patch Changes

- Updated dependencies [[`2d1ec86`](https://github.com/TanStack/router/commit/2d1ec865a446926f7db6e29dbbde82d265de6d36)]:
  - @tanstack/router-core@1.168.8
  - @tanstack/start-storage-context@1.166.22

## 1.167.7

### Patch Changes

- Updated dependencies [[`6ee0e79`](https://github.com/TanStack/router/commit/6ee0e795b085651beb2f1ac6503cdbd7eaffedd1)]:
  - @tanstack/router-core@1.168.7
  - @tanstack/start-storage-context@1.166.21

## 1.167.6

### Patch Changes

- Updated dependencies [[`42c3f3b`](https://github.com/TanStack/router/commit/42c3f3b3a3a478fd6d6894310ef94b2d23794b8e)]:
  - @tanstack/router-core@1.168.6
  - @tanstack/start-storage-context@1.166.20

## 1.167.5

### Patch Changes

- Updated dependencies [[`cf5f554`](https://github.com/TanStack/router/commit/cf5f5542476137a81515099ad740747e84512f9a)]:
  - @tanstack/router-core@1.168.5
  - @tanstack/start-storage-context@1.166.19

## 1.167.4

### Patch Changes

- Updated dependencies [[`71a8b68`](https://github.com/TanStack/router/commit/71a8b684c87c37fd4a033d99f5ba4a05c7a179f5)]:
  - @tanstack/router-core@1.168.4
  - @tanstack/start-storage-context@1.166.18

## 1.167.3

### Patch Changes

- Updated dependencies [[`d81d21a`](https://github.com/TanStack/router/commit/d81d21ad05c9401bf54b24acd29401e1e4fd624c)]:
  - @tanstack/router-core@1.168.3
  - @tanstack/start-storage-context@1.166.17

## 1.167.2

### Patch Changes

- Replace tiny-invariant and tiny-warning with in-house solution for bundle-size ([#7007](https://github.com/TanStack/router/pull/7007))

- Updated dependencies [[`c9e1855`](https://github.com/TanStack/router/commit/c9e18555f3a5531e96de8f574cfca9edcdb18e5c)]:
  - @tanstack/router-core@1.168.2
  - @tanstack/start-storage-context@1.166.16

## 1.167.1

### Patch Changes

- Updated dependencies [[`91cc628`](https://github.com/TanStack/router/commit/91cc62899b75ca920fe83c5ee7f3dbb5c71a523f)]:
  - @tanstack/router-core@1.168.1
  - @tanstack/start-storage-context@1.166.15

## 1.167.0

### Minor Changes

- remove pendingMatches, cachedMatches ([#6704](https://github.com/TanStack/router/pull/6704))
  move to signal-based reactivity
  solid uses its own native signals

### Patch Changes

- Updated dependencies [[`0545239`](https://github.com/TanStack/router/commit/054523900b2ee19308e5a88417dadfc6923afe30)]:
  - @tanstack/router-core@1.168.0
  - @tanstack/start-storage-context@1.166.14

## 1.166.13

### Patch Changes

- Updated dependencies [[`5ff4f0b`](https://github.com/TanStack/router/commit/5ff4f0b8dce1fac2bb0b0bfe2684fc677a8ee505)]:
  - @tanstack/router-core@1.167.5
  - @tanstack/start-storage-context@1.166.13

## 1.166.12

### Patch Changes

- Add @tanstack/intent AI agent skills and CLI entry points for Router and Start packages ([#6866](https://github.com/TanStack/router/pull/6866))

- Updated dependencies [[`940151c`](https://github.com/TanStack/router/commit/940151cbed0c76c92a5cf196c0905b17a956ca7e)]:
  - @tanstack/router-core@1.167.4
  - @tanstack/start-storage-context@1.166.12

## 1.166.11

### Patch Changes

- Updated dependencies [[`32fcba7`](https://github.com/TanStack/router/commit/32fcba7b044b03f5901308b870f70b0b4910c220)]:
  - @tanstack/router-core@1.167.3
  - @tanstack/start-storage-context@1.166.11

## 1.166.10

### Patch Changes

- build: update to vite-config 5.x (rolldown) ([#6926](https://github.com/TanStack/router/pull/6926))

- Updated dependencies [[`838b0eb`](https://github.com/TanStack/router/commit/838b0eb9a8bbbb987a0a6972c1446e01423bbd7b)]:
  - @tanstack/router-core@1.167.2
  - @tanstack/start-fn-stubs@1.161.6
  - @tanstack/start-storage-context@1.166.10

## 1.166.9

### Patch Changes

- fix: build with @tanstack/vite-config 0.4.3 ([#6923](https://github.com/TanStack/router/pull/6923))

- Updated dependencies [[`ef9b241`](https://github.com/TanStack/router/commit/ef9b241f3cfe95cee40daa96da669f0ffd4a971a)]:
  - @tanstack/start-storage-context@1.166.9
  - @tanstack/start-fn-stubs@1.161.5
  - @tanstack/router-core@1.167.1

## 1.166.8

### Patch Changes

- Updated dependencies [[`6f297a2`](https://github.com/TanStack/router/commit/6f297a249424c0fd1c1a56aa4fc12c8217be7b6a)]:
  - @tanstack/router-core@1.167.0
  - @tanstack/start-storage-context@1.166.8
