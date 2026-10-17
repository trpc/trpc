# raf-query docs

The documentation site at [raf-query.katt.dev](https://raf-query.katt.dev): a TanStack Start app, prerendered to static HTML, that loads its own pages with raf-query.

```sh
pnpm dev        # http://localhost:3004
pnpm build      # static site in dist/client
pnpm start      # serve the build
```

## Writing pages

Pages are `content/<slug>.md`, served at `/docs/<slug>`:

```md
---
title: Polling
description: One sentence for search results and social cards.
section: Guides # one of `sections` in src/site.ts
order: 16 # position in the section
---
```

- Link other pages as `./slug.md` or `./slug.md#heading`. The build fails on a link to a page or heading that doesn't exist.
- `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]` and friends render as callouts.
- A code fence can take a title: ` ```sh title="Terminal" `.

### Types in code blocks

Every `ts` / `tsx` block is compiled with [Twoslash](https://twoslash.netlify.app): hovering a name shows its type, as in an editor, and a compile error the block doesn't expect fails the build, so the samples stay correct as the API changes. A block is one of two kinds.

**A `sample` fence** shows part of a file of a sample app. Its one line is the file's path from `samples/` and a region:

````md
```sample
tanstack-start/src/docs/window-focus-refetching.per-query.ts#per-query
```
````

```ts
// samples/tanstack-start/src/docs/window-focus-refetching.per-query.ts
import { type QueryHandle, useQuery } from "@raf-query/react";
import { settingsQuery } from "~/queries.ts";

declare const loaderData: { settings: QueryHandle<typeof settingsQuery> };

// #region per-query
const [settings] = useQuery(settingsQuery, loaderData.settings, {
	refetchOnWindowFocus: false,
});
// #endregion
```

- The page shows the lines between `// #region per-query` and `// #endregion`, dedented. A region can come in several parts, which show together (a `"use client"` part at the top of the file, then the component), and regions can nest. Without `#name`, the page shows the whole file.
- The whole file compiles in its app, with every other file of the app, so it sees what `tsc` sees: the route tree, the router context, the app's `Register`. `Route.useLoaderData()` in a route file has its loader's types.
- A block that is a file of the app, like a route the page walks through, is that file: `tanstack-start/src/routes/posts.$slug.tsx#route`. Its title is its path in the app (`src/routes/posts.$slug.tsx`). `title="…"` on the fence sets another one, `title=""` none.
- The rest of a page's blocks are in `src/docs/<page>.ts` or `.tsx`, a region per block, named after its section. Blocks whose setup can't share a file (two `Route`s, a different `declare` of the same name) go in `src/docs/<page>.<region>.ts`. These files get no title.
- `// ^?` under a line pins the type of the name above it. A `// ^?` outside the region isn't shown.
- `// @ts-expect-error -- 2345: why` above a line shows the block's expected error 2345 on it, in place of the comment.

**A `twoslash` fence** is written inline, for a block that stands on its own: it imports packages, never a file (`~/…`, `./…`), and the build fails if it does. It compiles with `tanstack-start`'s compiler options and `node_modules` but none of the app's files. A block that needs a route, a query of the app or a stub is a `sample`.

````md
```ts twoslash
import { useIsFetching } from "@raf-query/react";
// ---cut---
const savingComments = useIsFetching({ queryKey: ["comments"] });
```
````

- Code above `// ---cut---` compiles but isn't shown.
- `// ^?` and `// @errors: 2345` work as in Twoslash.

In both kinds, `// ---collapse---` and `// ---/collapse---`, each on its own line, fold the lines between them. The page shows “N collapsed lines”; a click opens the lines and another click closes them. Copy still copies those lines, and a page's markdown for agents includes them without the markers.

In both kinds, the page's markdown for agents drops the hidden code and markers, and each `// ^?` becomes a comment with its type. Twoslash needs TypeScript's JavaScript API, which TypeScript 7 doesn't have, so it runs on `typescript6` (TypeScript 6).

Compiling every block is most of a build, so each result is kept in `node_modules/.cache/twoslash`, one file per block. A build, the dev server and CI read it back when nothing the block was compiled from changed: the block, its compiler options, every file of its app, `pnpm-lock.yaml` (for installed packages) and each other file its program read, such as `packages/react/src`. Vercel keeps `node_modules` between builds, and CI's Build www job keeps the directory in the Actions cache. The build logs how many blocks came from the cache. Delete the directory to compile everything again.

Code outside the pages imports a region instead of writing a fence: `import hero from "sample:tanstack-start/src/routes/blog.$slug.tsx#hero"` gives `hero.segments`, the region rendered as a `sample` fence renders it (the homepage's walkthrough does this).

The sample apps are workspace packages in `samples/`: `tanstack-start` (`@samples/tanstack-start`) for the pages built on TanStack Start, `tanstack-start-effect` (`@samples/tanstack-start-effect`) for the Effect pages, `nextjs` (`@samples/nextjs`) for the React Server Components page, and `react-router` (`@samples/react-router`, with `app/` in place of `src/`) for the React Router page. Each declares the dependencies its files import, `pnpm typecheck` runs its `tsc`, and `pnpm lint` lints it (`src/docs/` files are page fragments, so some app rules are off there). The build regenerates their route trees and React Router's route types (`react-router typegen`).

## Demos

A fenced `demo` block embeds a live demo:

````md
```demo
polling
```
````

The name is a file in `src/demos/`, which default-exports `defineDemo({ Component, server, title, hint })`. A demo talks to a fake server from `createFakeServer` (`src/demo-kit/server.ts`) instead of the network, and gets its own query client, a network panel, a cache panel and an expanded view with the devtools.

- To compare ways of doing the same thing, pass `variants` (each a `Component`, `server`, `label` and `description`) instead of `Component` and `server`. The frame shows a switch and gives each variant its own client. Every variant opened stays mounted in a hidden `<Activity>`, so switching back finds its page and requests as they were.
- `DemoRouter` (`src/demo-kit/router.tsx`) runs a TanStack Router route tree in the demo's browser window, on a memory history, with the client as `context.queryClient`. Its Reload starts the variant over on the same URL. `DemoBrowser` is a smaller hand-rolled router that the other demos use.
- The docs site registers its own router type, so demo routes name theirs: `route.useLoaderData<typeof router>()`, and `Link` with all its type parameters. See `src/demos/starting-queries.tsx`.
- Demos have no tests: the docs site's presentation isn't unit tested. `pnpm test` runs the build's tests (`build/*.test.ts`): sample expansion and code folding.

## For agents

Every page is also markdown, for coding agents and chat assistants:

- `/docs/<slug>.md` is the page's markdown. Links point at the other pages' markdown, and each demo becomes a link to the web page and the demo's code.
- A page's own URL answers with the markdown when the request's `Accept` header has `text/markdown`, as agents like Claude Code send. Browsers get HTML from the same URL, and the response has `Vary: Accept`.
- `/llms.txt` ([llmstxt.org](https://llmstxt.org)) lists every page, `/llms-full.txt` has every page in one file, and `/` with `Accept: text/markdown` answers with `llms.txt`.
- HTML pages link their markdown with `<link rel="alternate" type="text/markdown">` and a `Link` header, and have "Copy page", "Markdown", "Ask ChatGPT" and "Ask Claude" buttons.

```sh
curl -H 'Accept: text/markdown' http://localhost:3004/docs/caching
```

`build/content.ts` writes these files and serves them in `pnpm dev` and `pnpm start`.

## Deploying

The Vercel project's root directory is `www`. `vercel.json` sets the install and build commands. The build ends with `build/vercel-output.ts`, which writes [Build Output](https://vercel.com/docs/build-output-api/v3) to `.vercel/output`: the static files, cache headers, redirects and the `Accept: text/markdown` routes. `vercel.json` rewrites can't do this, because they only run when no file matches the URL. Vercel needs Node 24 (the root `package.json`'s `engines`) and pnpm from `packageManager` (set `ENABLE_EXPERIMENTAL_COREPACK=1`).
