# @tanstack/solid-start-server

## 1.167.45

### Patch Changes

- Updated dependencies [[`dfe3dea`](https://github.com/TanStack/router/commit/dfe3dea88a28400db1677111e2b15ae7914782c2), [`efc2042`](https://github.com/TanStack/router/commit/efc2042c2d02a9780c3e7efe81f123d066a869eb), [`efc2042`](https://github.com/TanStack/router/commit/efc2042c2d02a9780c3e7efe81f123d066a869eb), [`dfe3dea`](https://github.com/TanStack/router/commit/dfe3dea88a28400db1677111e2b15ae7914782c2), [`d35aab4`](https://github.com/TanStack/router/commit/d35aab425b07b46e222a507c0f0239644669757b), [`e7ab157`](https://github.com/TanStack/router/commit/e7ab1570ec3ba461cd1ef2c75d5fab2011cf1043), [`efc2042`](https://github.com/TanStack/router/commit/efc2042c2d02a9780c3e7efe81f123d066a869eb), [`663282b`](https://github.com/TanStack/router/commit/663282b0ebbc494aee3595ed95867ee29d01938e)]:
  - @tanstack/router-core@1.171.35
  - @tanstack/solid-router@1.170.39
  - @tanstack/start-server-core@1.169.40

## 1.167.44

### Patch Changes

- Updated dependencies [[`d521abd`](https://github.com/TanStack/router/commit/d521abd71c69f1ff010bb3def4d417cb5fa058cb)]:
  - @tanstack/router-core@1.171.34
  - @tanstack/start-server-core@1.169.39
  - @tanstack/solid-router@1.170.38

## 1.167.43

### Patch Changes

- Updated dependencies [[`f5ffd38`](https://github.com/TanStack/router/commit/f5ffd3884ba26778a2a8ce53b379a5bded231676), [`488d046`](https://github.com/TanStack/router/commit/488d046a907d330429e2c807ef95326dad87480f), [`e81845f`](https://github.com/TanStack/router/commit/e81845ff1e4fc66d4e4a87f086be65906f7adb94), [`0c1b5e3`](https://github.com/TanStack/router/commit/0c1b5e38de71b7e81bbf1fd81c73ee0cd68ffe47), [`3cdd1af`](https://github.com/TanStack/router/commit/3cdd1af04b3e2d6f777797ee7bddf285318dd9d2)]:
  - @tanstack/solid-router@1.170.37
  - @tanstack/router-core@1.171.33
  - @tanstack/start-server-core@1.169.38

## 1.167.42

### Patch Changes

- Updated dependencies [[`cecae54`](https://github.com/TanStack/router/commit/cecae5440b8edaea77c5448fe3d74bbd20fe10a4), [`0103578`](https://github.com/TanStack/router/commit/01035782e53af9b929c784b94ddd64b95efb89c7), [`ce10dcd`](https://github.com/TanStack/router/commit/ce10dcd4d9d3d23738744e453205aad5c6dbd716), [`84936cc`](https://github.com/TanStack/router/commit/84936cc04530bba11059c57b293a794922bbc5aa), [`bbd2336`](https://github.com/TanStack/router/commit/bbd2336b8446de3f7dd85070895e7cf43980183e)]:
  - @tanstack/router-core@1.171.32
  - @tanstack/solid-router@1.170.36
  - @tanstack/start-server-core@1.169.37

## 1.167.41

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
  - @tanstack/solid-router@1.170.35
  - @tanstack/start-server-core@1.169.36

## 1.167.40

### Patch Changes

- Updated dependencies [[`d76a332`](https://github.com/TanStack/router/commit/d76a33284bc0668f7af4c972a6d32bd0f42b22a6), [`b747fb8`](https://github.com/TanStack/router/commit/b747fb8891b3347b1ffdfe0fa81e7d15049cb776), [`6cfb1e8`](https://github.com/TanStack/router/commit/6cfb1e8b564be282584765352250bf61747895ed), [`700a714`](https://github.com/TanStack/router/commit/700a714c5fb64199b4edfaa3273d230c9894e274), [`700a714`](https://github.com/TanStack/router/commit/700a714c5fb64199b4edfaa3273d230c9894e274), [`9b2adaf`](https://github.com/TanStack/router/commit/9b2adaf8c3fca905f156c42f6a4fe17a787afcc8), [`7e349c3`](https://github.com/TanStack/router/commit/7e349c3071ef7a346698d320fc0989998ad55734), [`9b2adaf`](https://github.com/TanStack/router/commit/9b2adaf8c3fca905f156c42f6a4fe17a787afcc8), [`873c830`](https://github.com/TanStack/router/commit/873c830ccb2610a864ee697250e10fcc99772ffa), [`7e349c3`](https://github.com/TanStack/router/commit/7e349c3071ef7a346698d320fc0989998ad55734), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef), [`e9396c9`](https://github.com/TanStack/router/commit/e9396c928945d1dd6fd3f3bd8052143794f688b5), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef), [`f151ab0`](https://github.com/TanStack/router/commit/f151ab018eede64ae849b77e68f3cdf31cb95cc5), [`bc57fa3`](https://github.com/TanStack/router/commit/bc57fa3f12450cf34c731450947c7c8f1ea05e58), [`9872d2a`](https://github.com/TanStack/router/commit/9872d2ac39fc05f4ef6566c0b421f71ceb115244), [`9b2adaf`](https://github.com/TanStack/router/commit/9b2adaf8c3fca905f156c42f6a4fe17a787afcc8), [`d76a332`](https://github.com/TanStack/router/commit/d76a33284bc0668f7af4c972a6d32bd0f42b22a6), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef), [`7e349c3`](https://github.com/TanStack/router/commit/7e349c3071ef7a346698d320fc0989998ad55734), [`9448caa`](https://github.com/TanStack/router/commit/9448caa03a89076b9770631c356c0cc502802c09), [`e9396c9`](https://github.com/TanStack/router/commit/e9396c928945d1dd6fd3f3bd8052143794f688b5), [`700a714`](https://github.com/TanStack/router/commit/700a714c5fb64199b4edfaa3273d230c9894e274), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef), [`634da91`](https://github.com/TanStack/router/commit/634da9176e16fa8aa49af459bbb054fcae7d85ef)]:
  - @tanstack/router-core@1.171.30
  - @tanstack/solid-router@1.170.34
  - @tanstack/start-server-core@1.169.35

## 1.167.39

### Patch Changes

- Updated dependencies [[`b1c9219`](https://github.com/TanStack/router/commit/b1c92194397e57cecfab72de70e2dd8064a4f6d5), [`76239a3`](https://github.com/TanStack/router/commit/76239a34b732ca19d1b16d42efb83824b1de1c69), [`d914b08`](https://github.com/TanStack/router/commit/d914b085bb4bf29ec18a531201e377c10681b661)]:
  - @tanstack/solid-router@1.170.33
  - @tanstack/start-server-core@1.169.34

## 1.167.38

### Patch Changes

- Updated dependencies [[`f9836f1`](https://github.com/TanStack/router/commit/f9836f16f0e25b0a8495f5e01e3f303b1cbc8725), [`9c1871c`](https://github.com/TanStack/router/commit/9c1871ccc88bc1157186b8b460941a304ec740b8), [`9871c06`](https://github.com/TanStack/router/commit/9871c0625806001d6bf373524821a00303438a91), [`0654c0a`](https://github.com/TanStack/router/commit/0654c0a1a427db24d9af13c1d6ad1217a588c0c9)]:
  - @tanstack/router-core@1.171.29
  - @tanstack/solid-router@1.170.32
  - @tanstack/start-server-core@1.169.33

## 1.167.37

### Patch Changes

- Updated dependencies [[`edf0e16`](https://github.com/TanStack/router/commit/edf0e16ebfe82ec6e8f68f403a1fda8de9e28889), [`2f20c00`](https://github.com/TanStack/router/commit/2f20c00224c5ba63467551914e0c37012588c4c2), [`28a5e45`](https://github.com/TanStack/router/commit/28a5e4504e4ea5cb1480667a4bea2588a53e110f), [`08eff50`](https://github.com/TanStack/router/commit/08eff50c447a154a3373909009e9e4375cea17ce), [`216c0c4`](https://github.com/TanStack/router/commit/216c0c48036fd1a33163b70dcabfed2b893808b0), [`2f91503`](https://github.com/TanStack/router/commit/2f9150309bc472f4a75cbe98adcdb50c76b12c7a), [`f0b5eda`](https://github.com/TanStack/router/commit/f0b5eda544606686a8a8d675a686ca1366428b96), [`50eafca`](https://github.com/TanStack/router/commit/50eafcaebbbedb6fde3b2816de7a0ace8cde4832), [`0497cae`](https://github.com/TanStack/router/commit/0497caeef3ff7e1c1c6080eca38bca24e7ec320b), [`0caf6b9`](https://github.com/TanStack/router/commit/0caf6b9a2b7e14b0b146c74cc27cb05c19d700a5), [`ee28348`](https://github.com/TanStack/router/commit/ee283480dfa51150a2e0b096a6eff94a89ff8b3f), [`c18e690`](https://github.com/TanStack/router/commit/c18e69081475a7c98f9d40bd0fe6da78ccb84598)]:
  - @tanstack/router-core@1.171.28
  - @tanstack/solid-router@1.170.31
  - @tanstack/start-server-core@1.169.32

## 1.167.36

### Patch Changes

- Updated dependencies [[`fa65287`](https://github.com/TanStack/router/commit/fa652872812c9433ba8b9d9a285e51b535e7367c), [`cb281d7`](https://github.com/TanStack/router/commit/cb281d70c1f5fe780f9d07bc500ea3a284a4e04b)]:
  - @tanstack/router-core@1.171.27
  - @tanstack/solid-router@1.170.30
  - @tanstack/start-server-core@1.169.31

## 1.167.35

### Patch Changes

- Updated dependencies [[`3e016ac`](https://github.com/TanStack/router/commit/3e016ac84ffec8119f0c25cfdd1fb17e5292bd34)]:
  - @tanstack/router-core@1.171.26
  - @tanstack/solid-router@1.170.29
  - @tanstack/start-server-core@1.169.30

## 1.167.34

### Patch Changes

- Updated dependencies [[`5d3785d`](https://github.com/TanStack/router/commit/5d3785dcc366b66b1c261b5d01e66af778ff1175), [`63d2cc9`](https://github.com/TanStack/router/commit/63d2cc9155ff5374112f7d067d0b278bafeb8486)]:
  - @tanstack/solid-router@1.170.28
  - @tanstack/router-core@1.171.25
  - @tanstack/start-server-core@1.169.29

## 1.167.33

### Patch Changes

- Updated dependencies [[`4c89b15`](https://github.com/TanStack/router/commit/4c89b15dd2b46491ee5e57985559bae8e31d62c2), [`cf6ab17`](https://github.com/TanStack/router/commit/cf6ab178b39e7628bf784759f384e0f4230e6d9e), [`0fdf9ff`](https://github.com/TanStack/router/commit/0fdf9ff16fc532de9fc131d18df167ebd8038720), [`bdaf73a`](https://github.com/TanStack/router/commit/bdaf73a4063ee2b02e3c9cc105ad10ce82a5a0ff)]:
  - @tanstack/router-core@1.171.24
  - @tanstack/solid-router@1.170.27
  - @tanstack/start-server-core@1.169.28

## 1.167.32

### Patch Changes

- Updated dependencies [[`31882c7`](https://github.com/TanStack/router/commit/31882c7fa87debef236228831655cb112c20ce90), [`3848503`](https://github.com/TanStack/router/commit/38485038c52ff898777cabeeeb2eaaa29c93f789)]:
  - @tanstack/router-core@1.171.23
  - @tanstack/solid-router@1.170.26
  - @tanstack/start-server-core@1.169.27

## 1.167.31

### Patch Changes

- Updated dependencies [[`7e93431`](https://github.com/TanStack/router/commit/7e93431ae9ff58c91c3c5ca10ffcb8414c1d0b13), [`f500760`](https://github.com/TanStack/router/commit/f5007607d62e932b8df19de866cdc6bddcff8db3), [`1aafca9`](https://github.com/TanStack/router/commit/1aafca9b45d24f8f0dba78e716fc9582346c6ca1), [`aa10b65`](https://github.com/TanStack/router/commit/aa10b6589eeda215f5a60ea0af95a3101d8c414e)]:
  - @tanstack/router-core@1.171.22
  - @tanstack/solid-router@1.170.25
  - @tanstack/start-server-core@1.169.26

## 1.167.30

### Patch Changes

- Updated dependencies [[`51138a8`](https://github.com/TanStack/router/commit/51138a824cea053738f125c4c95073bd6286ff05)]:
  - @tanstack/router-core@1.171.21
  - @tanstack/solid-router@1.170.24
  - @tanstack/start-server-core@1.169.25

## 1.167.29

### Patch Changes

- Updated dependencies [[`44a8c3e`](https://github.com/TanStack/router/commit/44a8c3e1d2af305064b2363d97fc7847c6f1a246), [`5253e70`](https://github.com/TanStack/router/commit/5253e70db2083d68a788fb7c9a043bb0c5518f2a)]:
  - @tanstack/router-core@1.171.20
  - @tanstack/solid-router@1.170.23
  - @tanstack/start-server-core@1.169.24

## 1.167.28

### Patch Changes

- Updated dependencies []:
  - @tanstack/start-server-core@1.169.23

## 1.167.27

### Patch Changes

- Updated dependencies [[`ea3a665`](https://github.com/TanStack/router/commit/ea3a665d81cbb5074c2d77ec953255ab534e7db9)]:
  - @tanstack/router-core@1.171.19
  - @tanstack/solid-router@1.170.22
  - @tanstack/start-server-core@1.169.22

## 1.167.26

### Patch Changes

- Updated dependencies [[`2435885`](https://github.com/TanStack/router/commit/2435885fa8b5e31c8c4b74d93920919f27316ebf), [`84db4a8`](https://github.com/TanStack/router/commit/84db4a842311df3f7e58073f6f12aaf371aeb5c7), [`9cac62a`](https://github.com/TanStack/router/commit/9cac62a5c7f99ef070991ea6f1fa7e42c746d46b), [`86bf510`](https://github.com/TanStack/router/commit/86bf510c2923afb76804223bd04afc2a809b33e7), [`6aefb33`](https://github.com/TanStack/router/commit/6aefb3392595a07a93f89301d7b5e3558ff9190c)]:
  - @tanstack/solid-router@1.170.21
  - @tanstack/router-core@1.171.18
  - @tanstack/start-server-core@1.169.21

## 1.167.25

### Patch Changes

- Updated dependencies [[`b2908c6`](https://github.com/TanStack/router/commit/b2908c642ac09aa08e6d965d2a820d7186e42fd5)]:
  - @tanstack/router-core@1.171.17
  - @tanstack/start-server-core@1.169.20
  - @tanstack/solid-router@1.170.20

## 1.167.24

### Patch Changes

- Updated dependencies [[`45c4ad8`](https://github.com/TanStack/router/commit/45c4ad8d629e291fab70c37900525449e415ffcd)]:
  - @tanstack/router-core@1.171.16
  - @tanstack/solid-router@1.170.19
  - @tanstack/start-server-core@1.169.19

## 1.167.23

### Patch Changes

- [#7944](https://github.com/TanStack/router/pull/7944) [`65f7b7f`](https://github.com/TanStack/router/commit/65f7b7f791272f2ea581a1fe0fcd43183bc01162) - Use focused server entrypoints for shared constants and handler helpers so build tooling and framework renderers do not traverse the full Start server barrel.

- Updated dependencies [[`65f7b7f`](https://github.com/TanStack/router/commit/65f7b7f791272f2ea581a1fe0fcd43183bc01162)]:
  - @tanstack/start-server-core@1.169.18

## 1.167.22

### Patch Changes

- Updated dependencies [[`e2dd204`](https://github.com/TanStack/router/commit/e2dd2049cb42eb219d3b447b8605066d19d9c1fa)]:
  - @tanstack/router-core@1.171.15
  - @tanstack/solid-router@1.170.18
  - @tanstack/start-server-core@1.169.17

## 1.167.21

### Patch Changes

- Updated dependencies [[`9809a06`](https://github.com/TanStack/router/commit/9809a0619d4ed3fe8c2a393af5b9eca4b6c7695b)]:
  - @tanstack/router-core@1.171.14
  - @tanstack/solid-router@1.170.17
  - @tanstack/start-server-core@1.169.16

## 1.167.20

### Patch Changes

- Updated dependencies [[`96eca43`](https://github.com/TanStack/router/commit/96eca43ab8ee21917a8075521bef6dcf15fc7a43), [`41e7a24`](https://github.com/TanStack/router/commit/41e7a24f693b0f58c2bef89a2b8c4d084acbd531)]:
  - @tanstack/start-server-core@1.169.15
  - @tanstack/solid-router@1.170.16

## 1.167.19

### Patch Changes

- Updated dependencies []:
  - @tanstack/start-server-core@1.169.14

## 1.167.18

### Patch Changes

- Updated dependencies [[`776d8ef`](https://github.com/TanStack/router/commit/776d8ef283e5bd9ffe97d43bc3a7f58064cd7e03)]:
  - @tanstack/router-core@1.171.13
  - @tanstack/solid-router@1.170.15
  - @tanstack/start-server-core@1.169.13

## 1.167.17

### Patch Changes

- Updated dependencies [[`df1076c`](https://github.com/TanStack/router/commit/df1076c03ae5a51ab384bebd4d6afda20fb6f107)]:
  - @tanstack/router-core@1.171.12
  - @tanstack/solid-router@1.170.14
  - @tanstack/start-server-core@1.169.12

## 1.167.16

### Patch Changes

- Updated dependencies [[`ac10815`](https://github.com/TanStack/router/commit/ac10815f387d25b15163ff711b4049e8f8482d01)]:
  - @tanstack/router-core@1.171.11
  - @tanstack/solid-router@1.170.13
  - @tanstack/start-server-core@1.169.11

## 1.167.15

### Patch Changes

- Updated dependencies [[`2cca73c`](https://github.com/TanStack/router/commit/2cca73c92262ffd96dac4e283c9f69fb37f4b43a), [`7a83e67`](https://github.com/TanStack/router/commit/7a83e67e6596fbef21cb0a88a7127f5935bed2ba), [`76b3d3b`](https://github.com/TanStack/router/commit/76b3d3b24522bd3d1d216674c441252c9b8f184c)]:
  - @tanstack/router-core@1.171.10
  - @tanstack/solid-router@1.170.12
  - @tanstack/start-server-core@1.169.10

## 1.167.14

### Patch Changes

- Updated dependencies [[`b4cd5af`](https://github.com/TanStack/router/commit/b4cd5af8d0f9d4aaa2d29095e6a261b9181bc778)]:
  - @tanstack/router-core@1.171.9
  - @tanstack/solid-router@1.170.11
  - @tanstack/start-client-core@1.170.7
  - @tanstack/start-server-core@1.169.9

## 1.167.13

### Patch Changes

- Updated dependencies [[`9cb7a00`](https://github.com/TanStack/router/commit/9cb7a003e6e5fa3706711870c7b10a5266356e3b)]:
  - @tanstack/start-server-core@1.169.8

## 1.167.12

### Patch Changes

- Updated dependencies [[`2f53749`](https://github.com/TanStack/router/commit/2f5374945e2138559a51464f45a5152eae67e1dd)]:
  - @tanstack/router-core@1.171.8
  - @tanstack/solid-router@1.170.10
  - @tanstack/start-client-core@1.170.6
  - @tanstack/start-server-core@1.169.7

## 1.167.11

### Patch Changes

- Updated dependencies [[`d1997b6`](https://github.com/TanStack/router/commit/d1997b66d7c24c1d64772bb8bab5caf9c6d9cc48)]:
  - @tanstack/start-server-core@1.169.6
  - @tanstack/solid-router@1.170.9
  - @tanstack/router-core@1.171.7
  - @tanstack/start-client-core@1.170.5

## 1.167.10

### Patch Changes

- Updated dependencies [[`9c09bca`](https://github.com/TanStack/router/commit/9c09bca59e9613e9a6fd9b7149b0737898e705d6)]:
  - @tanstack/start-server-core@1.169.5

## 1.167.9

### Patch Changes

- Updated dependencies [[`a82cec6`](https://github.com/TanStack/router/commit/a82cec69474c366b36efdb3f43c4efe8311c485a), [`d8be4f8`](https://github.com/TanStack/router/commit/d8be4f8adf912128c96b7f83e9a6c49fb24b5eed)]:
  - @tanstack/start-client-core@1.170.4
  - @tanstack/start-server-core@1.169.4

## 1.167.8

### Patch Changes

- Updated dependencies [[`51a97a1`](https://github.com/TanStack/router/commit/51a97a167fb3ef1b8ca70fbb63db635158f43509)]:
  - @tanstack/router-core@1.171.6
  - @tanstack/solid-router@1.170.8
  - @tanstack/start-server-core@1.169.3
  - @tanstack/start-client-core@1.170.3

## 1.167.7

### Patch Changes

- Updated dependencies [[`5268ba4`](https://github.com/TanStack/router/commit/5268ba4566233ea58880df85f167ad0401a93a46)]:
  - @tanstack/router-core@1.171.5
  - @tanstack/solid-router@1.170.7
  - @tanstack/start-client-core@1.170.2
  - @tanstack/start-server-core@1.169.2

## 1.167.6

### Patch Changes

- Updated dependencies [[`0300f87`](https://github.com/TanStack/router/commit/0300f87ec5a7f878ffbe0b181acf84cba9139960), [`0300f87`](https://github.com/TanStack/router/commit/0300f87ec5a7f878ffbe0b181acf84cba9139960)]:
  - @tanstack/router-core@1.171.4
  - @tanstack/solid-router@1.170.6
  - @tanstack/start-client-core@1.170.1
  - @tanstack/start-server-core@1.169.1

## 1.167.5

### Patch Changes

- Updated dependencies [[`5fa9e55`](https://github.com/TanStack/router/commit/5fa9e555f3a2edb5e45586623e6bcbfa7f7c7a6b)]:
  - @tanstack/start-client-core@1.170.0
  - @tanstack/start-server-core@1.169.0
  - @tanstack/router-core@1.171.3
  - @tanstack/solid-router@1.170.5

## 1.167.4

### Patch Changes

- Updated dependencies [[`b60eb36`](https://github.com/TanStack/router/commit/b60eb36e59e8a468ee0742cbcf7f47aca1ff1c67)]:
  - @tanstack/router-core@1.171.2
  - @tanstack/solid-router@1.170.4
  - @tanstack/start-client-core@1.169.4
  - @tanstack/start-server-core@1.168.4

## 1.167.3

### Patch Changes

- Updated dependencies [[`d9cf933`](https://github.com/TanStack/router/commit/d9cf9331b83fcbd2abfee75d839d862f9bb18e6b)]:
  - @tanstack/router-core@1.171.1
  - @tanstack/solid-router@1.170.3
  - @tanstack/start-client-core@1.169.3
  - @tanstack/start-server-core@1.168.3

## 1.167.2

### Patch Changes

- Updated dependencies [[`d533f87`](https://github.com/TanStack/router/commit/d533f87976704098a40b48f160b37c28c8182806)]:
  - @tanstack/router-core@1.171.0
  - @tanstack/solid-router@1.170.2
  - @tanstack/start-client-core@1.169.2
  - @tanstack/start-server-core@1.168.2

## 1.167.1

### Patch Changes

- Updated dependencies [[`2387a2e`](https://github.com/TanStack/router/commit/2387a2eea0683004cc400b9f71bed5944eb60110)]:
  - @tanstack/router-core@1.170.1
  - @tanstack/start-server-core@1.168.1
  - @tanstack/solid-router@1.170.1
  - @tanstack/start-client-core@1.169.1

## 1.167.0

### Minor Changes

- Clean minor bump, fresh start ([#7395](https://github.com/TanStack/router/pull/7395))

### Patch Changes

- Updated dependencies [[`b1c061a`](https://github.com/TanStack/router/commit/b1c061aff9185cdf5fdc08c0136382a9dce0302f), [`201e150`](https://github.com/TanStack/router/commit/201e150bd1412bae2faa9ce53f0fefcb7574ac14), [`5ae2ae5`](https://github.com/TanStack/router/commit/5ae2ae5e0f8ce32e02667a482ea9be52a6150240)]:
  - @tanstack/router-core@1.170.0
  - @tanstack/history@1.162.0
  - @tanstack/solid-router@1.170.0
  - @tanstack/start-client-core@1.169.0
  - @tanstack/start-server-core@1.168.0

## 1.166.51

### Patch Changes

- Updated dependencies [[`35e88f0`](https://github.com/TanStack/router/commit/35e88f04996d71019a1868b7b06ecb4ddbc9df9e)]:
  - @tanstack/router-core@1.169.2
  - @tanstack/start-client-core@1.168.2
  - @tanstack/start-server-core@1.167.30
  - @tanstack/solid-router@1.169.2

## 1.166.50

### Patch Changes

- Updated dependencies [[`afa40ef`](https://github.com/TanStack/router/commit/afa40ef46c273c53646ba33f607fc618a07ffede)]:
  - @tanstack/start-server-core@1.167.29

## 1.166.49

### Patch Changes

- Add opt-in Start response Link headers for collected Early Hints. ([#7327](https://github.com/TanStack/router/pull/7327))

- Updated dependencies [[`709627f`](https://github.com/TanStack/router/commit/709627f3dbc6d97daa547a1401ef42a53bc4be32)]:
  - @tanstack/start-server-core@1.167.28

## 1.166.48

### Patch Changes

- Add experimental HTTP 103 Early Hints support to Start server handlers. ([#7324](https://github.com/TanStack/router/pull/7324))

- Updated dependencies [[`238ea4a`](https://github.com/TanStack/router/commit/238ea4a4998ab3a7fd528b317e1935766ac65df8)]:
  - @tanstack/start-server-core@1.167.27

## 1.166.47

### Patch Changes

- Updated dependencies [[`4a1e63f`](https://github.com/TanStack/router/commit/4a1e63f1d1230b1ed8234609acad4639d8982c13)]:
  - @tanstack/router-core@1.169.1
  - @tanstack/solid-router@1.169.1
  - @tanstack/start-client-core@1.168.1
  - @tanstack/start-server-core@1.167.26

## 1.166.46

### Patch Changes

- Updated dependencies [[`82b0613`](https://github.com/TanStack/router/commit/82b06132af776f74603ab27977cc277d6219a845)]:
  - @tanstack/start-client-core@1.168.0
  - @tanstack/start-server-core@1.167.25

## 1.166.45

### Patch Changes

- Updated dependencies [[`c992495`](https://github.com/TanStack/router/commit/c992495bf4010ff4c3597bb1f3b1ba02594e857e)]:
  - @tanstack/router-core@1.169.0
  - @tanstack/solid-router@1.169.0
  - @tanstack/start-client-core@1.167.22
  - @tanstack/start-server-core@1.167.24

## 1.166.44

### Patch Changes

- Updated dependencies [[`b5c4183`](https://github.com/TanStack/router/commit/b5c4183ab8b44be8a75647b7f7b588ad7c146ece)]:
  - @tanstack/router-core@1.168.18
  - @tanstack/solid-router@1.168.26
  - @tanstack/start-client-core@1.167.21
  - @tanstack/start-server-core@1.167.23

## 1.166.43

### Patch Changes

- Updated dependencies [[`493148b`](https://github.com/TanStack/router/commit/493148bc5378b7f9de1544d87f6aaa425c12eb34)]:
  - @tanstack/router-core@1.168.17
  - @tanstack/solid-router@1.168.25
  - @tanstack/start-client-core@1.167.20
  - @tanstack/start-server-core@1.167.22

## 1.166.42

### Patch Changes

- Updated dependencies [[`944b155`](https://github.com/TanStack/router/commit/944b1558965bf038eaf3c0dfb9e1ac3800d6fd3a)]:
  - @tanstack/solid-router@1.168.24

## 1.166.41

### Patch Changes

- Updated dependencies [[`41e37f8`](https://github.com/TanStack/router/commit/41e37f8a9c3d2a6e00e4ca6faabb6a596bc36a98), [`e054474`](https://github.com/TanStack/router/commit/e054474cd1df6f93cd69dd5d255013840441438e)]:
  - @tanstack/solid-router@1.168.23

## 1.166.40

### Patch Changes

- Updated dependencies [[`b732c8a`](https://github.com/TanStack/router/commit/b732c8ac26bd3b316e95b026ca2fc7c2c78a1ddd), [`d20c878`](https://github.com/TanStack/router/commit/d20c87813559ff00d0b4810c4b600d47b47eff2f)]:
  - @tanstack/solid-router@1.168.22

## 1.166.39

### Patch Changes

- Updated dependencies [[`8b97002`](https://github.com/TanStack/router/commit/8b97002af3f6d15204e60c55d3f5735b78bd7efe)]:
  - @tanstack/start-client-core@1.167.19
  - @tanstack/start-server-core@1.167.21

## 1.166.38

### Patch Changes

- Updated dependencies [[`4d864ee`](https://github.com/TanStack/router/commit/4d864eebbd184265eabb563d326ab409c93feb17)]:
  - @tanstack/router-core@1.168.16
  - @tanstack/solid-router@1.168.21
  - @tanstack/start-server-core@1.167.20
  - @tanstack/start-client-core@1.167.18

## 1.166.37

### Patch Changes

- Updated dependencies [[`22dc152`](https://github.com/TanStack/router/commit/22dc15203379da15e6eaa225e61696039380aedd)]:
  - @tanstack/solid-router@1.168.20

## 1.166.36

### Patch Changes

- Updated dependencies [[`16f6892`](https://github.com/TanStack/router/commit/16f6892d6b7ceadf606677c5a40e743f29163aa6)]:
  - @tanstack/router-core@1.168.15
  - @tanstack/solid-router@1.168.19
  - @tanstack/start-client-core@1.167.17
  - @tanstack/start-server-core@1.167.19

## 1.166.35

### Patch Changes

- Updated dependencies [[`105d056`](https://github.com/TanStack/router/commit/105d05691a247779a63e7b688aa1207cce619339)]:
  - @tanstack/solid-router@1.168.18

## 1.166.34

### Patch Changes

- Updated dependencies [[`0e2c900`](https://github.com/TanStack/router/commit/0e2c9003c18ae07c09969189c028f277ea562a7a)]:
  - @tanstack/start-server-core@1.167.18
  - @tanstack/router-core@1.168.14
  - @tanstack/solid-router@1.168.17
  - @tanstack/start-client-core@1.167.16

## 1.166.33

### Patch Changes

- Updated dependencies [[`812792f`](https://github.com/TanStack/router/commit/812792fbda3caf97b300770855cf5641252f413b)]:
  - @tanstack/router-core@1.168.13
  - @tanstack/start-server-core@1.167.17
  - @tanstack/solid-router@1.168.16
  - @tanstack/start-client-core@1.167.15

## 1.166.32

### Patch Changes

- Updated dependencies [[`8ec9ca9`](https://github.com/TanStack/router/commit/8ec9ca97b472779de878c2a6510f21deb24d386c)]:
  - @tanstack/router-core@1.168.12
  - @tanstack/solid-router@1.168.15
  - @tanstack/start-client-core@1.167.14
  - @tanstack/start-server-core@1.167.16

## 1.166.31

### Patch Changes

- Updated dependencies [[`6355bb7`](https://github.com/TanStack/router/commit/6355bb75f7637ba77f06a923c18fdaf37720bb48)]:
  - @tanstack/start-server-core@1.167.15
  - @tanstack/solid-router@1.168.14
  - @tanstack/router-core@1.168.11
  - @tanstack/start-client-core@1.167.13

## 1.166.30

### Patch Changes

- Updated dependencies [[`459057c`](https://github.com/TanStack/router/commit/459057cd2d90cff20d20e51d4964b0a8c950555e)]:
  - @tanstack/start-client-core@1.167.12
  - @tanstack/start-server-core@1.167.14
  - @tanstack/solid-router@1.168.13
  - @tanstack/router-core@1.168.10

## 1.166.29

### Patch Changes

- Updated dependencies [[`f8ac427`](https://github.com/TanStack/router/commit/f8ac427000c3fec99225926e72f9f2fc7a37231f)]:
  - @tanstack/start-server-core@1.167.13
  - @tanstack/start-client-core@1.167.11

## 1.166.28

### Patch Changes

- Updated dependencies [[`2d53c05`](https://github.com/TanStack/router/commit/2d53c056ef0b203de8a28bc92c24e8e604205d52)]:
  - @tanstack/start-server-core@1.167.12

## 1.166.27

### Patch Changes

- Updated dependencies [[`540d221`](https://github.com/TanStack/router/commit/540d22100d33415a1ddc9eb193f6aeb8184da77f)]:
  - @tanstack/solid-router@1.168.12

## 1.166.26

### Patch Changes

- Updated dependencies [[`b29d64d`](https://github.com/TanStack/router/commit/b29d64de0c400183114c12f82183f80e37d9ea5c)]:
  - @tanstack/solid-router@1.168.11

## 1.166.25

### Patch Changes

- Updated dependencies [[`4b9ed6c`](https://github.com/TanStack/router/commit/4b9ed6c5cb5437df8607c605728c8338dd2eb02c)]:
  - @tanstack/solid-router@1.168.10

## 1.166.24

### Patch Changes

- Updated dependencies [[`f7e9c5e`](https://github.com/TanStack/router/commit/f7e9c5e323793d1b28c96871819c265fd28ae397)]:
  - @tanstack/start-client-core@1.167.10
  - @tanstack/start-server-core@1.167.10

## 1.166.23

### Patch Changes

- Updated dependencies [[`796406d`](https://github.com/TanStack/router/commit/796406da66cfb12b518bb3ca326c9d541368fb06)]:
  - @tanstack/router-core@1.168.9
  - @tanstack/solid-router@1.168.9
  - @tanstack/start-client-core@1.167.9
  - @tanstack/start-server-core@1.167.9

## 1.166.22

### Patch Changes

- Updated dependencies [[`2d1ec86`](https://github.com/TanStack/router/commit/2d1ec865a446926f7db6e29dbbde82d265de6d36)]:
  - @tanstack/router-core@1.168.8
  - @tanstack/solid-router@1.168.8
  - @tanstack/start-client-core@1.167.8
  - @tanstack/start-server-core@1.167.8

## 1.166.21

### Patch Changes

- Updated dependencies [[`6ee0e79`](https://github.com/TanStack/router/commit/6ee0e795b085651beb2f1ac6503cdbd7eaffedd1)]:
  - @tanstack/router-core@1.168.7
  - @tanstack/solid-router@1.168.7
  - @tanstack/start-client-core@1.167.7
  - @tanstack/start-server-core@1.167.7

## 1.166.20

### Patch Changes

- Updated dependencies [[`42c3f3b`](https://github.com/TanStack/router/commit/42c3f3b3a3a478fd6d6894310ef94b2d23794b8e)]:
  - @tanstack/router-core@1.168.6
  - @tanstack/solid-router@1.168.6
  - @tanstack/start-client-core@1.167.6
  - @tanstack/start-server-core@1.167.6

## 1.166.19

### Patch Changes

- Updated dependencies [[`cf5f554`](https://github.com/TanStack/router/commit/cf5f5542476137a81515099ad740747e84512f9a)]:
  - @tanstack/router-core@1.168.5
  - @tanstack/solid-router@1.168.5
  - @tanstack/start-client-core@1.167.5
  - @tanstack/start-server-core@1.167.5

## 1.166.18

### Patch Changes

- Updated dependencies [[`71a8b68`](https://github.com/TanStack/router/commit/71a8b684c87c37fd4a033d99f5ba4a05c7a179f5)]:
  - @tanstack/router-core@1.168.4
  - @tanstack/solid-router@1.168.4
  - @tanstack/start-client-core@1.167.4
  - @tanstack/start-server-core@1.167.4

## 1.166.17

### Patch Changes

- Updated dependencies [[`d81d21a`](https://github.com/TanStack/router/commit/d81d21ad05c9401bf54b24acd29401e1e4fd624c)]:
  - @tanstack/router-core@1.168.3
  - @tanstack/solid-router@1.168.3
  - @tanstack/start-server-core@1.167.3
  - @tanstack/start-client-core@1.167.3

## 1.166.16

### Patch Changes

- Updated dependencies [[`c9e1855`](https://github.com/TanStack/router/commit/c9e18555f3a5531e96de8f574cfca9edcdb18e5c)]:
  - @tanstack/start-client-core@1.167.2
  - @tanstack/start-server-core@1.167.2
  - @tanstack/solid-router@1.168.2
  - @tanstack/router-core@1.168.2

## 1.166.15

### Patch Changes

- Updated dependencies [[`91cc628`](https://github.com/TanStack/router/commit/91cc62899b75ca920fe83c5ee7f3dbb5c71a523f)]:
  - @tanstack/router-core@1.168.1
  - @tanstack/solid-router@1.168.1
  - @tanstack/start-client-core@1.167.1
  - @tanstack/start-server-core@1.167.1

## 1.166.14

### Patch Changes

- Updated dependencies [[`0545239`](https://github.com/TanStack/router/commit/054523900b2ee19308e5a88417dadfc6923afe30)]:
  - @tanstack/start-client-core@1.167.0
  - @tanstack/start-server-core@1.167.0
  - @tanstack/solid-router@1.168.0
  - @tanstack/router-core@1.168.0

## 1.166.13

### Patch Changes

- Updated dependencies [[`5ff4f0b`](https://github.com/TanStack/router/commit/5ff4f0b8dce1fac2bb0b0bfe2684fc677a8ee505)]:
  - @tanstack/router-core@1.167.5
  - @tanstack/solid-router@1.167.5
  - @tanstack/start-client-core@1.166.13
  - @tanstack/start-server-core@1.166.13

## 1.166.12

### Patch Changes

- Updated dependencies [[`940151c`](https://github.com/TanStack/router/commit/940151cbed0c76c92a5cf196c0905b17a956ca7e)]:
  - @tanstack/router-core@1.167.4
  - @tanstack/solid-router@1.167.4
  - @tanstack/start-client-core@1.166.12
  - @tanstack/start-server-core@1.166.12

## 1.166.11

### Patch Changes

- Updated dependencies [[`32fcba7`](https://github.com/TanStack/router/commit/32fcba7b044b03f5901308b870f70b0b4910c220)]:
  - @tanstack/router-core@1.167.3
  - @tanstack/solid-router@1.167.3
  - @tanstack/start-client-core@1.166.11
  - @tanstack/start-server-core@1.166.11

## 1.166.10

### Patch Changes

- build: update to vite-config 5.x (rolldown) ([#6926](https://github.com/TanStack/router/pull/6926))

- Updated dependencies [[`838b0eb`](https://github.com/TanStack/router/commit/838b0eb9a8bbbb987a0a6972c1446e01423bbd7b)]:
  - @tanstack/history@1.161.6
  - @tanstack/router-core@1.167.2
  - @tanstack/solid-router@1.167.2
  - @tanstack/start-client-core@1.166.10
  - @tanstack/start-server-core@1.166.10

## 1.166.9

### Patch Changes

- fix: build with @tanstack/vite-config 0.4.3 ([#6923](https://github.com/TanStack/router/pull/6923))

- Updated dependencies [[`ef9b241`](https://github.com/TanStack/router/commit/ef9b241f3cfe95cee40daa96da669f0ffd4a971a)]:
  - @tanstack/start-client-core@1.166.9
  - @tanstack/start-server-core@1.166.9
  - @tanstack/solid-router@1.167.1
  - @tanstack/router-core@1.167.1
  - @tanstack/history@1.161.5

## 1.166.8

### Patch Changes

- Updated dependencies [[`6f297a2`](https://github.com/TanStack/router/commit/6f297a249424c0fd1c1a56aa4fc12c8217be7b6a)]:
  - @tanstack/router-core@1.167.0
  - @tanstack/solid-router@1.167.0
  - @tanstack/start-client-core@1.166.8
  - @tanstack/start-server-core@1.166.8
