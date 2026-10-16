# Starlight → Blume

Starlight is an Astro integration configured via `starlight({…})` in `astro.config.*`, with content in `src/content/docs`. Both are Astro, so this is a natural fit — content can mostly stay in place, with one big caveat: **most Starlight content is `.md`, and Blume's `:::` directives are MDX-only** (see Asides below).

## Detect

- `astro.config.{mjs,mts,ts,js,cjs}` importing and calling **`starlight({…})`** (`import starlight from "@astrojs/starlight"`).
- Content under **`src/content/docs/`**; a `src/content.config.ts` (current) or `src/content/config.ts` (pre-Astro-5).
- `@astrojs/starlight` dep.

Keep content where it is — set `content.root: "src/content/docs"`.

## Config: `starlight({…})` → `blume.config.ts`

**Harvest the surrounding `astro.config.*` too, not just the `starlight()` call:** top-level Astro `redirects` → Blume `redirects`; `site` → `deployment.site`, unless the target host is Vercel or Netlify, which Blume auto-detects (see SKILL.md); other integrations → report.

| Starlight option | Blume |
| --- | --- |
| `title` | `title` (if per-locale/computed, set manually) |
| `description` | `description` |
| `logo` (`{ src }` or `{ light, dark, alt }`) | `logo` — move the referenced file into `public/` |
| `logo.replacesTitle` | `logo: { text: "" }` (renders the mark alone) |
| `favicon` | copy the file into `public/` (drop the config field — Blume auto-detects) |
| `social` (array of `{ label, icon, href }`; pre-0.33 legacy: `{ github: url }` object) | derive **`github: { owner, repo }`** from the GitHub entry; every other entry whose platform Blume knows → **`footer.socials`** (`{ discord: href, bluesky: href, … }`; the `x.com`/`twitter` icon → `x`; the platform list is under `footer` in `docs/configuration/index.mdx`); the rest (`mastodon`, `gitlab`, `rss`, …) drop (report) |
| `editLink.baseUrl` (`…/edit/<branch>/<subdir?>`) | `github: { owner, repo, branch }` — **and any repo sub-path after the branch → `github.dir`** (a docs-in-subfolder repo breaks every edit link without it); **an origin other than `https://github.com` → `github.host`** (a GitHub Enterprise repo otherwise links to the public site) |
| `sidebar` (array) | filesystem nav / `navigation.sidebar` (see below) |
| `tableOfContents` (`false` or `{ minHeadingLevel, maxHeadingLevel }`) | `toc` — identical shape, 1:1 |
| `markdown.headingLinks: false` | `markdown.headingAnchors: false` |
| `expressiveCode.themes` | `markdown.code.theme: { light, dark }` — EC assigns by theme _type_, so match each theme by its darkness, not by array position |
| `expressiveCode.styleOverrides` | drop → restyle via a root `theme.css` file |
| `head` | per entry: a `meta` tag → **`seo.metatags`** (`{ [attrs.name ?? attrs.property]: attrs.content }` — verification tokens, `theme-color`, and the like), minus the tags Blume writes itself (`description`, `robots`, `og:title`/`og:description`/`og:image`/`og:url`/`og:type`/`og:site_name`, `twitter:*` card tags, `article:*` dates — the build refuses them and names the setting that owns each, e.g. `og:image` → `seo.og`, `twitter:site` → `seo.x.handle`); an analytics `<script>` → one `script()` adapter each in the `analytics` list (from `blume/analytics`): `attrs.src` → `src`, an `async`/`defer` attr → `strategy`, every other `attrs` key → `attributes`, and an inline body (`content`) → `content`; anything else (`link`, `style`, other scripts) → drop and report |
| `lastUpdated: true` | `lastModified: "git"` |
| `customCss` | drop → move into a root **`theme.css`** file (auto-picked-up; not a config field) |
| `components` (overrides) | Blume's layout slots via `defineComponents({ layout: { … } })` in a root `components.ts`: `Header`, `Search`, `Sidebar`, `TableOfContents`, `Pagination` keep their names; `SiteTitle` → `Logo`; **`Footer` → `PageFooter`**, not Blume's `Footer` (that slot is the site footer; Starlight's `Footer` is the page-end last-updated date, pagination, and edit link, which Blume renders itself, so keep only what the override added). Other overrides (`Banner`, `PageTitle`, `Hero`, `EditLink`, `SocialIcons`, …) have no slot — fold their additions into `PageHeader`/`PageFooter`, or `blume eject`; a Starlight name left under `layout` matches no slot and does nothing. Rewrite reads of `Astro.locals.starlightRoute` against the slot's props |
| `plugins` | **map, don't blanket-drop** — see Plugins below |
| `pagination: false`, `pagefind`/Pagefind options, `titleDelimiter`, `credits`, `disable404Route`, `routeMiddleware` | drop (report) |
| `locales` / `defaultLocale` | `i18n` (see below) |

## Navigation: `sidebar`

Starlight's `sidebar` array → prefer letting Blume generate from the filesystem; use `navigation.sidebar` only for shapes files can't express:

- `{ label, items: [{ autogenerate: { directory: "d" } }] }` (0.39 and later; before 0.39 the group held it directly, `{ label, autogenerate: { directory: "d" } }`) → **structure the folder and rely on filesystem nav** (label → the folder's `meta.ts` `title`; `autogenerate.collapsed` → `collapsed: true` in each subfolder's `meta.ts`). Do **not** map it to a sidebar item with `root:` — in an explicit Blume sidebar that renders a single page link, not the directory's children. Since 0.39 a group's `items` can mix manual entries with an `autogenerate` entry; move those manual pages into the folder (route change → `redirects`) so the folder holds the whole group.
- string `"guides/intro"` → `"/guides/intro"`; `{ label?, slug }` → `/<slug>`.
- `{ label, items: [...] }` → `{ label, items: [...] }` (recursive) — or better, a real folder.
- `{ label?, link }` → `{ label, href: link }`.
- `badge` (string or `{ text, variant }`) → `badge` (text only; variant drops). `collapsed` (bool) → `collapsed`. Item `attrs` and `translations` → drop (report).

## Frontmatter

| Starlight | Blume |
| --- | --- |
| `title` / `description` / `draft` / `slug` | pass through |
| `sidebar.{label,order,hidden}` | pass through |
| `sidebar.badge` | `sidebar.badge` (text only) |
| `sidebar.attrs` | **remove** (strict schema — build error if left) |
| `pagefind: false` | `search.exclude: true` |
| `lastUpdated` (date/string) | `lastModified` |
| `lastUpdated: false` (boolean) | **remove** (Blume's `lastModified` takes a date; a boolean is a build error) |
| `prev: false` **and** `next: false` | `pagination: false` (hides both links) |
| `prev` / `next` otherwise (one side, or a label/link) | **drop** (report — the links can only be hidden together, and their labels come from the linked pages) |
| `template: splash` | `mode: center` (no sidebar, a wider centered column — the closest layout; report) |
| `hero` | **no key** — its tagline → a paragraph, its actions → `<Card>`s or links, its image → a Markdown image (report); for a designed landing page, rebuild it as a custom `.astro` page under `content.pages` (`pages/index.astro` on `PageLayout` wins over the content page) |
| `banner`, `tableOfContents`, `editUrl`, `head` | drop (report) |

## Asides → directives (and the `.md` trap)

Starlight's primary callout syntax is the `:::note`/`:::tip`/`:::caution`/`:::danger` directive **in plain `.md` files**. The directive names map perfectly (Blume aliases `caution`→warning; `error`→danger) and `[Title]` syntax carries over — **but Blume only parses directives in `.mdx`**. In a `.md` file, `:::note` renders as literal text and the build stays green, with only a `BLUME_MD_DIRECTIVE` warning at its line. So: **rename every `.md` file that contains asides (or math, or mermaid/package-install fences) to `.mdx`** — for a typical Starlight repo that's most of the content; renaming everything to `.mdx` is usually simpler and safe.

- `<Aside type="…" title="…">` (the component form) → the same directives; bare `<Aside>` → `:::note`.
- An aside custom icon (`:::tip{icon="heart"}`) → drop the attr (report).

## Components

- **Renames:** `<CardGrid>` → `<CardGroup>`; `<LinkCard>` → `<Card>` (its `description` prop drops — fold into the body); `<TabItem label="…">` → `<Tab title="…">`. `<Tabs>` and `<Card>` stay; **keep** a `<Tabs syncKey="…">` prop as is — Blume's `Tabs` takes `syncKey` with the same scoping (only groups sharing the key switch together). One difference: Blume groups without a key also sync, page-wide, by tab title, where Starlight leaves them independent — add `sync={false}` to a keyless group whose same-titled tabs must stay unlinked.
- **`<Badge>` needs conversion, not pass-through:** Starlight puts content in a `text` prop and uses variants `note`/`tip`/`caution`/`danger`/`success`/`default` with sizes `small`/`medium`/`large`. Blume's `<Badge>` renders **children** with variants `default`/`accent`/`success`/`warning`/`danger` and sizes `xs`/`sm`/`md`/`lg`. Move `text` into the children; remap variant (`note`→`default`, `tip`→`accent`, `caution`→`warning`, `danger`→`danger`, `success`→`success`) and size (`small`→`sm`, `medium`→`md`, `large`→`lg`).
- **Convert yourself:** `<Steps>` → Blume `<Steps>`/`<Step>`; `<FileTree>` → Blume `<FileTree>`; `<Code code={…}>` → a fenced code block; `<LinkButton>` → a Markdown link or `<Card>`.
- Strip `import … from "@astrojs/starlight/*"` and `astro:assets` lines.

## Code blocks: Expressive Code meta → Blume

Starlight content is full of Expressive Code fence meta; Blume understands some of it and **promotes unknown bare tokens into the code-block title**, so unconverted meta produces garbage headers. Convert per fence:

- `title="file.js"` → works as-is (or use the space-title shorthand). Line ranges `{2-3}` → work as-is.
- `ins=`/`del=` line marks → `// [!code ++]` / `// [!code --]` comments; `mark=` → `{ranges}` or `// [!code highlight]`.
- `showLineNumbers` → `lineNumbers` (`BLUME_CODE_FENCE_OPTION` flags any left).
- `wrap` / `wrap=true` → a bare `wrap` (that block's long lines wrap); a site-wide `expressiveCode.defaultProps.wrap: true` → `markdown.code.wrap: true`.
- **Drop:** `frame="terminal"`, `collapse=`, `wrap=false`, `preserveIndent`/`hangingIndent`, `"string"` and `/regex/` text markers (report if they carried meaning).
- ` ```diff lang="js" ` → a normal ` ```js ` fence with `[!code ++]`/`[!code --]` markers.

## Plugins — map, don't drop

- `starlight-openapi` → an `openapi({ sources })` entry in Blume's `reference` list, imported from `blume/reference` (delete any generated pages; add the `navigation.tabs` entry).
- `starlight-blog` → `type: blog` pages (RSS at `/blog/rss.xml`). Blume generates **no** blog index, tag, or author pages: write a `blog/index.mdx` whose `CardGroup` links each post (see `docs/advanced/blog.mdx` in the installed package), and report the tag and author pages as dropped.
- `starlight-versions` → Blume's native versioning, not a `navigation.selectors` dropdown: each archived version's content goes in a top-level folder under `content.root` named for its id, listed in `versions.archived` (newest first), and Blume adds the switcher, the old-version notice, and version-scoped search. Ids must start with a letter (`1.0/` → `v1.0/`, with `redirects` from the old URLs), and a version-shaped folder left out of `versions.archived` only warns (`BLUME_VERSIONS_UNCONFIGURED_VERSION`) and publishes as current content. Full reference: `docs/content/versioning.mdx` in the installed package.
- `starlight-image-zoom` → delete (Blume zooms content images by default).
- `starlight-links-validator` → delete (`blume validate` covers it).
- Anything else → report.

## Assets

Starlight co-locates images in `src/assets/` with **relative** references (`../../assets/foo.png`) or `astro:assets` imports; Blume serves `public/` at the site root with absolute URLs. Move `src/assets/*` into `public/`, rewrite relative image paths and `~/`/`@/` aliases to absolute `/…` URLs, and replace `<Image>` imports with Markdown images (or `<Frame>`).

## i18n

Starlight has **two** layouts:

- **`root` locale** (default language at `src/content/docs/`, others in `fr/`, `de/`… subdirs) → matches Blume's `dir` parser as-is: `i18n: { defaultLocale, locales: [{ code, label }] }`, no file moves.
- **No `root` locale** (every language in a subdir, including the default — `en/…`) → Blume expects the default locale **at the content root**, so move the default locale's files up one level. Starlight served them at `/en/…`, so add a `redirects` entry per page.

Don't restate Blume defaults (`hideDefaultLocalePrefix: true`, `parser: "dir"` are already the defaults). Starlight's untranslated-page fallback matches Blume's `fallbackLocale` default.

## Teardown

Remove `@astrojs/starlight` (and plugin deps) from deps, delete the Starlight bits of `astro.config.*` **after harvesting redirects**, delete `src/content.config.ts` / `src/content/config.ts`, repoint scripts to the Blume CLI, add `blume`. A `src/content/docs/404.md` has no direct Blume equivalent — report it (Blume ships its own 404).

## Dropped — report these

Socials on a platform `footer.socials` lacks, badge variants, sidebar/item `attrs` + `translations`, `customCss` beyond `theme.css`, `head` entries other than meta tags and analytics scripts, a page's frontmatter `head`, `routeMiddleware`, splash layouts approximated with `mode: center` and hero blocks rebuilt as content, override components with no Blume slot, starlight-blog's tag and author pages, aside custom icons, EC frames/collapse/text markers, prev/next toggles, unmapped plugins, any `<Icon>` name with no Lucide equivalent.
