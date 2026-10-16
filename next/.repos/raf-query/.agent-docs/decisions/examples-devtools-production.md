# Example apps always mount QueryDevtools (agent)

- Both example apps render `<QueryDevtools />` from `@raf-query/react/devtools` with no `NODE_ENV` guard (parent agent, 2026-10-14), so the panel is in deployed demos and in local `dev`. Ordinary apps omit the element in production to tree-shake it — see [devtools.md](./devtools.md).
