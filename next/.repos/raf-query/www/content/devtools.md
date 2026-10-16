---
title: Devtools
description: Inspect the browser's query cache as it changes, refetch, invalidate, reset or remove entries, and keep the panel out of production bundles.
section: Reference
order: 1
---

`@raf-query/react/devtools` shows the browser's query cache as it changes. Render `QueryDevtools` anywhere under the provider, and only mount it in development so bundlers drop the panel from production builds.

On Vite and TanStack Start, use `import.meta.env.DEV`:

```sample
tanstack-start/src/docs/devtools.tsx#intro
```

On Next.js, use `process.env.NODE_ENV !== "production"` instead — see [React Server Components](./react-server-components.md). Either check is replaced at build time, so the production branch is empty and the panel's code is tree-shaken. Omit the element (or the whole import) whenever you don't want the panel — there is no separate production entry.

In Next.js, put it inside `QueryProvider` in the root layout. It's a client component, so a server component layout can render it.

Every demo on this site has a **Devtools** tab in its expanded view, showing the demo's own cache. The [example apps](./examples.md) always render `<QueryDevtools />`, so the panel is available in the deployed demos as well as in local `dev`.

## The panel

A button in the corner opens a panel docked to the edge of the viewport. The panel lists every entry with its observer count (mounted readers) and status:

| Status     | Meaning                                    |
| ---------- | ------------------------------------------ |
| `fetching` | A request is in flight                     |
| `error`    | The last request failed                    |
| `stale`    | Read, and older than `staleTime`           |
| `fresh`    | Read, and within `staleTime`               |
| `inactive` | Nothing reads it; it's removed at `gcTime` |

Select an entry to see its key, input, meta, data, error and last update, and to act on it:

- **Refetch** it now.
- **Invalidate** it: mark it stale, refetching it if it's read.
- **Reset** it: drop its data, so readers suspend and refetch.
- **Remove** it from the cache.

The header filters entries by key, sorts them, and has **Invalidate all** and **Clear cache**. The panel keeps its open state and size in `localStorage`.

## Props

All optional:

| Prop             | Values (default first)                                         |
| ---------------- | -------------------------------------------------------------- |
| `client`         | The nearest `QueryClientProvider`'s client, or another one     |
| `initialIsOpen`  | `false`, `true`. Applies until the user opens or closes it     |
| `buttonPosition` | `"bottom-right"`, `"bottom-left"`, `"top-right"`, `"top-left"` |
| `position`       | `"bottom"`, `"top"`, `"left"`, `"right"`: the docked edge      |
| `theme`          | `"system"`, `"dark"`, `"light"`                                |

## Embedding the panel

`QueryDevtoolsPanel` is the panel alone, to place in your own layout. It takes `client`, `theme`, `style`, and `onClose`, which adds a close button.

```tsx twoslash
import { QueryDevtoolsPanel } from "@raf-query/react/devtools";
// ---cut---
function Panel() {
	return <QueryDevtoolsPanel style={{ height: 400 }} theme="dark" />;
}
```

Both components render nothing on the server, since the server's cache isn't the browser's.
