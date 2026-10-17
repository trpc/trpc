# TanStack Query code in the docs compiles too (human asked for a side-by-side)

- `comparison.md` ("Coming from TanStack Query") has a "Loading data" section: which loader verb to pick (`ensure`, `prefetch`, browser-only queries, `useWaterfall` last), reading the thenable's `status` as TanStack's non-suspending `data`, and a side-by-side of one browser-only query.
- The TanStack half is a `sample` fence like the raf-query half (`tanstack-start/src/docs/comparison.tanstack.tsx`), so `@samples/tanstack-start` depends on `@tanstack/react-query` (pinned to the vendored version). Lost: a plain, unchecked `tsx` fence, which the Twoslash rule doesn't allow.
- `api-reference.md` links the section from `useQuery` and the `Thenable<T>` row (`#reading-without-suspense`).
