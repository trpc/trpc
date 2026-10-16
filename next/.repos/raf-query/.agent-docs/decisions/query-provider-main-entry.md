# QueryProvider on the main entry (human asked)

Human, after `HydrationBoundary` moved: "Do same for query provider if possible".

- **`import { QueryProvider } from "@raf-query/react"`**, exported from `index-shared.ts`, so both the default and the `react-server` entry have it. It's a `"use client"` component, so a server component layout and a client component import the same module; no condition needed.
- **`@raf-query/react/rsc` is removed**; nothing was left in it. This reverses "/rsc is better" from [rsc-only-hydration.md](./rsc-only-hydration.md), which was about `/rsc` vs `/next`, at the human's request.
- **No payload:** `browser-requests.ts` was already reachable from `useQuery` / `useWaterfall`. `examples/nextjs` client JS has the same raw bytes (gzip 2 B smaller), `examples/react-router` is byte-identical and contains no `QueryProvider`, and `pnpm bundle-size` (src and `--dist`) prints the same numbers.
- Lost: a separate entry that said "this is the RSC provider". The name and the docs (`react-server-components.md`, API reference) say it instead, next to `QueryClientProvider`.
