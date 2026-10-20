---
title: How should `pnpm docs:dev` start on an empty Twoslash cache?
summary: On an empty cache the dev manifest compiles every Twoslash block in one process, Vite's 60 s runner timeout 500s, and the page stays 500 until a restart.
area: docs-site
recommended: B
links:
  - kind: decision
    label: www-build-speed
    url: ../decisions/www-build-speed.md
  - kind: code
    label: docsContent's manifest (www/build/content.ts)
    url: ../../www/build/content.ts
  - kind: code
    label: parsing and renderMarkdown (www/build/markdown.ts)
    url: ../../www/build/markdown.ts
  - kind: code
    label: Twoslash cache dir (www/vite.config.ts)
    url: ../../www/vite.config.ts
  - kind: code
    label: docs:dev in the README
    url: ../../README.md
---

# How should `pnpm docs:dev` start on an empty Twoslash cache?

## Why it matters

In dev, `virtual:docs-manifest` (the nav, search and SEO list) renders every page in-process, Twoslash included, because `building` is false and the build's render pool isn't used. With a warm `www/node_modules/.cache/twoslash` that's quick. With an empty one (a fresh clone, a new worktree or VM, or a big dependency change), the manifest compiles every v12 docs block on one thread, and Vite's SSR module runner gives up on `fetchModule` after 60 s. Every page 500s with `{"status":500,"unhandled":true,"message":"HTTPError"}`. The same failure keeps coming back after the compile goes on in the background, until the dev server restarts. `pnpm docs:build` doesn't hit this: it renders in child processes and has no runner timeout.

## Options

### A) Keep it as it is, and document it

The README tells a fresh checkout to fill the cache with a build first, and to restart a dev server that started cold.

```md
- `pnpm docs:dev`: the docs site at http://localhost:3012, reloading as `www/docs/` changes.
  On an empty Twoslash cache (a fresh clone), run `pnpm docs:build` once first (about 4 minutes);
  a dev server that started cold answers 500 until it's restarted.
```

- ✅ Nothing to build; CI and Vercel keep their caches, so only local first runs see it
- ❌ The first thing a new contributor or agent sees is a 500 with no hint, and restarting doesn't help until the cache is full
- ❌ Vite builds the runner's transport without a timeout option, so the 60 s can't be raised from `vite.config.ts`

### B) In dev, the manifest doesn't run Twoslash

The manifest only needs each page's frontmatter, headings, anchors and links, which `parsing()` in `www/build/markdown.ts` already produces before any highlighting (`anchorsOf` uses it). In dev, the manifest reads pages with it, and a page's module compiles only that page's blocks when it's requested. Builds don't change.

```ts
// www/build/content.ts, in dev only
const outline = (source: Source) =>
  building ? render(source) : run(outlineDoc(source)); // parsing(), no Shiki or Twoslash

async function manifest() {
  const pages = await Promise.all(
    sources.map(async (source) => ({
      order: source.frontmatter.order,
      page: await outline(source),
    })),
  );
  // brokenLinks and experimentPageProblems run on the outlines, as now
}
```

- ✅ The first request answers within seconds on any cache; a cold page compiles its own blocks (9 at most, in `server/effect.md` and `client/errors.md`)
- ✅ Dev still reports broken links and headings, which come from the parse, not from Twoslash
- ❌ A second path for the manifest in dev, which has to stay in step with `renderDoc`'s fields
- ❌ A block that doesn't compile shows up on its page in dev, not on the first request

### C) B, and dev warms the cache in the background

As B, and `configureServer` also starts the build's render pool over every page, without awaiting it, so later pages open warm.

```ts
configureServer(server) {
  void run(warmTwoslashCache(sources)); // renderPool, one process per core
}
```

- ✅ After a few minutes every page is warm, as after a build
- ❌ A cold warm-up peaks at several GB resident (the build's pool, per `www-build-speed`), next to the editor and other dev servers
- ❌ Burns all cores at every cold start, including when only one page is being edited

## Recommendation

**B.** It removes the 60 s limit from the dev manifest instead of working around it, keeps dev's link checks, and costs a cold page only its own blocks. C can come later if cold pages feel slow.

## Blocked until answered

- Nothing. Until then, run `pnpm docs:build` once on a fresh checkout before `pnpm docs:dev`.

## Details

- Reproduced on 2026-10-20 without touching the shared cache: a dev server on port 3099 in a private mount namespace, with an empty directory bind-mounted over `www/node_modules/.cache`.
- The first `GET /v12/docs/server/procedures` answered 500 after 89 s. The log shows `transport invoke timed out after 60000ms` on `fetchModule` for `/@id/__x00__virtual:docs-manifest`, imported by `www/src/content/docs.ts`.
- The next request took 276 s and failed the same way. After that every request failed in under half a second with the same invoke id, while the cache kept filling in the background: 210 entries after about 8 minutes, against 584 in a warm one.
- Restarts (from other edits under `www/`) timed out again on the manifest, with one request hanging for 300 s.
- The timeout is `transport.timeout ?? 6e4` in Vite's `module-runner.js`, and `createServerModuleRunner` passes only `{ channel }` to `createServerModuleRunnerTransport`, so only a patched Vite could raise it.
- The v12 docs have 202 Twoslash blocks. A cold one-thread build spent 883 s in the transform (`www-build-speed`), the in-process cost the dev manifest pays.
