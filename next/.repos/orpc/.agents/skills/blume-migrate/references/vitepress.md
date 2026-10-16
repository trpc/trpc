# VitePress → Blume

VitePress is a Vue/Vite static site generator. Its config is a module in `.vitepress/`, navigation is **declared in `themeConfig.sidebar`**, every `.md` page compiles as a **Vue single-file component** (so it can hold Vue components, `{{ }}`, and `<script setup>`), and its Markdown is markdown-it plus VitePress plugins. Watch for five traps:

- **Containers are written `::: tip`, with a space.** Blume renders that as literal text, and warns (`BLUME_DIRECTIVE_SPACED_NAME`) only for a callout name in `.mdx`. Inside an open `:::` container, the same line closes the container and its text is dropped (`BLUME_DIRECTIVE_CLOSING_TEXT`). Directives are also MDX-only.
- **Every page is `.md`, but most need to be `.mdx`.** A page with a callout, component, or math must be renamed, and MDX is stricter than Vue templates.
- **URLs end in `.html` by default** (`cleanUrls: false`), so every page needs a redirect.
- **The heading is the body `# H1`, not frontmatter.**
- **Pages missing from the sidebar are hidden in VitePress.** In Blume they appear unless you hide them.

Scope: VitePress 1.x. Notes marked **2.0** cover `2.0.0-alpha.*`.

## Detect

- **A `.vitepress/` directory** holding `config.{js,ts,mjs,mts}` (or `config/index.*`), usually `docs/.vitepress/`. The directory that holds `.vitepress/` is the VitePress **project root**: the argument to `vitepress dev <dir>` in the scripts.
- **A `vitepress` dependency**, often only in the docs package's `package.json`.
- **Not VuePress**, which uses `.vuepress/` and `vuepress`/`@vuepress/*` deps (`references/vuepress.md`).

**Where the Blume project goes.** VitePress has a project root, a `srcDir` (the pages, default `.`), and a public directory that is always `<srcDir>/public`. Blume serves `public/` from the directory holding `blume.config.ts`. Two layouts are common:

- The scripts run `vitepress dev docs` from the repo root. Put `blume.config.ts` at the repo root; the default `content.root: "docs"` matches (append `srcDir` if one is set). Move `docs/public/` to `public/`.
- `docs/package.json` runs `vitepress dev`. Put `blume.config.ts` in `docs/`, set `content.root: "."`, and scope `include`/`exclude` (`references/monorepo.md` §1). `public/` stays put, but exclude it (VitePress sites keep `.md` there behind `srcExclude`), along with `node_modules`.

## Run the codemod first

Build the source once (`vitepress build <root>`) and copy `.vitepress/dist` outside the repo (`<old build>` below; skip the build if the user already made one): it's your old URL list, the old heading ids, and the record of what the live site rendered, and Teardown deletes `.vitepress/`. Then, on the VitePress source directory (Blume's `content.root`), dry-run and apply the bundled codemod:

```bash
node <skill>/scripts/vitepress-codemod.mjs <srcDir>          # report only
node <skill>/scripts/vitepress-codemod.mjs --write <srcDir>  # apply
node <skill>/scripts/vitepress-codemod.mjs --redirects <old build>  # `.html` redirects as JSON
```

It's zero-dependency and idempotent. It converts only where the mapping is exact: containers (paired as markdown-it pairs them, see Markdown extensions), code groups, `details`, GitHub alerts, fence `[label]`s and meta, `<<<` snippet imports and `<!--@include:-->` without regions or line ranges, `.html`/`.md`/trailing-slash links backed by a page, `<Badge type text />`, `{#id}`, `[[toc]]`, and the body H1 → `title`. It renames a page to `.mdx` when the result needs MDX (partials keep their names) and makes its comments and `<br>` MDX-safe. **Everything else is a `REVIEW` line**: frontmatter keys Blume rejects, components, Vue syntax, regions and out-of-root snippets, repaired container structure, unconverted includes (including ones inside code fences, which VitePress spliced). Work through that list with the sections below; it's the migration's to-do list.

## Config: `.vitepress/config.*` → `blume.config.ts`

Read the whole module and the helpers it imports (sidebars, nav, per-locale configs). For **2.0**, also read directory-level `config.*` files beside the content.

| VitePress | Blume |
| --- | --- |
| `title` / `description` | `title` / `description` |
| `titleTemplate` | drop (report). Blume's `<title>` is `<page> - <site>`; `seo.title` replaces a page's part |
| `lang` (not `en-US`) on a single-language site | a one-locale `i18n` block (`i18n: { defaultLocale: "fr", locales: [{ code: "fr", label: "Français" }] }`): it sets `<html lang>` and the UI strings, with no switcher or prefix. Use a `code` with a UI pack |
| `head` | per entry: a known analytics snippet → **that provider's factory** from `blume/analytics` (the gtag loader + `gtag('config', 'G-…')` pair → one `googleAnalytics({ id })`; also GTM, Plausible, …); any other `<script>` → `script()` (`src`, `async`/`defer` → `strategy`, other attrs → `attributes`, inline body → `content`). A `meta` tag → `seo.metatags`, minus the tags Blume writes itself (`description`, `robots`, `og:*`, `twitter:*` card tags; the build names the setting that owns each). `link rel="icon"` → a conventional favicon name in `public/`. Fonts and other tags → drop (report) |
| `base` (`/repo/`) | `deployment: { base: "/repo" }` |
| `cleanUrls` | no setting; see "URLs and redirects" |
| `rewrites` | **move each file to the path its rewrite produced**, so the URL stays put (`slug` only where moving is impossible). VitePress relative links are already written against the rewritten paths |
| `srcDir` / `srcExclude` | `content.root` / `content.exclude`, which adds to the defaults `**/_*` and `**/.*` |
| `outDir`, `assetsDir`, `cacheDir`, `ignoreDeadLinks`, `metaChunk`, `mpa` | drop |
| `appearance` | `'dark'`/`'force-dark'` → `theme.mode: "dark"`; `false` → `"light"`; `true`/`'force-auto'` → omit. Blume always shows the toggle: report a forced mode |
| `lastUpdated: true` | `lastModified: "git"` |
| `sitemap.hostname` | `deployment.site`, unless the host is Vercel or Netlify (auto-detected). `sitemap.transformItems` → drop |
| `markdown.theme` | `markdown.code.theme: { light, dark }`; VitePress's default (`github-light`/`github-dark`) is Blume's, so omit it unless changed |
| `markdown.lineNumbers: true` | no site-wide switch: add `lineNumbers` per fence, or drop (report) |
| `markdown.math` | delete `markdown-it-mathjax3`; see Math |
| `markdown.container` labels, `anchor`, `toc`, `attrs`, `image`, `languages`, `languageAlias`, `headers` | drop (report). A custom `anchor.slugify` changes every anchor |
| `markdown.config(md)` / `preConfig(md)` with `md.use(…)` | **custom markdown-it plugins: find the syntax each one adds in the content and convert every use** (to Markdown, a directive, or a component); the codemod doesn't know it. Report each plugin |
| `markdown.codeTransformers` with `@shikijs/vitepress-twoslash` | drop the plugin: ` ```ts twoslash ` works natively |
| `markdown.externalLinks` | VitePress opens external links in a new tab by default; `markdown.externalLinks: true` keeps that (optional) |
| `vite`, `vue`, build hooks (`transformHead`, `transformPageData`, `buildEnd`, …) | drop (report what each did). Blume writes canonicals, OG images, `llms.txt`, and the sitemap itself; Astro integrations go in `integrations` |
| `locales` | `i18n` (see below) |

**`themeConfig`** (default theme):

| `themeConfig` | Blume |
| --- | --- |
| `logo` (string, `{ src, alt }`, `{ light, dark, alt }`) | `logo` (string, or `{ image: { light, dark, alt } }`), file in `public/`. A monochrome SVG → `currentColor` and the string form |
| `siteTitle: false` / a string | `logo: { image: …, text: "" }` / `logo.text` |
| `nav`, `sidebar` | see the Navigation sections |
| `socialLinks` | GitHub → `github: { owner, repo }` (it renders in the footer); known platforms → `footer.socials` (`twitter` → `x`; list under `footer` in `docs/configuration/index.mdx`); others, including custom `{ svg }` icons → `footer.links`, or drop (report) |
| `footer` (`message`, `copyright`) | `copyright` → `footer.copyright`, plain text: strip the tags, decode entities (`&copy;` → `©`); a link inside it loses its URL (report, or add it to `footer.links`); a per-locale `copyright` → a locale map. `message` → drop (report); `footer.links` takes `{ label, href }` |
| `editLink.pattern` (`…/edit/<branch>/<path>/:path`) | `github: { owner, repo, branch }`. `<path>` leads to the **srcDir**, but Blume builds edit links from the Blume project dir, so `github.dir` is `<path>` minus `content.root` (omit when empty). A non-`github.com` origin → `github.host` |
| `lastUpdated.formatOptions` | its date fields → `dateFormat`; `text` → drop |
| `search` | `local` → omit. **Algolia → omit `search`** (Blume's built-in Orama), remove the DocSearch deps, and report the `appId`/`indexName`. That index is almost always DocSearch's, filled by Algolia's crawler, and Blume's sync, given an admin key, replaces the whole index on every build: never point `algolia()` at it. `search: algolia({ appId, apiKey, indexName })` from `blume/search` is for a new index Blume owns, a separate opt-in |
| `outline` (`2`, `[2, 4]`, `'deep'`, `false`) | `toc` (`{ minHeadingLevel, maxHeadingLevel }`; `'deep'` → 2–6; `false` → `toc: false`), only when declared |
| `aside`, `docFooter`, the `*Label` strings, `externalLinkIcon`, `carbonAds`, **2.0** `gradedContainers`, theme-package keys | drop. UI strings come from Blume's i18n packs (`i18n.ui`) |

## Navigation: `sidebar`

VitePress shows only what `sidebar` lists, in that order. Make the file tree match it, carrying labels, order, and collapse into `meta.ts`; reach for `navigation.sidebar` only for shapes files can't express.

- **Multiple sidebars** (`{ '/guide/': [...] }`) → one **`navigation.tabs`** entry per key (`{ label, path: "/guide" }`, label from the `nav`). Give each tab folder a `meta.ts` `title` matching its tab label. VitePress sidebars rarely list root pages, so once those are hidden, a root route has no loose pages to show and Blume falls back to the full tree, where an untitled tab folder shows its humanized folder name.
- **A group whose pages sit flat in one folder** (the nesting exists only in config) → **a `(group)` folder**: `docs/(fundamentals)/controllers.md` still serves `/docs/controllers`, so no URL changes and no redirects. Give it a `meta.ts` (`title`, `pages` in the listed order). A listed page from another folder can join with frontmatter `slug` keeping its old route. **Moving a page one folder deeper breaks its relative links and assets** (`./assets/x.png`, `../other.md`): re-base them, or make them root-absolute.
- **`collapsed`**: unset → not collapsible (Blume's `flat`); `false` → `display: "group"` + `collapsed: false`; `true` → `display: "group"` + `collapsed: true`, in that folder's `meta.ts`.
- **A group with its own `link`** → that page becomes the folder's `index` (its URL changes: redirect the old one).
- **Item `text` that differs from the page's title** → `sidebar.label`. **`base`** → prefix the child links before mapping. External items → `navigation.featured`. `docFooterText`, `rel`, `target` → drop.
- **Pages no sidebar lists** → `sidebar.hidden: true`. A page listed in two sections, or a cross-section link, can't repeat in filesystem nav: keep one place and report.

## Navigation: `nav`

- A link to a section a sidebar key backs → a `navigation.tabs` entry. **A dropdown whose items mirror that section's sidebar groups** (a mega-menu) → a plain tab: the sidebar already shows them.
- A dropdown of pages in one section that isn't the sidebar → a tab with `items` (flat; nested groups flatten).
- External or utility links → `navigation.actions`; a primary call to action → `navigation.cta`. A version dropdown → drop its version links (report), but move its utility links (Releases, Team, Contributing) to `footer.links` or `navigation.actions`, so pages linked only from there stay reachable.
- `activeMatch`, `target`, `rel`, `noIcon` → drop.

## Titles

VitePress takes a page's heading from its first `# H1`; frontmatter `title` only sets `<title>`. Blume renders frontmatter `title` as the H1, so **a body H1 beside a `title` shows twice**; a page with no `title` takes it from the `# H1` that opens its body and shows it once. The codemod moves a plain H1 into `title` and deletes it. It reports two cases: an H1 with inline markup (move it by hand), and a frontmatter `title` that differs from the H1 (make the H1 `title`, keep the old value as `seo.title`). A home page with no H1 takes `hero.name` / `hero.text`.

## Markdown extensions

VuePress shares the container and fence conventions; its snippet and include syntax differ (see `references/vuepress.md`). **What Blume renders below is MDX-only unless marked `.md` OK.** Of these targets, plain `.md` handles fence titles and meta, `// [!code …]` notations, `{#id}`/`[#id]` anchors, and `<include>`; callouts, components, and math need `.mdx`.

**Container pairing.** markdown-it-container scans each container's lines for its closer, so **a bare `:::` closes the outermost open container whose fence is no longer than it, and everything nested in it**. An unclosed container runs to the end of its parent (the page, for a top-level one), and a `:::` with nothing to close shows as text. Real sites have unclosed code groups that swallow the next callout, closers that close two containers, and stray closers. The codemod pairs this way, ends a code group at its last code block when other content follows inside it (a group only holds code), drops stray closers, gives a nested callout's outer fence the extra colon Blume needs, and reports every repair. Check the old build's HTML for literal `:::` to see what the live site already showed broken.

| VitePress | Blume |
| --- | --- |
| `::: tip` / `info` / `warning` / `danger` (spaced) | `:::tip` etc., with **no space**; `::: tip` is never parsed (codemod) |
| `::: danger STOP` | `:::danger[STOP]`. `:::danger STOP` renders without `STOP`, and `.mdx` warns `BLUME_DIRECTIVE_OPENING_TEXT` (codemod) |
| `::: note` / `important` / `caution` | **2.0** containers → `:::note`, `:::note`, `:::danger` (`:::warning` with `gradedContainers`). On **1.x** they aren't containers and showed as text; converting changes that: report (codemod) |
| `::: details Title` (`{open}`) | `<Expandable title="Title">` (`defaultOpen`); untitled → `title="Details"` (codemod) |
| `> [!NOTE]` `[!TIP]` `[!IMPORTANT]` `[!WARNING]` `[!CAUTION]` (+ `[!INFO]`, `[!DANGER]`) | `:::note` / `tip` / `note` / `warning` / `danger` / `info` / `danger`; text after the marker → `[Title]` (codemod). Unconverted, the five GitHub markers still render as those callouts in `.mdx` (a lazy continuation included); in `.md` they're plain quotes with a literal `[!NOTE]` that warn `BLUME_MD_GITHUB_ALERT` (rename the page to `.mdx`), and `[!INFO]`/`[!DANGER]` are plain quotes in both, with no warning. The codemod leaves lazy-continuation and indented alerts for you |
| `::: raw`, `::: v-pre` | remove the wrapper lines (codemod) |
| `::: code-group` + `[label]` fences | `<CodeGroup>`; each block's title is its label (bare token, or `title="Two words"`), else its language as VitePress showed. Blume syncs same-titled tabs page-wide (codemod) |
| Raw `<div class="tip custom-block">…</div>` (hand-written container markup) | the matching directive |
| ` ```js{4} ` / ` ```ts:line-numbers ` / ` ```js [file.js] ` | ` ```js {4} ` (Blume reads it glued too) / ` ```ts lineNumbers ` (`=N` start → drop) / ` ```js file.js ` (a bracketed title also shows without its brackets; `.md` OK; codemod) |
| `// [!code ++]` `--` `focus` `highlight`/`hl` `error` `warning` | same (`.md` OK) |
| `js-vue` | plain `js`; resolve its `{{ }}` by hand |
| `<<< @/path/file.ts{2,4} [Label]` (`{lang}`, `:line-numbers`) | `<include meta="Label {2,4}">/path/file.ts</include>` (`lang="…"`, `lineNumbers`); `@` is the srcDir, `/` Blume's content root. In a code group VitePress titles an unlabeled import with its file name. A `.md` target gets `lang="md"`: VitePress showed it as code, Blume would splice it (`.md` OK; codemod) |
| `<<< file#region` | no region selection in `<include>`: generate the excerpt with `<skill>/scripts/include-excerpts.mjs` (selects `#region` markers; set `"dedent": true`, since VitePress always dedents regions; runs before every build, so the excerpt keeps tracking the source). Where VitePress couldn't find the region it showed the whole file, so check the old build |
| a snippet outside the content root (`@/../packages/…`) | `BLUME_INCLUDE_OUTSIDE_ROOT` fails the build: copy the file under `_snippets/` and report |
| `<!--@include: ./part.md-->` | `<include>./part.md</include>` (`.md` OK; codemod). A line range or region → split the partial. VitePress publishes a partial as a page unless `srcExclude` hides it: prefix partials with `_` (excluded by default) and update the paths. A partial is parsed in the including page's format, so one spliced into `.mdx` must be MDX-safe |
| `[[toc]]` | delete; Blume has the outline rail (codemod) |
| `:tada:` emoji shortcodes | paste the emoji. A trailing emoji leaves no dash in the id (`## Emoji 🎉` → `#emoji`); the anchor script pins any old id that differs |
| `## Heading {#id}` | `[#id]` in both formats; a bare `{#id}` fails `.mdx` (codemod) |
| markdown-it-attrs (`[link](/x){target="_self"}`, `{.class}`) | delete (codemod, for links) |
| `$…$` / `$$…$$` (`markdown.math`) | `$$…$$` in `.mdx`, block or inline; convert each inline `$…$`, checking it's math |
| ` ```mermaid ` (`vitepress-plugin-mermaid`) | as written in `.mdx`; delete the plugin |
| `:::tabs` + `== Label` (`vitepress-plugin-tabs`) | `<Tabs>` of `<Tab title="Label">`, or `<CodeGroup>` when every tab is one fence |
| Containers a site registers itself (markdown-it-container in `markdown.config`, **2.0** `customContainers`) | read the registration, then map each to a callout, `<Tabs>`, or a component (report). The codemod pairs them as containers and leaves them as written, lengthening an enclosing callout's fence: Blume ends a `:::` callout at a `::: name` line inside it and drops the line |

## Vue in Markdown

VitePress pages are Vue templates; Blume pages aren't. **In `.mdx` these fail the build**: an HTML comment, `{{ … }}`, a `:prop=` binding, `<script setup>`, an unclosed `<br>`/`<img>`, an `<https://…>` autolink, and `{name}` in prose. **In `.md` they pass through as text or raw HTML** with no error. The codemod reports each.

- **`{{ expr }}`, `$frontmatter`, `$params`** → substitute the value; shared values → Blume `variables`; literal braces → inline code. Vue directives on HTML (`v-if`, `v-for`, `v-pre`) → static content.
- **`<!-- comments -->`** → `{/* … */}` in `.mdx` (the codemod converts one-line ones).
- **`<script setup>`, `<script>`, `<style>`** → delete; move styles to a root `theme.css`.
- **`<Badge type text />`** → `<Badge variant>text</Badge>` (`tip`, the default → `accent`; `info` → `default`; `warning`, `danger` as named; **2.0** `note` → `default`, `important` → `accent`, `caution` → `danger`). Blume leaves a badge's text out of the heading's id (`## Title <Badge>beta</Badge>` → `#title`), as VitePress did for a self-closing badge, but VitePress put a badge's children in it (`<Badge type="info">beta</Badge>` → `#title-beta`), so the codemod pins each converted badge heading to its VitePress id (`[#title-beta]`; `[#title]` for a self-closing badge, redundant but harmless). Unconverted in `.mdx`, a `<Badge type text />` renders empty and warns `BLUME_UNKNOWN_PROP`.
- **Components** (global ones from the theme's `enhanceApp` or a theme package, and imported `.vue` files): decide per component: a Blume component, Markdown, a static `.astro` component in `components.ts`, or the `.vue` file as an island (`islands/`, with `@astrojs/vue vue` installed; `:users="['a']"` → `users={["a"]}`). Components importing from `vitepress` (`useData`, theme parts) can't run outside it. **First check the old build: a component the theme never registered rendered nothing** (`<!---->` in the HTML), so converting it shows content readers never saw. Report it. Data-driven theme components with no source of data (API lists, contributor avatars) → drop, delete headings left empty, and report the lead-in sentences that now point at nothing.
- **Raw `<img>`/`<figure>` with a relative `src`** → a Markdown image, which is optimized. Left as is, it works: Blume publishes a file a relative `src` names beside the page, unoptimized, and `blume validate` checks it.
- **`<ClientOnly>`** → drop the wrapper (an island that needs `window` uses `client: "only"`). **`VPTeamMembers`** → a `<CardGroup>` of `<Card>`s, or drop (report).
- **Data loaders** (`*.data.{js,ts}`) → inline the data, compute it in a custom `.astro` page, or use a content source (report). **Dynamic routes** (`[param].md` + `.paths.*`) → write one page per generated path, then delete the template.

## Home page (`layout: home`)

- **The site home** → `index.mdx` with `mode: custom` (no title or description rendered, so write the heading): the hero as heading, paragraph, and links; each feature as a `<Card title href icon>` in a `<CardGroup cols={3}>` (an image path or inline `<svg>` icon passes to `icon`; an emoji has no slot). For a designed landing page, `pages/index.astro` on `PageLayout`.
- **Any other page with `layout: home`** (a team or about page using only the hero) → default doc mode: `hero.name` → `title`, `tagline` → a paragraph.
- Hero CSS variables and theme-package keys (`testimonial`, `features` styling) → drop (report).

## Frontmatter

| VitePress | Blume |
| --- | --- |
| `title` | see Titles |
| `description` | pass through |
| `head` | `meta name=description` → `description` (when the page has none; VitePress didn't emit a page's `head` description beside a frontmatter one); `og:image` → `seo.image`; `link rel=canonical` → `seo.canonical`; `robots` `noindex` → `noindex: true`; `keywords` → drop; anything else → drop (report) |
| `layout: doc` | remove |
| `layout: page` | `mode: frame`. **If the page's only content was a component you're dropping, use the default mode** so the title renders |
| `layout: home` | see Home page |
| `layout: false` / a custom layout | `mode: custom`, or a custom `.astro` page (report) |
| `sidebar: false` | `mode: center` |
| `aside: false` / `outline: false` | `mode: wide`, or drop; `outline` levels, `aside: left` → drop (report) |
| `prev: false` **and** `next: false` | `pagination: false`; other `prev`/`next` → drop (report) |
| `lastUpdated: <date>` | `lastModified`; `false` → remove |
| `titleTemplate`, `editLink`, `footer`, `navbar`, `pageClass`, `markdownStyles`, theme-package keys | drop (report), or declare with `frontmatter.extend` if a component you wrote reads them |

## Icons

VitePress has no page-icon system. Icons you add (tabs, `meta.ts`, cards) are kebab-case Lucide names; an inline Lucide SVG (`class="lucide lucide-server"`) maps to that name (`server`).

## Assets

- **`<srcDir>/public/`** → `public/` beside `blume.config.ts`; root-absolute references keep working.
- **Relative images** work as written and are optimized, **except draw.io/diagrams.net SVG exports**: the `content="<mxfile…>"` attribute on their `<svg>` hides the size Astro reads, so Blume serves the file as it is and warns `BLUME_SVG_UNOPTIMIZED` at the line that embeds it. Strip that attribute to have it optimized.
- **`.html` files under `public/`** (`/pure.html`) → keep the links.

## i18n

A `root` locale with others in `fr/`, `zh/` folders matches Blume's `dir` layout: `i18n: { defaultLocale, locales: [{ code, label }] }`, `code` = the folder (not `lang`), `defaultLocale` = the root's language (`en-US` → `en`). Per-locale nav labels → label maps on `navigation.tabs`/`actions`; per-locale sidebars → each locale's `meta.ts`; per-locale `title`/`description` → drop (report). Pin translated headings to their own old ids: translated pages keep their own old anchors, and the anchor script (see URLs and redirects) pairs each page with its own old page, never with the default locale's. With every locale in a folder (`en/` too), move the default up to the root and redirect `/en/…`, or set `hideDefaultLocalePrefix: false`.

## URLs and redirects

The old URL list is `<old build>/**/*.html` (or the live `sitemap.xml`). Blume serves `/guide/foo` for `guide/foo.md` and `/guide` for `guide/index.md`.

- **`cleanUrls: false` (the default): one exact redirect per non-index page,** `{ from: "/guide/foo.html", to: "/guide/foo" }`. `vitepress-codemod.mjs --redirects <old build>` prints them all; paste the array into `redirects`. A pattern can't express a `.html` suffix (`/:path*.html` fails validation).
- **Don't redirect an index URL** (`/guide/`, `/guide/index.html`, `/index.html`): static hosts serve Blume's `guide/index.html` there already, and `blume dev`/`preview` redirect `/guide/` to `/guide`. `from: "/guide/"` takes over the page (`BLUME_REDIRECT_MATCHES_PAGE`); `from: "/guide/index.html"` builds (no redirect page is written over the page) but is unneeded.
- **`cleanUrls: true`:** old URLs already match.
- **A moved route** (undone `rewrites`, a renamed `_`-prefixed page, a numeric prefix Blume strips, a `foo.md` beside `foo/index.md`, which is one route in Blume: `BLUME_DUPLICATE_ROUTE`) → redirect both the `.html` and the clean spelling.
- **Internal links:** the codemod rewrites `.html`, absolute `.md`, and trailing-slash links that a page backs; it reports the rest. `blume validate` reports each `.html` link left (`BLUME_BROKEN_ASSET`, naming the page's route when one matches). Fix links in config, frontmatter (`hero.actions`), and raw `<a href>` too.
- **Anchors.** VitePress slugs headings its own way (punctuation runs → one `-`, leading digit → `_`); Blume uses `github-slugger` (punctuation dropped). On a large site hundreds of ids change (`#what-s-new` → `#whats-new`, `#tsed-core` → `#tsedcore`). After the first build, run the anchor script against the old build: `node <skill>/scripts/pin-heading-ids.mjs --old <old build>` (`--write` to apply), then rebuild and rerun it until it reports 0. By default it pins every id that changed; `--only-linked` pins only the ids content links to, for a site where hundreds change, and is a choice to report, since outside deep links to the rest then land at the top of the page. It reads the ids VitePress published, so a custom `markdown.anchor.slugify` is covered too, and it finds each old page at its own route, so add `--map` only for pages that moved. A `NOTE` names a heading it couldn't pin: pin it by hand (`## What's new [#what-s-new]`) if the heading still exists. A pin **replaces** the generated id, so run `blume validate --strict` after: any `BLUME_BROKEN_ANCHOR` left was already dead on the old site (retarget it or drop the fragment, and report it).
- **Verify** in `dist/`: every old URL is either a built page (`dist/<route>/index.html`) or a `from` in `dist/_redirects` / `dist/vercel.json` whose target is a built page. Static builds also write a meta-refresh page at `dist/<route>.html/index.html`. `blume preview` serves both, applies the redirects as the host files do, and redirects `/<route>/` to `/<route>`, so you can click through old URLs there. On Netlify, set `deployment: netlify({ output: "static" })`: only its `_redirects` forces the rules, so a build for no named host gets the meta-refresh page with a 200. How GitHub Pages serves `/<route>.html` is unverified, so check a few old URLs after deploying there.

## Teardown

- Remove `vitepress`, its plugins (`vitepress-plugin-*`, `@shikijs/vitepress-twoslash`, `markdown-it-*`), the theme package, and `vue` (keep `vue` + `@astrojs/vue` for Vue islands). Delete `.vitepress/` (once its `dist/` is copied out), data loaders, `.paths.*` files, and PostCSS/Tailwind configs that only served the theme. Theme CSS worth keeping → a root `theme.css` against Blume's tokens (`--vp-c-brand-1` → `theme.accent`).
- **Check the `tsconfig.json` in the Blume project dir**: Blume's build reads it, so drop `.vitepress` includes and make sure `extends` resolves from that dir (install the root workspace first), or delete it if it only served VitePress. An unresolvable `extends` fails the build (`BLUME_TSCONFIG_EXTENDS`, at the line that names it).
- Repoint `docs:dev`/`docs:build`/`docs:preview` to `blume dev`/`build`/`preview`. Grep the repo for `.vitepress/dist` and `vitepress build`: CI and deploy configs (Pages workflows, publish scripts, `netlify.toml`) must now publish `dist/` and install the docs package's deps. `.gitignore`: `.vitepress/cache`, `.vitepress/dist` → `.blume`, `dist`.
- A `404.md` → delete (Blume ships a 404; `pages/404.astro` replaces it).

## Dropped — report these

`titleTemplate`, the footer `message` (and any link inside `copyright`), forced `appearance`, per-page `outline`/`aside`, one-sided `prev`/`next`, page-level toggles (`editLink`, `footer`, `navbar`, `pageClass`), `head` entries beyond meta tags and analytics, build hooks, Vite and custom markdown-it plugins, unsupported social links, line-number offsets and the site-wide switch, snippet regions and include ranges (now split files), copied out-of-root snippets, data-driven and unregistered theme components (and any content they hid), `VPTeamMembers`, data loaders and dynamic routes, hero styling, the DocSearch index (with its credentials), old-site anchors that were already broken (and any left unpinned under `--only-linked`), version-dropdown links, and `::: note`/`important`/`caution` text that 1.x showed literally.
