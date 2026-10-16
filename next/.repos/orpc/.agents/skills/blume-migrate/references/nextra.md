# Nextra → Blume

Nextra (on Next.js) declares navigation and per-page labels in `_meta` files — and crucially, **a folder's title and its pages' sidebar labels live in the _parent_ `_meta`**. Reconciling that cross-file inheritance is the main task. Nextra 4 was a near-rewrite, so **fingerprint the generation first** — it decides where config lives, where content lives, and what the components are called.

## Detect & fingerprint the generation

- **`_meta.{js,mjs,cjs,ts,jsx,tsx,json}`** files — the strongest fingerprint (v4 also has a single-file `_meta.global.*` variant).
- **v2/v3 (Pages Router):** content in `pages/`, `_meta.json` (v2) or `_meta.{js,ts}` (v3), a `theme.config.{js,jsx,ts,tsx}`, components from `nextra-theme-docs` (v2) or `nextra/components` (v3).
- **v4 (App Router):** **no `theme.config`** — config lives as component props in `app/layout.{jsx,tsx}` (`<Layout>`, `<Navbar>`, `<Banner>`, `<Footer>`, `<Search>`). Content is either a **`content/`** directory (with a catch-all `app/[[...mdxPath]]/page.jsx` gateway) **or** Next page files: **`app/**/page.mdx`**.
- `nextra` + `next` deps; `next.config.*` wrapping `nextra({…})`.

**v4 app-directory repos need a restructure, not a `content.root`.** Pointing `content.root` at `app/` gives every route a trailing `/page` and scans `layout.jsx`/gateway files. Move each `app/foo/page.mdx` → `foo.mdx` (or `foo/index.mdx` when it has children), and exclude the non-MDX app files. The catch-all `page.jsx`, `mdx-components.*`, and `app/layout.*` are teardown artifacts — but **harvest `app/layout.*` first** (see Config).

## Config

None of it maps automatically — read the config surface for the generation by hand and reconstruct in `blume.config.ts`:

- **v2/v3 — `theme.config.*`:** `logo` (JSX — extract text/image) → `logo`; `project.link` → `github` (renders the footer's repo link); `docsRepositoryBase` → `github` (owner/repo/branch — and any trailing sub-path → `github.dir`; if its origin is not `https://github.com`, set `github.host` to that origin — with `host` omitted, Blume builds the repository and edit links against public GitHub); `banner.text`/`banner.key` → `banner.content`/`banner.id` (`dismissible` maps); `primaryHue`/`primarySaturation` → pick an equivalent `theme.accent` color; `footer.text` (v2) / `footer.content` (v3) → `footer.copyright` when it's a copyright line: reduce the JSX to plain text, and a `{new Date().getFullYear()}` becomes `${new Date().getFullYear()}` in a template literal; anything else in it → drop (report); `faviconGlyph` → drop (Blume's favicon is a file convention); `useNextSeoProps`/head → per-page `seo` frontmatter or drop.
- **v4 — `app/layout.*` props:** the same facts moved: `<Navbar logo projectLink>`, `<Layout docsRepositoryBase editLink sidebar={{…}} toc={{…}}>`, `<Banner>`, `<Footer>` (its children are v3's `footer.content`). Map them the same way; sidebar/TOC tuning mostly drops (Blume's `toc` config covers min/max heading levels).
- **`next.config.*`:** harvest **`redirects()`** — static entries and `:param`/`:path*` patterns become Blume `redirects: [{ from, to }]` as written (`permanent: true` → `status: 308`, `false` → `307`); ones with regex params (`:slug(\d+)`) or `has`/`missing` conditions move to host config (report). A `latex: true` flag means math is in play (see Math below). Then delete the file.
- Root `_meta` entries with **`type: "page"`** → `navigation.tabs` (`{ label, path }`, where `path` is `/` for `index`, else `/<slug>`). `type: "page"` only maps at the **root**.

## Navigation: `_meta` → `meta.ts` + frontmatter

**Every `_meta` file must be carried over — always convert it to `meta.ts` + frontmatter, never drop it in favor of filename inference.** `_meta` is Nextra's canonical nav source (ordering, labels, folder titles); the filesystem alone can't reproduce it.

For each `_meta` entry (`key` = slug, value = string title or `{ title, type, display, href, theme }`):

| Nextra `_meta` entry | Blume |
| --- | --- |
| ordinary page/folder (string or `{ title }`) | slug → parent `meta.ts` `pages` (ordering). A **page** title → that page's frontmatter `sidebar.label`. A **folder** title → that child folder's `meta.ts` `title` (title lives in the parent!). A JSX title → extract its text. |
| `display: "hidden"` | frontmatter `sidebar.hidden: true` |
| `type: "separator"` | drop → recreate as a `(Group)/` folder / `meta.ts` boundary if needed |
| `type: "menu"` (navbar dropdown) | drop → recreate via `navigation.selectors` if wanted |
| `href` (external link) | root-level → **`navigation.actions`** (`[{ label, href }]`, plain header links, matching Nextra's navbar placement) or **`navigation.featured`** (`{ label, href, icon? }` — pinned above the sidebar on every route, survives on phones); only drop deep-nested ones (report) |
| `type: "page"` (subfolder, not root) | drop (only root → tabs) |
| `theme: { collapsed }` on a folder | `meta.ts` `collapsed` |
| `theme: { layout: "full" }` on a page | that page's frontmatter `mode: wide` (full column width, no table of contents — the closest match; report) |
| other `theme` keys (`sidebar: false`, `toc: false`, `typesetting`, …) | drop (report — no per-page switches for them) |
| `"*"` wildcard entry | apply its value as the default for unlisted siblings, then drop |

Write each folder's `meta.ts` with its `pages` order (from its own `_meta`) and its `title` (inherited from the parent's `_meta`). A v4 **`_meta.global.*`** file holds the whole tree in one place (folder entries carry `items`) — split it into per-folder `meta.ts` files with the same rules.

**Keep the order with `display: "group"`.** Nextra draws folders as collapsible rows and keeps pages and folders interleaved as `_meta` lists them. Blume's default `flat` display draws a folder as a plain section header, so it lists each level's pages above its subfolders — a page `_meta` puts after a folder jumps above it. Set `navigation.sidebar.display: "group"` (or `display: "group"` in the `meta.ts` of every subfolder at a level whose order must hold — one flat sibling folder reorders the level) to keep the authored order in nested folders. Groups then start closed unless they hold the current page, while Nextra opens every folder shallower than its `defaultMenuCollapseLevel` (default `2`: the top-level folders), so add `collapsed: false` to those folders' `meta.ts`. The top level (and each tab's top level) lists loose pages before folders in every display mode, so a root `_meta` that puts a page after a folder can't be matched — report it.

## Frontmatter & titles — synthesize, don't just pass through

Most Nextra pages have **no frontmatter**. Nextra keeps two titles apart: the **sidebar label** falls back `_meta` title → `sidebarTitle` → `title` → first body H1 → filename, while the **heading readers see** is the body H1. Blume renders frontmatter `title` as the page H1, so for **every page**: set frontmatter `title` from the body H1 (else frontmatter `title`, else the `_meta` title, else a humanized filename), **remove the body H1**, and set `sidebar.label` to the `_meta` title (else `sidebarTitle`) wherever it differs from `title`. Don't take the `_meta` label as `title` — that renames the page's heading. `asIndexPage: true` (v4 folder-index marker) → make the file the folder's `index.mdx` and drop the key. Drop any other non-schema key and report it.

## Components

- **Callouts:** `<Callout type="x">` → directive. Types: `default` (the prop default) → `:::note`, `info`→`:::info`, `warning`→`:::warning`, `error`→`:::danger`, `important` (v4) → `:::note`. Bare `<Callout>` → `:::note`. Drop `emoji` (there is no `title` prop to carry — Nextra callouts have none).
- **v2 flat names:** v2 exported `Tab` and `Card` (flat) from **`nextra-theme-docs`**; v3/v4 use `Tabs.Tab`/`Cards.Card` from `nextra/components`. Handle both: `<Cards>`/`<Cards.Card>`/`<Card>` → `<CardGroup>`/`<Card>`; `<Tabs items={[…]}>` + `<Tabs.Tab>`/`<Tab>` → `<Tabs>`/`<Tab title="…">` (move labels from the parent `items` onto each `<Tab>`). `Cards` `num` → `CardGroup` `cols`.
- **`<Steps>`:** Nextra's wraps **Markdown headings (h2–h6)**, one step per heading. Convert each heading to a `<Step title="…">` child (Blume `<Steps>`/`<Step>`) and delete the heading — this also keeps step titles out of the TOC, matching Nextra's behavior.
- **`<FileTree>`/`<FileTree.Folder>`/`<FileTree.File>`** → `<Tree>`/`<Tree.Folder>`/`<Tree.File>` (or a list-driven `<FileTree>`).
- **`<Bleed>`** (full-bleed) → no equivalent; drop the wrapper and report. **`<Table>`** → a plain Markdown table. **`<Banner>`** (v4, in layout) → the `banner` config.
- **GitHub alert blockquotes** (v4 renders them): `> [!NOTE]`/`[!TIP]`/`[!WARNING]`/`[!IMPORTANT]`/`[!CAUTION]` pass through in `.mdx`, where Blume renders them as note/tip/warning/note/danger callouts. In a `.md` page they stay plain quotes (`BLUME_MD_GITHUB_ALERT`): rename it to `.mdx`.
- **Strip or convert every import:** `nextra`, `nextra/*`, `nextra-theme-docs`, `nextra-theme-blog`, plus `next/image` (→ Markdown image or `<Frame>`), `next/link` (→ plain link), and local components (port or inline; report).

## Code fences

Nextra's fence meta differs from Blume's — rewrite it: `filename="app.js"` → a space-separated title (` ```js app.js `); `showLineNumbers` → `lineNumbers` (`BLUME_CODE_FENCE_OPTION` flags either one left); line highlighting `{1,4-5}` carries over unchanged; **drop** word-highlight `/word/` and `copy`/`copy=false`. **Keep** inline-code `{:lang}` suffixes (`` `useState(){:js}` ``) — Blume highlights them natively. ` ```sh npm2yarn ` fences → ` ```package-install `.

## Math

Nextra enables math via `nextra({ latex: true })` (KaTeX or MathJax). In Blume, block math `$$…$$` renders in `.mdx` with **no config** (there is no `markdown.math` field). Convert Nextra's ` ```math ` fences → `$$…$$` blocks (they render as plain code blocks otherwise). Inline math is `$$…$$` too: a single `$` stays literal, so convert each inline `$…$` to `$$…$$` inside its sentence. MathJax-specific macros → report.

## i18n

- **v2/v3:** locale **file suffixes** (`index.en.mdx`, `index.zh.mdx`) + `i18n` in `next.config` → match Blume's `dot` parser as-is, default-locale suffix included: `i18n: { defaultLocale, locales: [{ code, label }], parser: "dot" }`, no file moves. Page titles land in each file's own frontmatter, so they stay per-locale, but under `dot` a folder's `meta.ts` serves every locale — build it from the default locale's `_meta` and report translated folder titles from the other locales' `_meta` files.
- **v4:** every locale has a `content/<lang>/` dir, the default included, and Nextra serves every locale under its prefix (`/en/…`). Blume's `dir` parser takes the other locales' dirs as-is, but the default locale lives **at the content root**: a `content/en/` dir is ordinary content that publishes at `/en/…` and warns `BLUME_I18N_DEFAULT_LOCALE_FOLDER`. Move the default locale's files (and `_meta`-derived `meta.ts` files) up one level, and set `i18n.hideDefaultLocalePrefix: false` to keep serving them at `/en/…` as Nextra did — or keep Blume's unprefixed default and add a `redirects` entry per page.

## Package.json & teardown

Repoint `dev`/`build`/`start` scripts to the Blume CLI; remove `next`/`nextra`/`nextra-theme-*` deps and add `blume`. Delete after harvesting: `next.config.*` (redirects first!), `theme.config.*` (v2/v3), `app/layout.*` + the catch-all gateway + `mdx-components.*` (v4).

## Dropped — report these

Footer content other than a copyright line; `primaryHue`-style theming beyond an accent color; `faviconGlyph`; `_meta` separators, menus, `newWindow`; per-page `theme` switches (and `layout: "full"` approximated as `mode: wide`); root-level pages `_meta` ordered after a folder; `<Bleed>`; MathJax macros; word-highlight/copy fence meta; any icon you can't reconstruct as a Lucide name.
