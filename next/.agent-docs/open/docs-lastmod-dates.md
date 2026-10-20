---
title: How should the docs site get each page's last-modified date on Vercel's 10-commit clone?
summary: On v12.trpc.io every page's `lastmod` is the build's day; the build could deepen its clone, read dates from frontmatter, or drop the dates.
area: docs-site
recommended: B
links:
  - kind: decision
    label: docs-in-www
    url: ../decisions/docs-in-www.md
  - kind: decision
    label: site-noindex-until-trpc-io
    url: ../decisions/site-noindex-until-trpc-io.md
  - kind: code
    label: commitDates (www/build/content.ts)
    url: ../../www/build/content.ts
  - kind: code
    label: sitemap pages (www/vite.config.ts)
    url: ../../www/vite.config.ts
  - kind: code
    label: vercel-ignore's fetch (decide.ts)
    url: ../../tooling/vercel-ignore/src/decide.ts
---

# How should the docs site get each page's last-modified date on Vercel's 10-commit clone?

## Why it matters

A v12 page's date (the sitemap's `lastmod`, `article:modified_time` and JSON-LD `dateModified`) comes from git: `commitDates` in `www/build/content.ts` reads one `git log` per docs folder and skips renames. Vercel clones 10 commits deep, and a shallow clone's oldest commit adds every file, so on v12.trpc.io all 56 sitemap entries read the build's day. Nothing shows the date on the page, and the site is `noindex` until it's trpc.io, so this matters from the cutover on, when search engines read `lastmod`.

## Options

### A) Keep it as it is

```xml
<!-- https://v12.trpc.io/sitemap.xml today -->
<url><loc>https://v12.trpc.io/v12/docs/adapters/bun</loc><lastmod>2026-10-20</lastmod></url>
<url><loc>https://v12.trpc.io/v12/docs/adapters/deno</loc><lastmod>2026-10-20</lastmod></url>
```

- ✅ Nothing to build; harmless while the site is `noindex`
- ❌ Wrong after the cutover: every page looks changed on every deploy, and search engines learn to ignore the site's `lastmod`

### B) The build deepens a shallow clone before reading dates

When `git rev-parse --is-shallow-repository` says `true`, `commitDates` first fetches the deployed commit's history back to `next/`'s first commit, from the public repo, as the Vercel ignore step already fetches.

```bash
# what the build runs once, on Vercel only
git fetch --shallow-since=2026-10-09 https://github.com/trpc/trpc.git "$VERCEL_GIT_COMMIT_SHA"
```

- ✅ The same dates as a full clone, from the code that already computes them; nothing for page authors to keep up
- ✅ Measured from a 10-commit clone of `v12`: about 3 seconds and 1,100 commits
- ❌ The build depends on reaching GitHub; a failed fetch has to fall back to today's dates, not fail the build
- ❌ The cut-off date is hard-coded, or derived, and the v11 copies' dates (not in the sitemap) stay shallow

### C) Dates in frontmatter

Each page carries its date, and a lint (or `pnpm land`) bumps it when the page's body changes.

```md
---
title: Bun
description: …
updated: 2026-10-19
---
```

- ✅ No git at build time; previews and local builds agree with production
- ❌ One more line that every edit to a page changes, and that conflicts when two agents edit a page
- ❌ A date that drifts when the lint or hook doesn't run (Cloud Agents' git hooks don't)

### D) Drop the dates

No `lastmod` in the sitemap and no `dateModified`; `commitDates` goes.

```xml
<url><loc>https://trpc.io/docs/adapters/bun</loc><changefreq>weekly</changefreq></url>
```

- ✅ Simplest, and never wrong; search engines crawl without it
- ❌ Gives up a freshness signal search engines do use when it's accurate

## Recommendation

**B.** The date code (rewritten in `cd54c50f1` to one `git log` per folder) is already right on a full history, and the deepening is a few seconds, on Vercel only. It can wait until before the trpc.io cutover, since nothing reads the dates while the site is `noindex`.

## Blocked until answered

- Nothing now. Before the cutover, `lastmod` should be right or gone.

## Details

- Checked on 2026-10-20: the live sitemap's 56 `<lastmod>` are all `2026-10-20`; a full clone gives 5 pages on 2026-10-18, 67 on 2026-10-19 and 14 on 2026-10-20 (`git log -1 --follow --diff-filter=AM` per page). A 10-commit clone of `v12` deepened with `--shallow-since=2026-10-01` gives the same counts.
- `next/` starts at `887d39b00` (2026-10-09), so a fetch back to then covers every v12 page, renames included.
- Experiments' pages and the v11, v10 and v9 copies aren't in the sitemap; the copies' canonical links point at trpc.io.
