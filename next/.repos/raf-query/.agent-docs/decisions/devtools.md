# Devtools (agent)

- Ship as subpath `@raf-query/react/devtools` (like the integrations), not a separate package. Hand-written React + inline styles: no CSS file, no extra dependency, no Solid core like `@tanstack/query-devtools`.
- The entry always exports the real panel. Apps tree-shake at the call site (parent agent, 2026-10-14): Vite / TanStack Start use `import.meta.env.DEV`; Next.js uses `process.env.NODE_ENV !== "production"`. There is no `/devtools/production` entry. Example apps and the docs demos always render the panel so it stays available when deployed.
- Renders nothing until hydrated (`useSyncExternalStore` server snapshot `false`): the server's cache isn't the browser's, and `localStorage` state is read in the client-only child's `useState` initializer.
- Cache events fire synchronously, sometimes during another component's render, so `devtools-store.ts` notifies React in a microtask and caches the row snapshot per event version.
- Core gained what the panel needs: `Query.observerCountUnsafe`, `Query.isStaleUnsafe`, `Query.reset`, `reset` / `remove`, and the `observers` cache event (subscribe/unsubscribe don't otherwise emit). A suspended reader isn't counted until it commits.
