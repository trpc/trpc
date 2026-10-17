# Changelog

## [0.11.1](https://github.com/KATT/raf-query/compare/0.11.0...0.11.1) (2026-10-17)

### Features

- **core:** take throwOnError from the query's options (2/2) ([#214](https://github.com/KATT/raf-query/issues/214)) ([ef1f0fd](https://github.com/KATT/raf-query/commit/ef1f0fd8eda2a73f4c4c268e8a3a5cf91a0ba0d8)), references [#448](https://github.com/KATT/raf-query/issues/448)

## [0.11.0](https://github.com/KATT/raf-query/compare/0.10.4...0.11.0) (2026-10-16)

### ⚠ BREAKING CHANGES

- **core:** enabled replaces ssr, as a boolean like TanStack Query's ([#204](https://github.com/KATT/raf-query/issues/204))

### Features

- **core:** enabled replaces ssr, as a boolean like TanStack Query's ([#204](https://github.com/KATT/raf-query/issues/204)) ([b7e543b](https://github.com/KATT/raf-query/commit/b7e543b9d1d34e02061740f749f2ddabcdee2ad2))

## [0.10.4](https://github.com/KATT/raf-query/compare/0.10.3...0.10.4) (2026-10-16)

### Bug Fixes

- **core:** keep pages written during a paged refetch ([#215](https://github.com/KATT/raf-query/issues/215)) ([b6a5946](https://github.com/KATT/raf-query/commit/b6a5946e806e12e9b7df40e80ef0e532c0871b25)), references [#75](https://github.com/KATT/raf-query/issues/75)
- **react:** read promise queryFns as plain data on a client with a layer (1/2) ([#205](https://github.com/KATT/raf-query/issues/205)) ([a9b156e](https://github.com/KATT/raf-query/commit/a9b156edfa18b1e41e9ea929afc412252a61b83c))

## [0.10.3](https://github.com/KATT/raf-query/compare/0.10.2...0.10.3) (2026-10-16)

### Features

- **core:** add QueryBinding, a framework-free useQuery for bindings ([#197](https://github.com/KATT/raf-query/issues/197)) ([4865802](https://github.com/KATT/raf-query/commit/48658024f4d21d43ce8274de379a19c8898b6173)), references [#194](https://github.com/KATT/raf-query/issues/194)

## [0.10.2](https://github.com/KATT/raf-query/compare/0.10.1...0.10.2) (2026-10-16)

### Features

- **react:** re-render useQuery readers of the thenable's status when the first load settles (2/3) ([#198](https://github.com/KATT/raf-query/issues/198)) ([436d83c](https://github.com/KATT/raf-query/commit/436d83cfd6a3944265eb56d5597c322342c5a6c6))
- **react:** type useQuery's promise as a Thenable (1/3) ([#200](https://github.com/KATT/raf-query/issues/200)) ([47e5309](https://github.com/KATT/raf-query/commit/47e530957565a2bd345642ae7a4be5d3c501ffb2))

## [0.10.1](https://github.com/KATT/raf-query/compare/0.10.0...0.10.1) (2026-10-16)

### Features

- **core:** export QueryClient, dehydrate, hydrate, allKeyed and the useQuery controls from @raf-query/core ([#193](https://github.com/KATT/raf-query/issues/193)) ([54492ab](https://github.com/KATT/raf-query/commit/54492abbe2966a0645e8a4c77f9c5ab31d6e3a20)), references [#194](https://github.com/KATT/raf-query/issues/194)

### Documentation

- React Router client-only and server sections with one server client per request, Effect under Integrations, official docs links, and ensure waits like fetch in server-only code ([#192](https://github.com/KATT/raf-query/issues/192)) ([841ffcf](https://github.com/KATT/raf-query/commit/841ffcf4d0fa0a40dfc58dc65bfcfadca8948874)), references [#190](https://github.com/KATT/raf-query/issues/190)

## [0.10.0](https://github.com/KATT/raf-query/compare/0.9.2...0.10.0) (2026-10-16)

### ⚠ BREAKING CHANGES

- **react:** import HydrationBoundary from @raf-query/react in RSC and React Router ([#175](https://github.com/KATT/raf-query/issues/175))
- **react:** import QueryProvider from @raf-query/react ([#177](https://github.com/KATT/raf-query/issues/177))

### Features

- **react:** import HydrationBoundary from @raf-query/react in RSC and React Router ([#175](https://github.com/KATT/raf-query/issues/175)) ([244705c](https://github.com/KATT/raf-query/commit/244705c74841d280a596195dec5cf5e5d5617fe5))
- **react:** import QueryProvider from @raf-query/react ([#177](https://github.com/KATT/raf-query/issues/177)) ([fb4fceb](https://github.com/KATT/raf-query/commit/fb4fcebb404906b4a9d5716a1d45cb33c82da2fb)), references [#175](https://github.com/KATT/raf-query/issues/175) [#175](https://github.com/KATT/raf-query/issues/175) [#175](https://github.com/KATT/raf-query/issues/175) [#175](https://github.com/KATT/raf-query/issues/175)

### Code Refactoring

- **react:** group the HydrationBoundary and QueryProvider files in folders ([#186](https://github.com/KATT/raf-query/issues/186)) ([ad07bb4](https://github.com/KATT/raf-query/commit/ad07bb45ca77fc797cd6b8432685e58f43907258)), references [#175](https://github.com/KATT/raf-query/issues/175)

## [0.9.2](https://github.com/KATT/raf-query/compare/0.9.1...0.9.2) (2026-10-15)

### Bug Fixes

- **core:** keep handles of factories with the same signature apart ([#167](https://github.com/KATT/raf-query/issues/167)) ([5894bcb](https://github.com/KATT/raf-query/commit/5894bcbcc382c60e9c04768c0e178bf0996f4b45))

## [0.9.1](https://github.com/KATT/raf-query/compare/0.9.0...0.9.1) (2026-10-15)

### Features

- **react:** add @raf-query/react/react-router for React Router Framework Mode ([#146](https://github.com/KATT/raf-query/issues/146)) ([4e02c80](https://github.com/KATT/raf-query/commit/4e02c809d8be1eea33935c9f0b6abc38cbdce25c)), references [#130](https://github.com/KATT/raf-query/issues/130) [#148](https://github.com/KATT/raf-query/issues/148) [#148](https://github.com/KATT/raf-query/issues/148)

### Miscellaneous Chores

- **lint:** ban member access on use(), in code and Markdown fences ([#155](https://github.com/KATT/raf-query/issues/155)) ([b7b37b4](https://github.com/KATT/raf-query/commit/b7b37b4f6d83c0a232697d05b177c33bdea11df1)), references [#140](https://github.com/KATT/raf-query/issues/140)

## [0.9.0](https://github.com/KATT/raf-query/compare/0.8.0...0.9.0) (2026-10-15)

### ⚠ BREAKING CHANGES

- useQuery returns the data for a handle from ensure or fetch ([#144](https://github.com/KATT/raf-query/issues/144))

### Features

- useQuery returns the data for a handle from ensure or fetch ([#144](https://github.com/KATT/raf-query/issues/144)) ([1845244](https://github.com/KATT/raf-query/commit/18452443ba61c205a53c4f71d60ec99a9b8620a7)), references [#142](https://github.com/KATT/raf-query/issues/142)

### Documentation

- call the early API a note about minor releases ([#143](https://github.com/KATT/raf-query/issues/143)) ([2d79eed](https://github.com/KATT/raf-query/commit/2d79eed7b107b6d16898ebb203a9bdfcfb3856c4))
- show prefetch and ensure, and make list queries infinite ([#140](https://github.com/KATT/raf-query/issues/140)) ([25cfaa0](https://github.com/KATT/raf-query/commit/25cfaa08f9f192af7efded1269f4ae8a9e5f1026))

## [0.8.0](https://github.com/KATT/raf-query/compare/0.7.12...0.8.0) (2026-10-15)

### ⚠ BREAKING CHANGES

- ensure and fetch return a QueryHandleWithData ([#142](https://github.com/KATT/raf-query/issues/142))

### Features

- ensure and fetch return a QueryHandleWithData ([#142](https://github.com/KATT/raf-query/issues/142)) ([504cd2a](https://github.com/KATT/raf-query/commit/504cd2a19e04b614eb648f02b256128c4eb31d38))

### Miscellaneous Chores

- group experiments under `.experimental/<topic>/` ([#137](https://github.com/KATT/raf-query/issues/137)) ([52ce752](https://github.com/KATT/raf-query/commit/52ce7522223346e82687338d6ac6d34f793b6fcf))

## [0.7.12](https://github.com/KATT/raf-query/compare/0.7.11...0.7.12) (2026-10-15)

- add knip with every issue type as an error ([#129](https://github.com/KATT/raf-query/issues/129)) ([603719d](https://github.com/KATT/raf-query/commit/603719dcb834312d4a813ecae865df7d56faf8c5))
- cache Next.js Turbopack builds ([#128](https://github.com/KATT/raf-query/issues/128)) ([667b38f](https://github.com/KATT/raf-query/commit/667b38ff5728dad3fdad6d90445aea480cfbd063))
- explain how a route loads its data on the homepage ([#121](https://github.com/KATT/raf-query/issues/121)) ([ec1d6ef](https://github.com/KATT/raf-query/commit/ec1d6efdad75ea2d05dd56790e5e980756afea13))
- frame the cache as async data, not server-state-only ([#126](https://github.com/KATT/raf-query/issues/126)) ([db9ba02](https://github.com/KATT/raf-query/commit/db9ba02995aa01cadacb2739fd258de3c920d440))

### Features

- **examples:** reinstall shadcn on Base UI without Radix ([#125](https://github.com/KATT/raf-query/issues/125)) ([7c13ef3](https://github.com/KATT/raf-query/commit/7c13ef379dc297edbbe160516b26916d465a48d1))

## [0.7.11](https://github.com/KATT/raf-query/compare/0.7.10...0.7.11) (2026-10-14)

### Features

- **examples:** add a stale time setting ([#119](https://github.com/KATT/raf-query/issues/119)) ([02467ef](https://github.com/KATT/raf-query/commit/02467ef4cf700d2ca1a57647c2fbc5cad2bf7abc))

### Bug Fixes

- **core:** leave error out of query types when it isn't inferred ([#120](https://github.com/KATT/raf-query/issues/120)) ([d2098e8](https://github.com/KATT/raf-query/commit/d2098e84dea31c8e0d136f7850177e37f56d4678)), references [#69](https://github.com/KATT/raf-query/issues/69) [#69](https://github.com/KATT/raf-query/issues/69)

## [0.7.10](https://github.com/KATT/raf-query/compare/0.7.9...0.7.10) (2026-10-14)

### Bug Fixes

- **examples:** fit the example apps on a phone screen ([#116](https://github.com/KATT/raf-query/issues/116)) ([1580e00](https://github.com/KATT/raf-query/commit/1580e00f79f4e47e82ddba64e0d22723b9ffb4ba)), references [#112](https://github.com/KATT/raf-query/issues/112)
- **examples:** open issue pages with prefetch skeletons ([#106](https://github.com/KATT/raf-query/issues/106)) ([db6b5bc](https://github.com/KATT/raf-query/commit/db6b5bcd162dd34073d36c74eaf7618f5012dc31))
- **examples:** remount the issue page when next or previous changes the id ([#112](https://github.com/KATT/raf-query/issues/112)) ([e4b709b](https://github.com/KATT/raf-query/commit/e4b709b455e4e7bbd85746afe46ecca269a728ee))
- **react:** type useQuery's promise as Promise ([#118](https://github.com/KATT/raf-query/issues/118)) ([f1b4efe](https://github.com/KATT/raf-query/commit/f1b4efefc7624719b00f0c6e308dd7a72c18c132))

## [0.7.9](https://github.com/KATT/raf-query/compare/0.7.8...0.7.9) (2026-10-14)

- add a Links table to the pull request template ([#108](https://github.com/KATT/raf-query/issues/108)) ([91247e4](https://github.com/KATT/raf-query/commit/91247e47d4d1b4a0b6e5eb2068602629c3fbce9e))

### Features

- QueryClient.runPromise, typed Effect errors, and the Effect RPC example ([#103](https://github.com/KATT/raf-query/issues/103)) ([98bd182](https://github.com/KATT/raf-query/commit/98bd1821081313feb1846531feac0dfbe7215d31)), references [#96](https://github.com/KATT/raf-query/issues/96) [#97](https://github.com/KATT/raf-query/issues/97)

## [0.7.8](https://github.com/KATT/raf-query/compare/0.7.7...0.7.8) (2026-10-14)

- inline type assertions next to their SAFETY comments ([#104](https://github.com/KATT/raf-query/issues/104)) ([53fdbdb](https://github.com/KATT/raf-query/commit/53fdbdbfdcb146799b145faadb579bbb45e19139))
- **release:** skip npm publish when packages did not change ([#101](https://github.com/KATT/raf-query/issues/101)) ([4c6c315](https://github.com/KATT/raf-query/commit/4c6c3156224cfb74a62f6c6e5505c30da7400289)), references [#80](https://github.com/KATT/raf-query/issues/80)
- say the route waits for the post and comments stream in after ([#102](https://github.com/KATT/raf-query/issues/102)) ([3d0c5f4](https://github.com/KATT/raf-query/commit/3d0c5f4c089921fc178b374179dc23bafdbe899c))

### Bug Fixes

- **examples:** start prefetch off and link whole issue rows ([#105](https://github.com/KATT/raf-query/issues/105)) ([cf83077](https://github.com/KATT/raf-query/commit/cf8307701abc6e6ff50304b7245e3bc2af929f3a))

## [0.7.7](https://github.com/KATT/raf-query/compare/0.7.6...0.7.7) (2026-10-14)

- **examples:** placeholder for the Effect example's Vercel project ([#100](https://github.com/KATT/raf-query/issues/100)) ([0142c6e](https://github.com/KATT/raf-query/commit/0142c6ef9448631c6239fff4a4ddf16db02b35de))

## [0.7.6](https://github.com/KATT/raf-query/compare/0.7.5...0.7.6) (2026-10-14)

- **agents:** open PRs ready for review unless experimental ([#99](https://github.com/KATT/raf-query/issues/99)) ([e141269](https://github.com/KATT/raf-query/commit/e141269cf290b56dcb452bb0aa63a3b490657142))

## [0.7.5](https://github.com/KATT/raf-query/compare/0.7.4...0.7.5) (2026-10-14)

- steer useIsFetching toward router pending and per-query isFetching ([#80](https://github.com/KATT/raf-query/issues/80)) ([c848b16](https://github.com/KATT/raf-query/commit/c848b162d31b1b16c8231d6f19be2420c12f5801))

## [0.7.4](https://github.com/KATT/raf-query/compare/0.7.3...0.7.4) (2026-10-14)

- **agents:** verify with tests and preview links, and stack PRs for big work ([#93](https://github.com/KATT/raf-query/issues/93)) ([fbe282c](https://github.com/KATT/raf-query/commit/fbe282cc046abfa493afbfd147614dbeba878508))

## [0.7.3](https://github.com/KATT/raf-query/compare/0.7.2...0.7.3) (2026-10-14)

- typecheck every ts/tsx sample with Twoslash ([#92](https://github.com/KATT/raf-query/issues/92)) ([a658baa](https://github.com/KATT/raf-query/commit/a658baaecf4706e11136e7fc0a322fbce539c583)), references [#90](https://github.com/KATT/raf-query/issues/90)

## [0.7.2](https://github.com/KATT/raf-query/compare/0.7.1...0.7.2) (2026-10-14)

### Features

- **examples:** warn on writes that the mock DB may not stick ([#91](https://github.com/KATT/raf-query/issues/91)) ([8ccad7e](https://github.com/KATT/raf-query/commit/8ccad7e088a6218abec3ea492991c1af2d5f503a))

## [0.7.1](https://github.com/KATT/raf-query/compare/0.7.0...0.7.1) (2026-10-14)

- give overview code samples Twoslash like the homepage ([#90](https://github.com/KATT/raf-query/issues/90)) ([2b82a4a](https://github.com/KATT/raf-query/commit/2b82a4a0464d64de1156a3fb590c13c7cdf95968))

## [0.7.0](https://github.com/KATT/raf-query/compare/0.6.6...0.7.0) (2026-10-14)

### ⚠ BREAKING CHANGES

- **react:** tree-shake QueryDevtools at the call site ([#85](https://github.com/KATT/raf-query/issues/85))

### Features

- **react:** tree-shake QueryDevtools at the call site ([#85](https://github.com/KATT/raf-query/issues/85)) ([b270fa3](https://github.com/KATT/raf-query/commit/b270fa3c86513bc7414aad7c8567a64258d14f7a))

## [0.6.6](https://github.com/KATT/raf-query/compare/0.6.5...0.6.6) (2026-10-14)

- build on Vercel when the last deployed commit is gone (1/2) ([#88](https://github.com/KATT/raf-query/issues/88)) ([33737ca](https://github.com/KATT/raf-query/commit/33737ca7ead288c35f3d60d063bcee69d07b0491)), references [#80](https://github.com/KATT/raf-query/issues/80) [#84](https://github.com/KATT/raf-query/issues/84) [#85](https://github.com/KATT/raf-query/issues/85) [#84](https://github.com/KATT/raf-query/issues/84)
- clean up with `using` instead of onTestFinished, and lint for it (2/2) ([#84](https://github.com/KATT/raf-query/issues/84)) ([731b0f3](https://github.com/KATT/raf-query/commit/731b0f3aec9f3e3cf2988788ca5203e92f0a0da8)), references [#79](https://github.com/KATT/raf-query/issues/79)

## [0.6.5](https://github.com/KATT/raf-query/compare/0.6.4...0.6.5) (2026-10-14)

- run the starting queries demo on TanStack Router, with Reload per variant and Vitest tests (1/2) ([#79](https://github.com/KATT/raf-query/issues/79)) ([ae8b1eb](https://github.com/KATT/raf-query/commit/ae8b1eb4907238d5a228554ae5d5702a1078132d)), references [#73](https://github.com/KATT/raf-query/issues/73) [#84](https://github.com/KATT/raf-query/issues/84)

## [0.6.4](https://github.com/KATT/raf-query/compare/0.6.3...0.6.4) (2026-10-14)

### Bug Fixes

- **examples:** clear comment form and show pending optimistic UI ([#87](https://github.com/KATT/raf-query/issues/87)) ([aa64372](https://github.com/KATT/raf-query/commit/aa64372f2d4c4786788661474b486832511ee5af))

## [0.6.3](https://github.com/KATT/raf-query/compare/0.6.2...0.6.3) (2026-10-14)

- enforce conventional pull request titles ([#83](https://github.com/KATT/raf-query/issues/83)) ([6d86c01](https://github.com/KATT/raf-query/commit/6d86c017bbfd12aed45c09a2c9c55878fbd5b69f)), references [#80](https://github.com/KATT/raf-query/issues/80)

## [0.6.2](https://github.com/KATT/raf-query/compare/0.6.1...0.6.2) (2026-10-14)

### Features

- **examples:** Linear-style inline edits and list status changes ([#82](https://github.com/KATT/raf-query/issues/82)) ([10119d0](https://github.com/KATT/raf-query/commit/10119d0d78f216b8eaff09ab3880538060412c6c))

## [0.6.1](https://github.com/KATT/raf-query/compare/0.6.0...0.6.1) (2026-10-14)

- skip a release when main moved before publishing ([#81](https://github.com/KATT/raf-query/issues/81)) ([9ca107d](https://github.com/KATT/raf-query/commit/9ca107df549d12957edbb1019217b73bb59ec740)), references [#78](https://github.com/KATT/raf-query/issues/78) [#78](https://github.com/KATT/raf-query/issues/78)

## [0.6.0](https://github.com/KATT/raf-query/compare/0.5.3...0.6.0) (2026-10-14)

### ⚠ BREAKING CHANGES

- **core:** LoadOptions takes no type argument, and QueryCache.LoadArgs is gone.

- **testing:** render in an async act so suspended trees resume ([#78](https://github.com/KATT/raf-query/issues/78)) ([c706b9d](https://github.com/KATT/raf-query/commit/c706b9db0d3ba3ea2d5b3fd1e21dc8e1fe315b82))

### Features

- **core:** ssr: false runs a query in the browser only ([#77](https://github.com/KATT/raf-query/issues/77)) ([22c47bd](https://github.com/KATT/raf-query/commit/22c47bdad9da2e9e84728017db3dde636c5d4113))

### Bug Fixes

- **core:** infer generic factory makers passed inline to a verb ([#76](https://github.com/KATT/raf-query/issues/76)) ([f0616f7](https://github.com/KATT/raf-query/commit/f0616f7cd4288fb4a00e784f6d94dc3880d19a39))
- **core:** keep data written while a page loads ([#75](https://github.com/KATT/raf-query/issues/75)) ([d1b8ae5](https://github.com/KATT/raf-query/commit/d1b8ae560540cea345dad1008f8b4d8a467f48aa))
- **react:** let beforeLoad return handles in TanStack Start route context ([#74](https://github.com/KATT/raf-query/issues/74)) ([70c2121](https://github.com/KATT/raf-query/commit/70c2121a1926b4045049e6d9bfe56778262be42f))

## [0.5.3](https://github.com/KATT/raf-query/compare/0.5.2...0.5.3) (2026-10-14)

- compare prefetch, ensure and fetch in the starting queries demo ([#73](https://github.com/KATT/raf-query/issues/73)) ([b26a65e](https://github.com/KATT/raf-query/commit/b26a65e3e003f18308ce456646eba1d3f50c1357))

## [0.5.2](https://github.com/KATT/raf-query/compare/0.5.1...0.5.2) (2026-10-14)

- fix demo header on mobile, explain prefetch vs ensure more concisely ([#71](https://github.com/KATT/raf-query/issues/71)) ([3909b22](https://github.com/KATT/raf-query/commit/3909b224296921aa36424c2f942b28aa8f0b3e7e))

## [0.5.1](https://github.com/KATT/raf-query/compare/0.5.0...0.5.1) (2026-10-14)

### Features

- raf-query logo, brand colors, and a system / light / dark switcher ([#68](https://github.com/KATT/raf-query/issues/68)) ([9ae09c6](https://github.com/KATT/raf-query/commit/9ae09c63b4f60f4109a8fa6389b8b4f7adfd2ab8))

## [0.5.0](https://github.com/KATT/raf-query/compare/0.4.5...0.5.0) (2026-10-14)

### ⚠ BREAKING CHANGES

- type options by a bag instead of positional type arguments ([#69](https://github.com/KATT/raf-query/issues/69))

### Features

- type options by a bag instead of positional type arguments ([#69](https://github.com/KATT/raf-query/issues/69)) ([df7ef81](https://github.com/KATT/raf-query/commit/df7ef816d33039166686cfe1113333bb6c444a27))

## [0.4.5](https://github.com/KATT/raf-query/compare/0.4.4...0.4.5) (2026-10-14)

- trim the READMEs, give each package its own, and warn that raf-query is early on the docs site ([#70](https://github.com/KATT/raf-query/issues/70)) ([2c06462](https://github.com/KATT/raf-query/commit/2c0646291f5fc45d2d64bc43c52f3e089c46ce05))

## [0.4.4](https://github.com/KATT/raf-query/compare/0.4.3...0.4.4) (2026-10-14)

### Features

- **examples:** settings in the top bar for link prefetching and latency ([#67](https://github.com/KATT/raf-query/issues/67)) ([b8bde09](https://github.com/KATT/raf-query/commit/b8bde09f4d2525cc797bf59c35dd20b4404e8733))

## [0.4.3](https://github.com/KATT/raf-query/compare/0.4.2...0.4.3) (2026-10-14)

### Features

- **examples:** deploy the example apps to Vercel under *.raf-query.katt.dev ([#66](https://github.com/KATT/raf-query/issues/66)) ([1a84495](https://github.com/KATT/raf-query/commit/1a84495d341ac81dea6f80013baa1043ca72b0a7))

## [0.4.2](https://github.com/KATT/raf-query/compare/0.4.1...0.4.2) (2026-10-14)

- add a docs site with live demos, deployed at raf-query.katt.dev ([#65](https://github.com/KATT/raf-query/issues/65)) ([f4293b8](https://github.com/KATT/raf-query/commit/f4293b8943c82ef61288b65f99a146035b71d592))

## [0.4.1](https://github.com/KATT/raf-query/compare/0.4.0...0.4.1) (2026-10-13)

- one table for the query verbs; fetch and ensure wait alike in server components ([#64](https://github.com/KATT/raf-query/issues/64)) ([13e5549](https://github.com/KATT/raf-query/commit/13e5549e9f1b6df4fe0e8f23f79e1aef7bf94e53))

## [0.4.0](https://github.com/KATT/raf-query/compare/0.3.1...0.4.0) (2026-10-13)

### ⚠ BREAKING CHANGES

- **core:** fetch waits for stale data, as TanStack's fetchQuery does ([#63](https://github.com/KATT/raf-query/issues/63))

### Bug Fixes

- **core:** fetch waits for stale data, as TanStack's fetchQuery does ([#63](https://github.com/KATT/raf-query/issues/63)) ([c9785d5](https://github.com/KATT/raf-query/commit/c9785d5e99c0578c1748de3330823cc0e65f2378))

## [0.3.1](https://github.com/KATT/raf-query/compare/0.3.0...0.3.1) (2026-10-13)

- teach avoiding dependent queries; frame prefetch vs ensure as loading UX ([#62](https://github.com/KATT/raf-query/issues/62)) ([ec62760](https://github.com/KATT/raf-query/commit/ec627609cbbee9fa4ff0cf568f69964341e27daa))

## [0.3.0](https://github.com/KATT/raf-query/compare/0.2.8...0.3.0) (2026-10-13)

### ⚠ BREAKING CHANGES

- RSC apps hydrate only through HydrationBoundary; QueryProvider moves to /rsc ([#61](https://github.com/KATT/raf-query/issues/61))

### Features

- RSC apps hydrate only through HydrationBoundary; QueryProvider moves to /rsc ([#61](https://github.com/KATT/raf-query/issues/61)) ([772de79](https://github.com/KATT/raf-query/commit/772de796adfdf267a9184fd75624ff30ae53f4fc)), references [#59](https://github.com/KATT/raf-query/issues/59) [#59](https://github.com/KATT/raf-query/issues/59) [#59](https://github.com/KATT/raf-query/issues/59) [#59](https://github.com/KATT/raf-query/issues/59)

## [0.2.8](https://github.com/KATT/raf-query/compare/0.2.7...0.2.8) (2026-10-13)

- **codesandbox:** speed up the branch sync ([#60](https://github.com/KATT/raf-query/issues/60)) ([9099cb2](https://github.com/KATT/raf-query/commit/9099cb2ce937104d5feb8c7033233e701f412a28))

## [0.2.7](https://github.com/KATT/raf-query/compare/0.2.6...0.2.7) (2026-10-13)

- **examples:** open the CodeSandbox links at the issue list routes ([#58](https://github.com/KATT/raf-query/issues/58)) ([8cd518c](https://github.com/KATT/raf-query/commit/8cd518c3e8c6d5fed5e6d38c847401d390731909))

## [0.2.6](https://github.com/KATT/raf-query/compare/0.2.5...0.2.6) (2026-10-13)

### Features

- **examples:** load the assignee by issue id, beside the issue ([#57](https://github.com/KATT/raf-query/issues/57)) ([f4da131](https://github.com/KATT/raf-query/commit/f4da131f3a14e807141506aa4d64134298f0bdfa)), references [#54](https://github.com/KATT/raf-query/issues/54)

## [0.2.5](https://github.com/KATT/raf-query/compare/0.2.4...0.2.5) (2026-10-13)

- **tooling:** check every shared package is copied ([#56](https://github.com/KATT/raf-query/issues/56)) ([37d2d38](https://github.com/KATT/raf-query/commit/37d2d38b2a89babcea629bc4b9a88d8042cffb18)), references [#54](https://github.com/KATT/raf-query/issues/54)

## [0.2.4](https://github.com/KATT/raf-query/compare/0.2.3...0.2.4) (2026-10-13)

### Features

- **examples:** open the examples in CodeSandbox ([#55](https://github.com/KATT/raf-query/issues/55)) ([b94f6c8](https://github.com/KATT/raf-query/commit/b94f6c86ac1b631d6e8e043a19098ae529f3ea7c)), references [#53](https://github.com/KATT/raf-query/issues/53)

## [0.2.3](https://github.com/KATT/raf-query/compare/0.2.2...0.2.3) (2026-10-13)

### Features

- **examples:** shared Hono REST API instead of server functions; no useWaterfall ([#54](https://github.com/KATT/raf-query/issues/54)) ([402399d](https://github.com/KATT/raf-query/commit/402399d31160a47f41d225b052394ee989721f02)), references [#53](https://github.com/KATT/raf-query/issues/53)

## [0.2.2](https://github.com/KATT/raf-query/compare/0.2.1...0.2.2) (2026-10-13)

- **examples:** remove StackBlitz ([#53](https://github.com/KATT/raf-query/issues/53)) ([f681e30](https://github.com/KATT/raf-query/commit/f681e30475753e6fc98bdf8775b2e517d7565af3)), references [#50](https://github.com/KATT/raf-query/issues/50) [#51](https://github.com/KATT/raf-query/issues/51) [#52](https://github.com/KATT/raf-query/issues/52)

## [0.2.1](https://github.com/KATT/raf-query/compare/0.2.0...0.2.1) (2026-10-13)

### Bug Fixes

- **tooling:** don't walk node_modules when copying StackBlitz examples ([#52](https://github.com/KATT/raf-query/issues/52)) ([1ab1f6a](https://github.com/KATT/raf-query/commit/1ab1f6a813118646b11dd4cb804bb030f02e775d))

## [0.2.0](https://github.com/KATT/raf-query/compare/0.1.16...0.2.0) (2026-10-13)

### ⚠ BREAKING CHANGES

- **react:** qc.fetch / qc.ensure reject with an AbortError when cancelled ([#47](https://github.com/KATT/raf-query/issues/47))

### Bug Fixes

- **react:** qc.fetch / qc.ensure reject with an AbortError when cancelled ([#47](https://github.com/KATT/raf-query/issues/47)) ([53aa90b](https://github.com/KATT/raf-query/commit/53aa90b4b6068cff3998b189d3d563f338a3e564))

### Performance Improvements

- **react:** browser build of the TanStack Router integration ([#48](https://github.com/KATT/raf-query/issues/48)) ([75e78cf](https://github.com/KATT/raf-query/commit/75e78cf968c069188a2688ad3298fb4bee2e3b8c))

## [0.1.16](https://github.com/KATT/raf-query/compare/0.1.15...0.1.16) (2026-10-13)

### Bug Fixes

- stale data always refreshes when switching pages ([#49](https://github.com/KATT/raf-query/issues/49)) ([68652cd](https://github.com/KATT/raf-query/commit/68652cdf6ea06ef86d277329098ee294dba98f21))

## [0.1.15](https://github.com/KATT/raf-query/compare/0.1.14...0.1.15) (2026-10-13)

- **tooling:** list a fixture app's modules by size ([#45](https://github.com/KATT/raf-query/issues/45)) ([0e1f899](https://github.com/KATT/raf-query/commit/0e1f899f2fecc1368f9be71a2c78e3efd2f3783b))

## [0.1.14](https://github.com/KATT/raf-query/compare/0.1.13...0.1.14) (2026-10-13)

### Performance Improvements

- **core:** mark top-level Effect constructors pure ([#46](https://github.com/KATT/raf-query/issues/46)) ([9fb7f76](https://github.com/KATT/raf-query/commit/9fb7f76fb3dad5e5fa4566de011727ce46ac3bbc))

## [0.1.13](https://github.com/KATT/raf-query/compare/0.1.12...0.1.13) (2026-10-13)

### Bug Fixes

- **deps:** make effect a peer dependency ([#40](https://github.com/KATT/raf-query/issues/40)) ([f172515](https://github.com/KATT/raf-query/commit/f17251515788e2aaf243cce33e5af09bf87db59e))

## [0.1.12](https://github.com/KATT/raf-query/compare/0.1.11...0.1.12) (2026-10-13)

### Features

- **tooling:** lay out StackBlitz copies as apps/ and packages/ ([#42](https://github.com/KATT/raf-query/issues/42)) ([b171751](https://github.com/KATT/raf-query/commit/b1717514bf75a38043a4fe028ca95b0edc8f4ad6))

## [0.1.11](https://github.com/KATT/raf-query/compare/0.1.10...0.1.11) (2026-10-13)

### Features

- **tooling:** StackBlitz copies as pnpm workspaces, synced by an Effect program ([#41](https://github.com/KATT/raf-query/issues/41)) ([bb48c5d](https://github.com/KATT/raf-query/commit/bb48c5d3f7332bad6c56cc6cb6c3cd27fde6163a)), references [#38](https://github.com/KATT/raf-query/issues/38) [webcontainer-core#1169](https://github.com/webcontainer-core/issues/1169) [TanStack/router#7480](https://github.com/TanStack/router/issues/7480)

## [0.1.10](https://github.com/KATT/raf-query/compare/0.1.9...0.1.10) (2026-10-13)

- **stackblitz:** wait for the released version on npm ([#39](https://github.com/KATT/raf-query/issues/39)) ([18d5f86](https://github.com/KATT/raf-query/commit/18d5f8659c61c1571bc104a6142e5d1d714df325))

## [0.1.9](https://github.com/KATT/raf-query/compare/0.1.8...0.1.9) (2026-10-13)

- **examples:** open the examples in StackBlitz ([#38](https://github.com/KATT/raf-query/issues/38)) ([b4e1b64](https://github.com/KATT/raf-query/commit/b4e1b644057cf2acb96ca077d0a79e2757fec305))

## [0.1.8](https://github.com/KATT/raf-query/compare/0.1.7...0.1.8) (2026-10-13)

### Features

- **examples:** infinite scroll, root dev scripts, readable request names; README and tests cover pagination and infinite scroll ([#37](https://github.com/KATT/raf-query/issues/37)) ([2c3bed6](https://github.com/KATT/raf-query/commit/2c3bed630fd08d0a59686a6f5f14aecba1ff2e1b))

## [0.1.7](https://github.com/KATT/raf-query/compare/0.1.6...0.1.7) (2026-10-13)

- validate search params with a zod schema in the README ([#36](https://github.com/KATT/raf-query/issues/36)) ([9142236](https://github.com/KATT/raf-query/commit/9142236f611deb0fdf9db5f7e2847bccad89e841))

## [0.1.6](https://github.com/KATT/raf-query/compare/0.1.5...0.1.6) (2026-10-12)

- one file per decision, and alternatives in the PR template ([#34](https://github.com/KATT/raf-query/issues/34)) ([e60d30b](https://github.com/KATT/raf-query/commit/e60d30bc99452eec7178fa2a6c7598987fe5254c)), references [#24](https://github.com/KATT/raf-query/issues/24) [#25](https://github.com/KATT/raf-query/issues/25) [#26](https://github.com/KATT/raf-query/issues/26) [#27](https://github.com/KATT/raf-query/issues/27) [#28](https://github.com/KATT/raf-query/issues/28) [#33](https://github.com/KATT/raf-query/issues/33) [#26](https://github.com/KATT/raf-query/issues/26) [#N](https://github.com/KATT/raf-query/issues/N) [#26](https://github.com/KATT/raf-query/issues/26) [#16](https://github.com/KATT/raf-query/issues/16) [#23](https://github.com/KATT/raf-query/issues/23) [#31](https://github.com/KATT/raf-query/issues/31) [#19](https://github.com/KATT/raf-query/issues/19) [#28](https://github.com/KATT/raf-query/issues/28) [#33](https://github.com/KATT/raf-query/issues/33)

## [0.1.5](https://github.com/KATT/raf-query/compare/0.1.4...0.1.5) (2026-10-12)

- measure bundle size against TanStack Query ([#33](https://github.com/KATT/raf-query/issues/33)) ([51606b3](https://github.com/KATT/raf-query/commit/51606b3be47a9a078fc4a81355fd952861f51d81)), references [pre-#23](https://github.com/pre-/issues/23) [#23](https://github.com/KATT/raf-query/issues/23) [Pre-#23](https://github.com/Pre-/issues/23)

## [0.1.4](https://github.com/KATT/raf-query/compare/0.1.3...0.1.4) (2026-10-12)

### Features

- **core:** add per-query meta ([#26](https://github.com/KATT/raf-query/issues/26)) ([863c915](https://github.com/KATT/raf-query/commit/863c915d884bdfa3bcb3053da348d51aa0e697cf))

## [0.1.3](https://github.com/KATT/raf-query/compare/0.1.2...0.1.3) (2026-10-12)

### Features

- **core:** cancel requests nobody reads anymore ([#27](https://github.com/KATT/raf-query/issues/27)) ([c3c1e4b](https://github.com/KATT/raf-query/commit/c3c1e4bb9250164b6df17d7d4b7bd4043f908961))

## [0.1.2](https://github.com/KATT/raf-query/compare/0.1.1...0.1.2) (2026-10-12)

### Features

- add isFetching(filter?) and useIsFetching(filter?) ([#25](https://github.com/KATT/raf-query/issues/25)) ([70c3b98](https://github.com/KATT/raf-query/commit/70c3b981027f717b1d619d5a2b23822f685c032a))

## [0.1.1](https://github.com/KATT/raf-query/compare/0.1.0...0.1.1) (2026-10-12)

### Features

- **core:** add predicate to QueryFilter ([#24](https://github.com/KATT/raf-query/issues/24)) ([c0b9c18](https://github.com/KATT/raf-query/commit/c0b9c1829cb3b6446f765b151e520f0195af5276))

## [0.1.0](https://github.com/KATT/raf-query/compare/0.0.19...0.1.0) (2026-10-12)

### ⚠ BREAKING CHANGES

- Effect-native engine; core exposes only Effect APIs ([#23](https://github.com/KATT/raf-query/issues/23))
- **core:** make QueryObserver an Effect-style data type ([#29](https://github.com/KATT/raf-query/issues/29))

- **core:** make QueryObserver an Effect-style data type ([#29](https://github.com/KATT/raf-query/issues/29)) ([50fbb45](https://github.com/KATT/raf-query/commit/50fbb45bf3edcaa83673e2177894a76bdf76560b))
- Effect-native engine; core exposes only Effect APIs ([#23](https://github.com/KATT/raf-query/issues/23)) ([8e0bb09](https://github.com/KATT/raf-query/commit/8e0bb09a63d644ede053f443406a521ff2613a6f))

### Features

- **core:** stream SSR dehydration as Effect APIs; integrations become thin edges ([#30](https://github.com/KATT/raf-query/issues/30)) ([6b2b570](https://github.com/KATT/raf-query/commit/6b2b5703f5463c0f3805c233cf4ead90df9efb76)), references [#29](https://github.com/KATT/raf-query/issues/29)
- typed services for Effect queries; QueryClient layer and dispose() ([#31](https://github.com/KATT/raf-query/issues/31)) ([6aeaa3d](https://github.com/KATT/raf-query/commit/6aeaa3d356f6483654729620ac26762508eb8fd8))

## [0.0.19](https://github.com/KATT/raf-query/compare/0.0.18...0.0.19) (2026-10-12)

### Features

- **core:** type the cache's promises as Thenable ([#21](https://github.com/KATT/raf-query/issues/21)) ([c0541b0](https://github.com/KATT/raf-query/commit/c0541b0c14e687f25d47f25fe457e49b135d8c06))

## [0.0.18](https://github.com/KATT/raf-query/compare/0.0.17...0.0.18) (2026-10-12)

### Bug Fixes

- **core:** allow undefined query data ([#22](https://github.com/KATT/raf-query/issues/22)) ([9b85e57](https://github.com/KATT/raf-query/commit/9b85e57bf2fed4413cdbc1b49f925cc60dad695f)), references [#20](https://github.com/KATT/raf-query/issues/20)

## [0.0.17](https://github.com/KATT/raf-query/compare/0.0.16...0.0.17) (2026-10-12)

### Features

- **core:** pause retries while the browser is offline ([#18](https://github.com/KATT/raf-query/issues/18)) ([a25c664](https://github.com/KATT/raf-query/commit/a25c664359fe7248cdc8d91a14d524e37b467c6c))

## [0.0.16](https://github.com/KATT/raf-query/compare/0.0.15...0.0.16) (2026-10-12)

### Bug Fixes

- **core:** don't revalidate cached data in server verbs ([#19](https://github.com/KATT/raf-query/issues/19)) ([0ed7d9f](https://github.com/KATT/raf-query/commit/0ed7d9fefd0b70a8aa9a85c8d2c309a9fed42903))

## [0.0.15](https://github.com/KATT/raf-query/compare/0.0.14...0.0.15) (2026-10-12)

- **agent-docs:** replace local ~/dev path with upstream React link ([#17](https://github.com/KATT/raf-query/issues/17)) ([79c0314](https://github.com/KATT/raf-query/commit/79c031475c3ed62ce5a07fb91d68733534e452b3))

## [0.0.14](https://github.com/KATT/raf-query/compare/0.0.13...0.0.14) (2026-10-12)

### Features

- tracked query results via a core QueryObserver, like TanStack Query ([#13](https://github.com/KATT/raf-query/issues/13)) ([7b99b47](https://github.com/KATT/raf-query/commit/7b99b4704be110c999b41277afd5dac4c515f45f))

## [0.0.13](https://github.com/KATT/raf-query/compare/0.0.12...0.0.13) (2026-10-12)

### Features

- useQuery returns data for handles from ensure ([#16](https://github.com/KATT/raf-query/issues/16)) ([a50b8fd](https://github.com/KATT/raf-query/commit/a50b8fdc51b952341377d4b55f25ebb6b21d39e1))

## [0.0.12](https://github.com/KATT/raf-query/compare/0.0.11...0.0.12) (2026-10-12)

- **examples:** move the shared db and ui packages into examples/.shared ([#14](https://github.com/KATT/raf-query/issues/14)) ([fccdc7b](https://github.com/KATT/raf-query/commit/fccdc7bb8075ce2fb0cdbe07b26b36f2ace2bd9c))

## [0.0.11](https://github.com/KATT/raf-query/compare/0.0.10...0.0.11) (2026-10-12)

### Features

- **core:** structurally share new data with the old (structuralSharing) ([#15](https://github.com/KATT/raf-query/issues/15)) ([bf4392a](https://github.com/KATT/raf-query/commit/bf4392a56936ead6fb8b2726981cb19dadf51304))

## [0.0.10](https://github.com/KATT/raf-query/compare/0.0.9...0.0.10) (2026-10-12)

- move the TanStack Query experiment into .experimental folders ([#12](https://github.com/KATT/raf-query/issues/12)) ([e9613a6](https://github.com/KATT/raf-query/commit/e9613a608f100fb17de6baf37c0f1fcfa479e909))

## [0.0.9](https://github.com/KATT/raf-query/compare/0.0.8...0.0.9) (2026-10-12)

### Bug Fixes

- **examples:** let the client pick new comment ids ([#9](https://github.com/KATT/raf-query/issues/9)) ([de3a723](https://github.com/KATT/raf-query/commit/de3a7238b2568458a9771450a8c94d82576f5f7d))

## [0.0.8](https://github.com/KATT/raf-query/compare/0.0.7...0.0.8) (2026-10-12)

- rename the TanStack Query experiment to make clear it's experimental and unpublished ([#11](https://github.com/KATT/raf-query/issues/11)) ([146c3be](https://github.com/KATT/raf-query/commit/146c3be5034f8c4c642ea9faea693a7558ca4aac))

## [0.0.7](https://github.com/KATT/raf-query/compare/0.0.6...0.0.7) (2026-10-12)

### Features

- **react:** add @raf-query/react/devtools ([#7](https://github.com/KATT/raf-query/issues/7)) ([e325d76](https://github.com/KATT/raf-query/commit/e325d76305e29f935228a2dbad6834b0309229e4))

## [0.0.6](https://github.com/KATT/raf-query/compare/0.0.5...0.0.6) (2026-10-12)

- experimental @raf-query/tanstack-react-query on TanStack Query ([#8](https://github.com/KATT/raf-query/issues/8)) ([9d909c4](https://github.com/KATT/raf-query/commit/9d909c46ca030fd465d7af0fcd9591818356dd80))

## [0.0.5](https://github.com/KATT/raf-query/compare/0.0.4...0.0.5) (2026-10-12)

- **examples:** use Zod instead of Effect Schema ([#6](https://github.com/KATT/raf-query/issues/6)) ([7068cbe](https://github.com/KATT/raf-query/commit/7068cbe95e693787f22908b0ed678f6b7b05a550))

### Bug Fixes

- **react:** HydrationBoundary defers newer data for entries already on screen ([#5](https://github.com/KATT/raf-query/issues/5)) ([881a535](https://github.com/KATT/raf-query/commit/881a53544f65e2ffe858a0d010d7109427b93d55))

## [0.0.4](https://github.com/KATT/raf-query/compare/0.0.3...0.0.4) (2026-10-12)

### Features

- @raf-query/core, @raf-query/react and the example apps ([#1](https://github.com/KATT/raf-query/issues/1)) ([3881014](https://github.com/KATT/raf-query/commit/3881014b7f07d17d733256e184b627ead1f5788b))

## [0.0.3](https://github.com/KATT/raf-query/compare/0.0.2...0.0.3) (2026-10-12)

- lint-fix staged files in pre-commit hook ([#2](https://github.com/KATT/raf-query/issues/2)) ([858a4e0](https://github.com/KATT/raf-query/commit/858a4e02563daec4c6de9a07d438f03573d0339b))

## [0.0.2](https://github.com/KATT/raf-query/compare/0.0.1...0.0.2) (2026-10-12)

### Bug Fixes

- resolve workspace packages from source ([f03a57f](https://github.com/KATT/raf-query/commit/f03a57f0d54dbd66d947a0ee97dbb762bddca970))

## 0.0.1 (2026-10-12)

- Initial release of `@raf-query/core` and `@raf-query/react` (placeholder packages; reserves the names on npm).
