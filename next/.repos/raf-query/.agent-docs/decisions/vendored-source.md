# Vendored TanStack source

- `vendor-src` manages `.repos/` from `vendor-src.json` (`postinstall`: `vendor-src check`).
- `@tanstack/react-query@5.104.1` → `.repos/query`, `@tanstack/react-router@1.170.42` → `.repos/router`. Mechanism reference for raf-query.
- Read those trees for how caches, observers, hydration, and router SSR actually work; don’t invent parallel APIs from memory.
