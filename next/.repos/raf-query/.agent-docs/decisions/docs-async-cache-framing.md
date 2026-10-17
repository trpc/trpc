# Docs frame the cache as async data, not server-state-only (human asked)

- The guide formerly titled "Server state and client state" (`www/content/client-state.md`) undersold the cache: it said raf-query is only for data a backend owns.
- Rewrite: the cache is for **asynchronous data** — backend data and browser-only async work (`enabled: typeof window !== "undefined"`: push subscription, permission, service worker). Synchronous UI state still stays in `useState` / URL / a small store.
- Title is now "What belongs in the cache"; slug stays `/docs/client-state`.
- Cross-links: overview "Where next", comparison "What's different", factory and defaults tables list `ssr`, SSR guide leads with push as the motivating example.
- Lost: the classic TanStack Query "server state vs client state" title as the page's own framing (the split still appears in the table).
