# VuePress → Blume

VuePress is the Vue static site generator that VitePress succeeded. Its config is a module in `.vuepress/`, navigation is **declared in the theme's `sidebar`**, every `.md` page compiles as a **Vue single-file component**, and its Markdown is markdown-it with `::: name` containers. Most of that layer matches VitePress, so **this file covers only what differs, and sends you to a named section of `references/vitepress.md` for the rest. Keep that file open too.** Watch for six traps:

- **`README.md` is a folder's index page in VuePress, but an ordinary page in Blume.** `guide/README.md` publishes at `/guide/README`, and the folder URL `/guide` has no page. Rename every `README.md` to `index.md` (or `.mdx`), then fix the links to it (see "URLs and redirects").
- **Containers are written `::: tip`, with a space.** Blume renders that as literal text, and warns only for a callout name in `.mdx`; inside an open `:::` container the line closes it instead. See vitepress.md § "Markdown extensions".
- **URLs end in `.html`** (`/guide/getting-started.html`). Every non-index page needs a redirect.
- **v1 sidebar groups are collapsible unless `collapsable: false`** (note the spelling). That's the opposite of VitePress and of VuePress 2.
- **A page's title is its frontmatter `title`, falling back to the body `# H1`, and a page often has both, with different text.** See "Titles".
- **Theme components fail silently.** `<code-group>`, `<code-block>`, and `<router-link>` have hyphenated names, so they pass through as unknown HTML elements, in `.mdx` too. A code group renders every block stacked, and a router link renders with no `href`. Neither `build` nor `validate` reports them.

Scope: **VuePress 1** (`vuepress@1.x`, Vue 2, webpack) with the default theme or a theme that `extend`s it, in full. **VuePress 2** (`vuepress@2.0.0-rc.*`, Vue 3, `@vuepress/theme-default` 2.x) is covered in notes marked **v2**. `vuepress-theme-hope` (v2) has its common syntax under "Themes". For any other theme (`vuepress-theme-reco`, `vuepress-theme-plume`, an ejected `.vuepress/theme/`), inventory its components and frontmatter by hand. The v1 mappings that VuePress's own docs exercise were run end to end on them; the rest of v1 (`permalink`, `base`, `vuepress-plugin-tabs`, the blog plugin, …), the **v2** notes, and the hope section come from source and docs and haven't been run.

## Detect

- **A `.vuepress/` directory** holding `config.{js,ts}`, or v1's `config.yml`/`config.toml`, or v2's `config.mjs`. It's usually `docs/.vuepress/`. **v2** also reads `vuepress.config.{ts,js,mjs}` from the directory the CLI runs in. The directory that holds `.vuepress/` is the **source dir**: the argument to `vuepress dev <dir>` in the `package.json` scripts.
- **Dependencies:** `vuepress` (both majors), the v2 betas' `vuepress-vite`/`vuepress-webpack`, or `@vuepress/*`, `vuepress-plugin-*`, and `vuepress-theme-*` packages. They're often only in the docs package's own `package.json`.
- **Which major:** a `vuepress` version of `^1` means v1. A `2.0.0-*` version, `defineUserConfig`, `bundler: viteBundler()`, or `theme: defaultTheme({…})` means v2. A v1 config is CommonJS (`module.exports`) or `defineConfig` from `vuepress/config` (1.9+), with the theme's options under `themeConfig`. A function config (`ctx => ({…})`) may branch on `ctx.isProd`, so read both sides.
- **Not VitePress.** VitePress uses `.vitepress/` and a `vitepress` dependency (`references/vitepress.md`).

**Where the Blume project goes:** `blume.config.ts` goes in the directory the docs scripts run in (the `package.json` holding `vuepress build docs`, which may be a workspace package like `packages/docs`, not the repo root), with `content.root` set to the source dir (the default `docs` usually matches). When the scripts run `vuepress build` inside the source dir itself, use vitepress.md § "Detect"'s second layout. The public directory is `<source dir>/.vuepress/public` (in **v2**, the `public` option). Move it to `public/` beside `blume.config.ts`. Blume's default `exclude` (`**/.*`) already skips `.vuepress/`.

## The VitePress codemod

vitepress.md's codemod (`<skill>/scripts/vitepress-codemod.mjs`) also reads VuePress 1 pages. Over VuePress's own docs, with `README.md` already renamed to `index.md`, it converted containers, `details`, `v-pre`, comments, `<Badge>`s (pinning their heading anchors to the old ids, which Blume now gives them anyway), `[[toc]]`, glued fence ranges, body H1s, and links that a page backs, and listed much of the rest as `REVIEW` lines. Run it on the source dir **after** the `README.md` renames (before them, links to folder indexes come back as unbacked; it leaves `.vuepress/` alone), then correct what it treats as VitePress:

- **Not reported at all:** lowercase and hyphenated tags (`<code-group>`, `<code-block>`, `<router-link>`, `<demo-1>`; `<Foo-Bar/>` is reported as `<Foo>`), `:emoji:` shortcodes, `@flowstart` blocks, `sidebar: auto` (which then fails the build), **v2** `@[code]` imports, and relative `README.md` links, which stay as written. Grep for each, and rewrite the `README.md` links to the folder (see "URLs and redirects").
- **`<code-group>` and `<code-block>`** aren't converted, and a page with nothing else to convert stays `.md` (VuePress's English `guide/getting-started.md` did). Convert them, and rename the page to `.mdx`. **v2** `::: code-tabs` / `::: tabs` come back as unknown containers to convert by hand.
- **The v2 betas' `:::: code-group` + `::: code-group-item Title`** is read as VitePress's `::: code-group`: it comes out as an empty `<CodeGroup>` followed by the items, with a removed "stray" closer. Convert those blocks by hand before running it.
- **v1 badge types** `error`, `warn`, and `yellow` come out as `accent`: map them as "Vue in Markdown" says.
- **A frontmatter `title` that differs from the H1** is reported for `seo.title`. In VuePress it was the sidebar text, so it goes to `sidebar.label` (see "Titles").
- **`<<< @/…`** resolves `@` against the source dir, which is wrong when `vuepress` ran elsewhere. Check each import it converts or reports against the `<<<` row below.
- **`--redirects`** reads only VitePress builds: on a VuePress build it prints `[]`, which doesn't mean no redirects are needed. Use the command in "URLs and redirects".

## Config: `.vuepress/config.*` → `blume.config.ts`

Read the whole config, including the modules it imports. VuePress sites often keep `nav` and `sidebar` in per-locale files under `.vuepress/config/`.

| VuePress | Blume |
| --- | --- |
| `title` / `description` | `title` / `description` |
| `base` (`/repo/`) | `deployment: { base: "/repo" }` |
| `head` | same as VitePress `head` (vitepress.md § "Config"); the `[tag, attrs, content]` format is identical. `link rel="apple-touch-icon"` → copy the file to `public/apple-touch-icon.png`, which Blume detects. `manifest` and `mask-icon` links → drop with the PWA |
| **v2** `lang` | same as VitePress `lang` |
| `locales` | `i18n` (see "i18n") |
| `dest`, `temp`, `cache`, `host`, `port`, `open`, `shouldPrefetch`, `shouldPreload`, v1 `devTemplate` / `ssrTemplate`, **v2** `templateDev` / `templateBuild`, `evergreen`, `extraWatchFiles`, `debug` | drop |
| `patterns` / **v2** `pagePatterns` | `content.include` / `exclude`. v1's default pattern also builds `.vue` files as pages: rebuild each as Markdown or a custom `.astro` page (report) |
| `permalink` (v1, site-wide) / **v2** `permalinkPattern` | no setting. Give each affected page a `slug` that reproduces its old URL (see "URLs and redirects") |
| **v2** `public` | the directory to move to `public/` |
| `theme` | see "Themes" |
| `markdown.lineNumbers` (v1) | no site-wide switch. Add `lineNumbers` to the fences that need it, or drop it (report) |
| `markdown.slugify` | a custom slugify changes every anchor. See vitepress.md § "URLs and redirects" |
| `markdown.anchor`, `markdown.toc`, `markdown.pageSuffix`, `markdown.extractHeaders` / **v2** `markdown.headers` | drop. If `extractHeaders` added `h4`, set `toc: { maxHeadingLevel: 4 }` |
| `markdown.externalLinks` / **v2** `markdown.links.externalAttrs` | VuePress opens external links in a new tab by default. To keep that, set `markdown.externalLinks: true` (optional) |
| `markdown.extendMarkdown`, `chainMarkdown`, `markdown.plugins` / **v2** `extendsMarkdown` (also inside local plugins) | custom markdown-it plugins. Find the syntax each adds and convert every use, as in vitepress.md's `markdown.config` row. Report each plugin |
| **v2** `markdown.importCode.handleImportPath` | aliases for `@[code]` paths. Apply them as you convert those imports |
| `configureWebpack`, `chainWebpack`, `postcss`, `stylus`, `scss`, `sass`, `less`, `alias`, `define`, **v2** `bundler` | drop (report) |

**Theme options** (v1 `themeConfig`; **v2** the `defaultTheme({…})` options):

| VuePress | Blume |
| --- | --- |
| `logo` | `logo`. Move the file into `public/`. **v2** `logoDark` → `logo: { image: { light, dark } }`, and `logoAlt` → `alt` |
| `nav` / **v2** `navbar` | see "Navigation: `nav`". `navbar: false` → drop (report) |
| `sidebar` | see "Navigation: `sidebar`" |
| `sidebarDepth`, `displayAllHeaders`, `activeHeaderLinks` | drop. VuePress listed a page's headings in the sidebar; Blume lists them in the outline rail (`h2`–`h3`, set by `toc`) |
| `repo` (`owner/name` means GitHub) | `github` adds the footer mark **and** an Edit on GitHub action, so set it only where the site had edit links: v1 with `editLinks: true`, **v2** unless `editLink: false`. Otherwise keep just the mark: `navigation.repo: "https://github.com/<owner>/<name>"`. A GitLab or Bitbucket URL → a `navigation.actions` link; edit links drop (report) |
| `docsRepo` / `docsBranch` / `docsDir` (edit links) | `github: { owner, repo, branch, dir }`, from `docsRepo` when it's set (then point `navigation.repo` at `repo`). `docsBranch` defaults to `master` in v1 and `main` in **v2**, so set `branch` to the real branch. `docsDir` is the repo path to the source dir, so `github.dir` is `docsDir` minus `content.root` (`packages/docs/docs` → `packages/docs`). **v2** `editLinkPattern` → read the path from it the same way |
| `lastUpdated` | v1 turns the date on when `lastUpdated` (a label or `true`) is set in `themeConfig` **or in any `themeConfig.locales[path]`**: either → `lastModified: "git"`, and the label drops. **v2** shows it unless `lastUpdated: false`; map it only when the config sets it, and report the default otherwise |
| `nextLinks: false` **and** `prevLinks: false` (v1) | `pagination: false` on every page: there's no site-wide switch. Only one of them → drop (report) |
| `search: false` | `search: false` |
| `algolia` (`apiKey`, `indexName`, `appId`), in `themeConfig` or, in v1, any `themeConfig.locales[path]` | omit `search` (Orama) and report the credentials. A v1 `algolia` block is almost always **DocSearch**: Algolia's crawler fills the index (the app is `BH4D9OD16A` when `appId` is missing, and `algoliaOptions.facetFilters` often marks a shared index). Its records aren't Blume's, and Blume's sync, given an admin key, replaces the whole index on every build. Never point `algolia()` at it; a new index of your own is a separate opt-in |
| **v2** `colorMode: 'dark'` / `'light'` | `theme.mode`. `colorModeSwitch: false` → report: Blume always shows the toggle |
| **v2** `hostname` | `deployment.site`, unless the target host is Vercel or Netlify |
| `locales` | see "i18n" |
| `smoothScroll`, `searchMaxSuggestions`, `searchPlaceholder`, `repoLabel`, `editLinkText`, **v2** `contributors`, `externalLinkIcon`, `home`, `notFound`, `backToHome`, and the other UI labels | drop. A translated UI string → `i18n.ui` |

**Plugins** (`plugins`, plus the ones the theme turns on):

| VuePress | Blume |
| --- | --- |
| `@vuepress/plugin-search` (v1's built-in search), **v2** `search`, `slimsearch`, `flexsearch`, `orama` | omit: Orama is the default |
| **v2** `@vuepress/plugin-meilisearch` | omit, and report: Blume has no Meilisearch adapter |
| **v2** `@vuepress/plugin-docsearch` | as the `algolia` row: omit `search` and report |
| `@vuepress/plugin-google-analytics` (v1 `{ ga }`, **v2** `{ id }`) | `analytics: [googleAnalytics({ id })]` from `blume/analytics`. A `UA-` id stopped collecting when Google retired Universal Analytics, so ask for the GA4 `G-` id, or drop it (report) |
| Other analytics plugins | the matching `blume/analytics` adapter, or `script()` |
| `vuepress-plugin-sitemap`, **v2** `@vuepress/plugin-sitemap` / `plugin-seo` (`hostname`) | `deployment.site` (with the same host rule as above). Blume writes the sitemap, canonicals, and Open Graph tags itself |
| `@vuepress/plugin-medium-zoom` | omit: Blume content images zoom on click by default |
| `@vuepress/plugin-back-to-top` | omit: Blume's page actions include "Scroll to top" |
| `@vuepress/plugin-pwa` | drop (report). Blume has no service worker. The `manifest` `head` link drops with it |
| `@vuepress/plugin-last-updated` | `lastModified: "git"` |
| `nprogress`, `active-header-links`, `smooth-scroll`, **v2** `copy-code`, `git` | drop |
| `@vuepress/plugin-register-components` | see "Vue in Markdown" |
| `container` (`vuepress-plugin-container`) / **v2** `@vuepress/plugin-markdown-container` | containers the site registers. Read each entry's `type`, `before`, `after`, and `defaultTitle`, then map it as in vitepress.md's last "Markdown extensions" row (report) |
| **v2** `@vuepress/plugin-redirect` | its `config` map → `redirects`. `redirectFrom` frontmatter → one `redirects` entry per old path, pointing at that page. A page with `redirectTo` → delete it and add a redirect |
| `@vuepress/plugin-blog`, `vuepress-plugin-blog` | `type: blog` pages plus a hand-written index (see `docs/advanced/blog.mdx`). Tag, category, and pagination pages → drop (report) |
| Mermaid, math, tabs, flowchart, and include plugins | see "Markdown extensions" |

**Styles:** v1's `.vuepress/styles/palette.styl` `$accentColor` (or **v2** `--vp-c-accent` in `.vuepress/styles/index.scss`) → `theme.accent`. Move other rules worth keeping from `index.styl` / `index.scss` to a root `theme.css`, written against Blume's tokens (report).

## Navigation: `sidebar`

The rules in vitepress.md § "Navigation: `sidebar`" apply: multiple sidebars become tabs, a group whose pages sit flat beside other groups' pages becomes a **`(group)` folder** (`guide/(advanced)/frontmatter.md` still serves `/guide/frontmatter`, so no redirects; list it in the parent `meta.ts` `pages` by its bare name, `advanced`), and pages no sidebar lists need a decision. The item formats differ:

- **Multiple sidebars** (`sidebar: { '/guide/': [...], '/': [...] }`, fallback key last) → one `navigation.tabs` entry per non-root key, as in VitePress. Items inside a key are relative to it: `''` is the key's `README.md`, and `'getting-started'` is `/guide/getting-started.html`.
- **Items** are page paths, with `.md` optional, or `[path, 'Text']`. A `Text` that differs from the page's title → that page's `sidebar.label`.
- **v1 groups** (`{ title, path, collapsable, sidebarDepth, children, initialOpenGroupIndex }`) → a folder (or `(group)` folder) with a `meta.ts` (`title`, `pages` in order). `path` → the folder's `index` page. `collapsable` unset or `true` → `display: "group"`. Blume's groups then start collapsed except the one holding the current page, as in v1 (which also opened the first group, or `initialOpenGroupIndex`, on a page no group held). When every group collapses, set `navigation.sidebar.display: "group"` once. `collapsable: false` → keep the default `flat`. `sidebarDepth` and `initialOpenGroupIndex` → drop.
- **v2 groups** (`{ text, link, prefix, collapsible, children }`, where strings are file paths such as `'foo.md'` or `'/bar/README.md'`, resolved against `prefix`) → the same, except `collapsible: true` is the only collapsible case.
- **`'auto'`** (v1, as a key's value or the whole `sidebar`) and **v2** `'heading'` (the default) showed only the current page's headings. Blume shows the page tree instead, with the headings in the outline rail. Report that the sidebar changed.
- **Pages reachable only from the navbar** (common: `config/`, `faq/`, `miscellaneous/` with `sidebar: auto`) → give each section a place in the tree: a tab for a top-level navbar link, or a folder for a dropdown group. Use `sidebar.hidden: true` only for pages that were truly unlisted.

## Navigation: `nav`

Map it as in vitepress.md § "Navigation: `nav`". v1 items are `{ text, link }`, or `{ text, items }` for a dropdown; a dropdown can hold `{ text, items }` subgroups, which flatten. **v2** items are `{ text, link }`, `{ text, children, prefix }`, or a page path string. Strip `.md` and `.html` from internal `link`s, and turn `README.md` into its folder. `ariaLabel`, `target`, `rel`, and `activeMatch` → drop.

**A dropdown whose pages span several folders** (VuePress's own "Learn More": `api/`, `faq/`, `miscellaneous/`, and an external changelog) fits no single tab. Make it a tab with `path: "/"` and `items` for the pages (on those routes the sidebar lists the folders no other tab claims, which here are exactly those, though the tab also highlights on the home page), and move its external links to `navigation.actions`. Or, for a few pages, use `navigation.featured`.

## Titles

VuePress names a page with its frontmatter `title`, falling back to a heading on the page's first line (normally the `# H1`). That name is the sidebar text and the `<title>`, while the H1 still renders as written. v1's `metaTitle` overrides the whole `<title>`. Blume renders frontmatter `title` as the H1. On every page:

1. Move the H1 text into `title` and delete the H1 line. Keep only the text of an H1 that carries a link or a `<Badge>`: move the link into the body, and the badge to `sidebar.badge`.
2. A frontmatter `title` that differs from the H1 → `sidebar.label`, since it was the sidebar text.
3. `metaTitle` → `seo.title`, minus VuePress's ` | Site` suffix: Blume adds ` - <site title>` itself. A `metaTitle` without that suffix was the whole `<title>`: keep it as written and report that the site name is now appended.

A page with no H1 and no `title` took the site title. Give it a real one. **VuePress gave the H1 an id, but Blume's title has none**, so a link to it (`using-a-plugin.html#using-a-plugin`, meaning the top of the page) fails `validate` with `BLUME_BROKEN_ANCHOR`: drop the fragment.

## Markdown extensions

Everything Blume renders from these is MDX-only unless vitepress.md marks it `.md` OK, so a page that needs a callout or component is renamed to `.mdx`.

| VuePress | Blume |
| --- | --- |
| `::: tip` / `::: warning` / `::: danger` (v1 default theme). **v2** adds `info`, `note`, `important`, and `caution` | same as VitePress's containers, with the space removed and a title moved into `[Title]`. **v2** `important` → `:::note` (Blume's alias), `caution` → `:::danger`. v1 has no `note` or `info` container: unless a plugin registers one, the live site showed those lines as text, so converting them changes the page (report) |
| `::: details Title` | same as VitePress: `<Expandable title="Title">`, or `title="Details"` when untitled. VuePress has no `{open}` |
| `::: v-pre` | same as VitePress's `::: raw` row |
| `::: slot name` (v1 Markdown slots) | no equivalent. Put the content where the layout showed it, or drop it (a home page's `::: slot footer` → see "Home page") (report) |
| `<code-group>` + `<code-block title="YARN">` (v1, 1.6+) | `<CodeGroup>` with blank lines inside, each block's `title` becoming its fence's title (` ```bash YARN `, or `title="Two words"`). `active` on a later block → move that block first (Blume opens the first tab), or use `<Tabs defaultTabIndex={n}>` with one fence per `<Tab title>`. Inside a list item, indent `<CodeGroup>`, its fences, and the closing tag to the item's content column, or the list breaks. Unconverted, the blocks render stacked with no warning |
| `<CodeGroup>` + `<CodeGroupItem title>`, or `:::: code-group` + `::: code-group-item Title` (**v2** betas) | the same. Unconverted in `.mdx`, `CodeGroupItem` fails the build, and the spaced containers show as text |
| `::: code-tabs#id` + `@tab Label` / `@tab:active Label` (**v2** default theme, hope) | `<CodeGroup>`, each `@tab` label becoming the title of the fence that follows it (VuePress rendered only that first fence). `#id` → drop: Blume already syncs same-titled tabs across the page. `:active` → as for `<code-block active>` |
| `::: tabs#id` + `@tab Label` (**v2**, hope) | `<Tabs>` of `<Tab title="Label">`. `#id` → `syncKey="id"`, `@tab:active` → `defaultTabIndex={n}` (zero-based), and `@tab Label#value` → keep only `Label` |
| `:::: tabs` + `::: tab "Label"` (`vuepress-plugin-tabs`, v1) | `<Tabs>` of `<Tab title="Label">` |
| ` ```js{4} ` | same as VitePress: Blume reads it as written, and the codemod adds the space |
| **v2** ` ```ts title="config.ts" ` | works as written (`.md` OK) |
| **v2** `:line-numbers`, `:line-numbers=N`, `:no-line-numbers` | the first two as in VitePress; `:no-line-numbers` → remove. **v2** turns line numbers on for every block by default; Blume has no site-wide switch (report). `:collapsed-lines`, `:v-pre`, `:no-v-pre` → remove |
| **v2** `// [!code …]` (the `notation*` options) | same as VitePress |
| `<<< @/path/file.js{2}` / `<<< @/file.js#region` (v1) | `<include>`, mapped as in VitePress's `<<<` rows, but **`@` is the directory `vuepress` ran in, not the source dir.** Running `vuepress build docs` from the repo root makes `@/docs/x.js` → `<include>/x.js</include>`. v1 imports take no `[label]` or `{lang}`. A region, or a file outside the content root → split or copy the file, as VitePress's rows say |
| **v2** `@[code](./file.js)` / `@[code{3-10} js{2}:no-line-numbers](../file.js)` | `<include lang="js" meta="{2}">../file.js</include>`. Paths are relative to the page, like `<include>`'s. A line range (`{3-10}`) → split the file (report). Unconverted, it renders as `@` plus a link to the file, with no error |
| **v2** `<!-- @include: ./part.md -->`, with `{start-end}` or `#region` (`@vuepress/plugin-markdown-include`, md-enhance, hope) | same as VitePress's `<!--@include:-->` row. Unconverted in `.md` it stays an HTML comment, so the content disappears silently. In `.mdx`, it fails the build |
| `[[toc]]`, `:emoji:` | same as VitePress. VuePress left an emoji shortcode out of a heading's anchor (`## Emoji :tada:` → `#emoji`), and Blume's `## Emoji 🎉` is `#emoji` too, so the pasted emoji keeps the id |
| `@flowstart` … `@flowend` (`vuepress-plugin-flowchart`) | renders as literal text. Redraw it as a ` ```mermaid ` flowchart (`.mdx`) or an image (report) |
| **v2** `> [!NOTE]` GitHub alerts (with the hint plugin's `alert` on, or in hope) | same as VitePress's alerts row |
| Math, ` ```mermaid `, markdown-it-attrs (`{#id}`, `{.class}`) | same as VitePress's rows. v1 and v2 core have no `{#id}` or attrs; only plugins (hope's `attrs`) add them |

## Vue in Markdown

vitepress.md § "Vue in Markdown" applies: the `.mdx` build errors, `{{ }}`, `<script>`/`<style>` blocks, comments, `<ClientOnly>`, directives, and the per-component decision. VuePress adds:

- **Globals:** `$page`, `$site`, `$frontmatter`, `$themeConfig`, `$lang`, `$localePath`, `$title`, `$description`, and `$style` (from `<style module>`) → substitute or delete. `$withBase('/img.png')` → the plain root path (`![alt](/img.png)`): Blume adds `deployment.base` to internal links and assets.
- **`<Badge>`** → Blume `<Badge>`, with the text as **children**. v1 `type`: `tip` (the default) or `green` → `accent`; `warning`, `warn`, or `yellow` → `warning`; `error` → `danger`. **v2** `type`s map as in vitepress.md. `vertical` → drop. An unconverted badge renders empty in `.mdx`, which warns `BLUME_UNKNOWN_PROP`, and as nothing in `.md`, with no warning. **Anchors:** VuePress left a badge out of a heading's anchor (`## Custom Containers <Badge text="default theme"/>` → `#custom-containers`), and so does Blume, so the converted heading keeps its id.
- **`<router-link to="/x.html">`** (v1), `<RouterLink>`, and **v2** `<RouteLink>` → a Markdown link to the route (`[text](/x)`). `<OutboundLink/>` and `<Content/>` → delete.
- **Global components:** v1 registers every `.vuepress/components/**/*.vue` file globally, named after the path (`Foo/Bar.vue` → `<Foo-Bar/>`, `demo-1.vue` → `<demo-1/>`), plus theme `global-components` and `Vue.component()` calls in `.vuepress/enhanceApp.js`. **v2** registers them through `@vuepress/plugin-register-components` or `.vuepress/client.{js,ts}`. Decide each as in VitePress. A hyphenated tag passes through as an unknown HTML element, so give the Blume component a PascalCase name and rename its tags (`<demo-1/>` → `<Demo1 />`). **v1 components are Vue 2**, but `@astrojs/vue` runs Vue 3, so an island needs a Vue 3 port: functional components, filters, `$listeners`, `.sync`, and `this.$set` all changed (report). A component that reads `$page`, `$site`, `$themeConfig`, or `this.$router` can't run outside VuePress: rewrite it or drop it.
- **An escaped `\<App>`** (VuePress's `api/node` headings) renders as text in `.mdx`, with no warning, so it can stay as written.
- **`.vuepress/enhanceApp.js` / v2 `client.{js,ts}`** (Vue plugins, router hooks, global components) → drop, and report what each did. **v2** client-config `layouts` → custom `.astro` pages.

## Home page (`home: true`)

Rebuild it as in vitepress.md § "Home page (`layout: home`)": `index.mdx` with `mode: custom`, or a designed `pages/index.astro`. It's usually the source dir's `README.md` (or `index.md`). VuePress's keys:

- v1: `heroImage`, `heroAlt`, `heroText` (it defaults to the site title, and `null` hides it), `tagline` (it defaults to the site description, and `null` hides it), `actionText` + `actionLink` (one button), `features: [{ title, details }]`, and `footer`. **v2:** `actions: [{ text, link, type }]` replaces the single action, and adds `heroImageDark`, `heroHeight`, and `footerHtml` (which renders `footer` as HTML).
- `mode: custom` is full-bleed with no padding, so a hero image renders huge and flush left. Wrap the hero in a centered block (`<div style={{ maxWidth: "60rem", margin: "0 auto", padding: "3rem 1.5rem 0", textAlign: "center" }}>`, with blank lines inside so the Markdown renders) and cap the image (`style={{ maxHeight: "280px", margin: "0 auto" }}`). Add `sidebar.hidden: true` so the home page isn't a sidebar row.
- Features have no icon or link: each becomes a `<Card title>` with `details` as the body, in a `<CardGroup cols={3}>`. Features written as raw HTML in the body (`<div class="features">`) map the same way.
- `footer` (HTML with **v2** `footerHtml: true`) or a `::: slot footer` is usually a copyright or license line ("MIT Licensed | Copyright © 2018-present …") → `footer.copyright`, plain text: strip the tags, decode entities (`&copy;` → `©`); move its links into `footer.links`, or they lose their URLs (report). A translated home page's `footer` → that locale's entry in a locale map. Other footer content → drop (report). `heroImageDark` → Blume has no light/dark pair for a content image, so keep one (report).

## Frontmatter

Blume's schema is strict: every key below must be mapped or removed.

| VuePress | Blume |
| --- | --- |
| `title` / `metaTitle` | see "Titles" |
| `description` | pass through |
| `meta` (v1) / **v2** `head` | per entry, as in vitepress.md's frontmatter `head` row |
| `canonicalUrl` (v1.7.1+) | `seo.canonical` |
| `lang` | remove: Blume sets `<html lang>` per locale |
| `permalink` | `slug`, the old path without its leading `/`, trailing `/`, or `.html` (see "URLs and redirects") |
| `layout` naming a `.vuepress/components` or theme component | `mode: custom`, and rebuild the content, or use a custom `.astro` page (report). `layout: Layout` → remove |
| `home` and the hero keys | see "Home page" |
| `sidebar: auto` / **v2** `sidebar: heading` | remove: the outline rail lists the headings |
| `sidebar: false` | `mode: center` |
| **v2** `sidebar` as an array (a per-page sidebar) | remove (report) |
| `sidebarDepth` | remove |
| `prev` / `next` | same as VitePress |
| `search: false` (v1) | remove (report): it hid the search box on that page, which stayed searchable |
| `tags` (v1, extra search terms) | `search.keywords` |
| **v2** `date` | keep on `type: blog` pages, otherwise remove |
| **v2** `redirectFrom` / `redirectTo` | `redirects` (see the redirect plugin row) |
| `navbar`, `pageClass`, `editLink`, **v2** `editLinkPattern`, `lastUpdated`, `contributors`, `externalLinkIcon`, `permalinkPattern`, `routeMeta` | drop (report) |
| keys a theme reads | see "Themes" |

## Themes

- **A theme that `extend`s `@vuepress/theme-default`** (v1's `@vuepress/theme-vue`, or a local `.vuepress/theme/index.js` with `extend`) → treat it as the default theme. Layouts it overrides (ads, banners) → drop (report).
- **An ejected or local theme** (a full `.vuepress/theme/` with `Layout.vue`, `Navbar.vue`, …) → map the `themeConfig` keys it shares with the default theme. Any extra key (a version list inside the sidebar, say) is custom, so read its components to see what it rendered (report).
- **`vuepress-theme-hope`** (`hopeTheme({…})`, often in `.vuepress/theme.ts`):
  - **Sidebar** `"structure"` builds the tree from files, which Blume does by default. `order` → `sidebar.order`, `index: false` → `sidebar.hidden: true`, and `shortTitle` → `sidebar.label`. Hope sorts positive `order`s first, then unordered pages by title, then negative `order`s (`-1` last), while Blume sorts a negative order first: renumber, or list the folder's order in its `meta.ts` `pages`. A folder `README.md`'s `dir` → that folder's `meta.ts`: `text` → `title`, `icon`, `order`, `collapsible` (on by default) → `display: "group"`, and `expanded: true` → `collapsed: false`. `dir.index: false` (the folder left out of the generated sidebar) → `sidebar.hidden: true` on each of its pages.
  - **Icons** (frontmatter, navbar, sidebar) are FontAwesome or Iconify names → Lucide (SKILL.md "Icons are Lucide").
  - **Markdown** (the theme's `markdown` options, or `plugins.mdEnhance`): `^sup^`, `~sub~`, task lists, and footnotes work as written. `==mark==` → `<mark>…</mark>`. `::: center` / `::: right` → drop the alignment. `!!spoiler!!` → drop. `<VPCard>` → `<Card>`. A ` ```component Name ` fence (YAML or JSON props) → that component with the props as attributes. `<Catalog />` → `directory: "card"` in that folder's `meta.ts`. `<!-- more -->` → delete. Charts (Chart.js, ECharts, Markmap, PlantUML, flowchart), playgrounds, `::: demo`, and slides → no equivalent: a mermaid diagram, an image, or a link (report).
  - **Frontmatter:** `author` and `date` → `authors` and `date` on `type: blog` pages, otherwise drop. `category` and `tag` → drop (report: Blume has no tag pages), or `search.keywords`. `article`, `star`, `sticky`, `cover`, `isOriginal`, `pageInfo`, `breadcrumb`, `toc`, `comment`, `copy`, `footer`, `copyright`, `containerClass`, and any other hope-only key (`license`, `pageview`, `backToTop`, `sitemap`, `feed`, …) → drop. The project home's `highlights` → more cards. `bgImage` and the hero style keys → drop (report).

## Icons

The default theme has no page icons. Icons you add to tabs, `meta.ts`, cards, or `sidebar.icon` are kebab-case Lucide names. Hope's icons map as above.

## Assets

- **`.vuepress/public/`** → `public/`. Root-absolute references (`/hero.png`) keep working.
- **Relative images** (`./img.png`) work as written.
- **Webpack paths** (v1 `~@alias/img.png`, `~some-package/img.png`, the `@source` alias) → copy the file into the content root or `public/` and link it plainly.

## i18n

Map it as in vitepress.md § "i18n". VuePress's `locales` keys are paths (`'/zh/'`), so the `code` is the folder (`zh`), not the `lang` (`zh-CN`). The default locale's `lang` (`en-US`) gives `defaultLocale` (`en`). The theme's per-locale options (v1 `themeConfig.locales`, **v2** the theme's `locales`) carry the rest:

- `label` (**v2** `selectLanguageName`) → that locale's `label`. `selectText` (**v2** `selectLanguageText`), `ariaLabel`, `editLinkText`, the `lastUpdated` text, `serviceWorker`, and the other UI labels → drop, or `i18n.ui`.
- `nav` → per-locale label maps on `navigation.tabs` / `actions`.
- `sidebar` (keyed `'/zh/guide/'`, …) → each locale's own folder `meta.ts` files.
- A per-locale container title (`defaultTitle: { '/zh/': '提示' }`) → drop: Blume's UI packs (including `zh`) title callouts.
- A per-locale `title` / `description` → drop; a translated home page can keep its description in frontmatter.
- **Anchors:** keep each locale's own old ids (`/zh/` pages had Chinese slugs, which zh pages and outside zh links use). The anchor script does this, pairing every page with its own old page. vitepress.md's "Pin translated headings" means exactly that, not pinning to the default locale's ids.

## URLs and redirects

Follow vitepress.md § "URLs and redirects", treating VuePress like `cleanUrls: false`: one exact redirect per non-index `.html` page, never a redirect from an index URL, both spellings for a moved route, and rewritten internal links. VuePress specifics:

- **Build the old site first and keep its output** (`<source>/.vuepress/dist`, or `dest`): it's the URL list and the record of the old anchors. VuePress writes no sitemap unless a plugin adds one. v1 runs on webpack 4, which fails on current Node with `error:0308010C:digital envelope routines::unsupported`: build it with `NODE_OPTIONS=--openssl-legacy-provider`, or under Node 16 (`npx -p node@16 …`).
- **Redirects:** run this in that output directory and paste the result into `redirects` (the VitePress codemod's `--redirects` reads only VitePress builds):

  ```bash
  find . -name '*.html' ! -name index.html ! -name 404.html | sed 's#^\.##' | sort \
    | awk '{ to = $0; sub(/\.html$/, "", to); printf "  { from: \"%s\", to: \"%s\" },\n", $0, to }'
  ```

- **`README.md` → `index.md`** keeps the folder URL (`/guide/` is served from `guide/index.html`), so it needs no redirect. Rewrite each link to a `README.md` to its folder (`./README.md` → `./`, `/guide/README.md` → `/guide`). Once the file is renamed, `blume validate` flags the ones you miss.
- **`permalink` pages** served the permalink, not the file path. Set `slug` to it. A permalink ending in `.html` also needs a redirect from that `.html` URL.
- **Links:** VuePress authors link to `.md` files, relative or absolute (`/guide/foo.md`; **v2** recommends relative), and to `.html`. Rewrite them as vitepress.md says. Also fix links in `nav`, `sidebar`, `actionLink`, hero `actions`, and raw `<a href>`.
- **Anchors: pin them with the bundled script.** VuePress slugs headings as VitePress does, so ids change on many pages (115 headings on 32 of 92 pages in VuePress's own docs, counted before Blume left badges and trailing emoji out of its ids). **Duplicate headings number differently:** VuePress's second `## Options` is `#options-2`, Blume's is `#options-1`. After `blume build`, run from the Blume project:

  ```bash
  node <skill>/scripts/pin-heading-ids.mjs --old <old .vuepress/dist>          # dry run
  node <skill>/scripts/pin-heading-ids.mjs --old <old .vuepress/dist> --write  # apply
  ```

  It pairs each page's headings with the old build's by text and position, translated pages with their own old pages, and appends `[#old-id]` (`{#old-id}` in `.md`) where the ids differ. Rebuild and rerun until it reports 0. A `NOTE` names a heading whose source line it couldn't match, such as one with inline code, a Markdown escape (`\<`), or `--` (19 of the 115 in VuePress's docs): pin those by hand. It also pins the home hero's `#main-title`, which is harmless. On a large site, `--only-linked` pins only the ids something links to.

- **`validate` also reports anchors that were already broken.** VuePress never checked fragments (a zh page linking an English id, a renamed section). Point each at the right heading or drop the fragment, and report it.
- **Hosts:** Netlify (with pretty URLs) and GitHub Pages also answered `/guide/foo` without `.html`, which Blume keeps. On Netlify, a static build for no named host writes unforced `_redirects` rules, so Netlify serves the meta-refresh page instead of a 301: use `deployment: netlify({ output: "static" })` (see Redirects in `docs/02-deployment.mdx`). The GitHub Pages caveat in vitepress.md applies.

## Teardown

- Remove `vuepress`, `vuepress-vite` / `vuepress-webpack`, `@vuepress/*`, `vuepress-plugin-*`, `vuepress-theme-*`, `vue`, `vue-template-compiler`, `vue-server-renderer`, and any markdown-it, Stylus, Sass, or webpack packages that only served VuePress. Keep `vue` with `@astrojs/vue` if you made Vue islands.
- Delete `.vuepress/` (config, `config/`, `components/`, `theme/`, `styles/`, `enhanceApp.js` / `client.*`, `dist/`, `.temp/`, `.cache/`) once `public/` has moved.
- Repoint the scripts (`docs:dev`, `docs:build`) to `blume dev` / `blume build` / `blume preview`, and add `blume`. Remove `NODE_OPTIONS=--openssl-legacy-provider`.
- **Node:** Blume needs 22.19 or later, and v1 sites often pin an old one (`.nvmrc`, `engines`, CI `node-version: '14'`, Netlify's `NODE_VERSION`). Bump each. When the same CI job also builds or tests other packages (yarn 1 refuses to install a dependency whose `engines` excludes the running Node), the bump reaches them too, so report it.
- Grep the repo for `.vuepress/dist`, `dest`, and `vuepress build`. Deploy scripts (the VuePress guide's `deploy.sh` pushing `docs/.vuepress/dist` to `gh-pages`), `netlify.toml` publish dirs, and CI workflows must now publish Blume's `dist/`. Settings kept in a host's dashboard (Netlify's publish directory, build command, and `NODE_VERSION`) can't be committed: list them for the user, with a full (not shallow) clone if you set `lastModified: "git"`.
- `.gitignore`: replace the docs' own entries (`.vuepress/dist`, the old `dest`) with `.blume` and `dist`. Keep entries other packages in the repo still use (`.temp`, `.cache`).
- A `404.md` → delete it (as in VitePress).

## Dropped — report these

Everything vitepress.md's list covers that this site used, plus: v1 Markdown slots, `@flowstart` diagrams that weren't redrawn, the PWA and service worker, `sidebarDepth` and heading-only (`auto`) sidebars, `nextLinks` / `prevLinks` when only one was off, v1 `<code-block active>` defaults that couldn't move, Vue 2 components that weren't ported, `enhanceApp` / client-config code, `.vue` pages, `pageClass` and layout components, Stylus/Sass palette overrides, Universal Analytics ids, the DocSearch index, GitLab and Bitbucket edit links, old-site anchors that were already broken, hope-only components and frontmatter, and any `note` / `info` text that v1 showed literally and now renders as a callout.
