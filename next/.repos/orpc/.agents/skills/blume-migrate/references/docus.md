# Docus → Blume

Docus is a Nuxt layer for docs sites. It's built on Nuxt Content (pages are Markdown files in `content/`, routed by their path) and Nuxt UI (the theme, and the prose components pages use). Navigation is the file tree plus per-folder `.navigation.yml` files, and settings live in `app.config.ts` and `nuxt.config.ts`. Pages are written in **MDC**, Nuxt Content's Markdown-with-components syntax. The bundled codemod converts most of it; these traps are why it exists:

- **MDC's `::note` … `::` looks like a Blume directive and isn't one.** Blume prints `::note` and its `::` closer as text (in `.md`, every MDC construct), and `blume check` and `build` warn `BLUME_MDC_SYNTAX` at each block opener and inline component (`:badge[New]{color="primary"}`) left in either format: convert them as below.
- **MDX is stricter than MDC.** `[text]{.class}` spans fail the build, and so do `{…}`, `<Name>`, and `<50` in prose. Prompt bodies are full of these.
- **Icons are Iconify names** (`i-lucide-zap`, `i-simple-icons-github`). Blume renders nothing for them, and warns only for sidebar and tab icons.
- **Docus sorts siblings by file path as text,** so `10.faq.md` lists between `1.` and `2.`. Blume sorts the prefixes as numbers.

Scope:

- **Docus 3.x–5.x** is covered: the `docus` package on Nuxt Content 3 and Nuxt UI, whose content syntax is the same across the three. 5.x is current and is by far the most installed, and it's the one this reference was run on.
- **Docus 1.x** (`@nuxt-themes/docus`, on Nuxt Content 2 with Nuxt Elements components) is flagged. Its section near the end was written from the package source, not tested on a site, and the codemod doesn't convert its components.
- **The Nuxt UI docs template** (`nuxt-ui-templates/docs`, no `docus` dependency) writes the same content: the codemod and this reference apply, and its `app.config.ts` is read by hand.

## Detect

- **A `docus` dependency** means 3.x–5.x, and **`@nuxt-themes/docus`** means 1.x. It's usually in the docs package's own `package.json` (`docs/`, `apps/docs/`) in a module's monorepo.
- Usually a `nuxt.config.ts` with `extends: ['docus']`. The 4.x starters have no config and run `nuxt dev --extends docus`, and 3.x ran `docus dev`.
- A `content/` folder beside it with `.navigation.yml` files (3.x+) or `_dir.yml` files (1.x).

**Where the Blume project goes.** Put `blume.config.ts` beside the `package.json` that depends on `docus`, and set `content.root: "content"`. `public/` stays where it is: both tools serve it at the site root. In a workspace, read `references/monorepo.md` too.

- **No `content/docs/` folder:** every file under `content/` is a page, and `content/index.md` is the landing page at `/`.
- **A `content/docs/` folder:** Docus publishes only `content/docs/**`, under `/docs/…`, plus `content/index.md`. Exclude anything else under `content/` and report it. Docus hides the `docs` level in its sidebar. In Blume, add a tab `{ label: "Docs", path: "/docs" }`, or the section tabs below, or the sidebar wraps everything in a "Docs" group.
- **`content/<locale>/` folders:** see i18n.

## Record the old site first

Before editing anything, save the URL list, the old heading ids, and the record of what rendered:

- **URLs:** the live `/sitemap.xml` (on an i18n site, an index of one sitemap per locale), plus every `routeRules` redirect source in `nuxt.config.ts`.
- **HTML:** `nuxt generate` writes `.output/public`, one `<route>.html` per page plus a meta-refresh stub per redirect. Copy it outside the repo; it's `<old build>` below. Or point the anchor script at the live origin.
- **Check components against the live site.** A local build can miss a component a Nuxt module registers in its own build: it shows as an empty tag (`<InstallButton …></InstallButton>`) while production renders it. Request live pages with a browser user agent (`curl -A 'Mozilla/5.0'`): some Docus deployments answer `curl` with Markdown.

## Run the codemod first

On the `content/` directory, dry-run and apply the bundled codemod:

```bash
node <skill>/scripts/docus-codemod.mjs content          # report only
node <skill>/scripts/docus-codemod.mjs --write content  # apply
```

It's zero-dependency, deterministic, and idempotent. Icon names are checked against Blume's Lucide set once `blume` is installed (or with `--lucide <icons.json>`).

**What it does:**

- **Pairs MDC blocks** as remark-mdc does (see MDC syntax).
- **Converts the Nuxt UI prose components:**
  - callouts → `:::type` directives, or `<Callout type icon>` when a callout's icon isn't its type's own
  - `card-group`/`card`, `field-group`/`field` → `<ResponseField>`, `steps`, `tabs`, `accordion`, `collapsible`
  - `code-group` → `<CodeGroup>`, or one `package-install` fence when the group only repeats an install command
  - `code-collapse`, `code-tree`, `code-preview`, `prompt`, `badge`
  - the inline `:icon`, `:kbd`, `:badge`, `:video`, and `:u-color-mode-image`
- **Strips Markdown attributes:** `[text]{.class}` spans and `{…}` attributes go.
- **Rewrites fence labels and frontmatter:** fence `[label]`s become titles, `navigation` → `sidebar`, `seo.ogImage` → `seo.image`, `links` → `related`, a body H1 → `title`, and `.navigation.yml` → `meta.ts`.
- **Renames to `.mdx`** each page that now needs MDX, and makes its prose MDX-safe (see MDC syntax).

Every `REVIEW` line is your to-do list, including:

- custom and landing-page components, left as written
- blocks with a slot the conversion doesn't read (a card's `#footer`), left as written
- card descriptions, which Nuxt UI's prose card never rendered
- callouts that linked somewhere
- icons outside Lucide
- unclosed blocks and stray closers
- `links` lists longer than `related` takes, and frontmatter keys Blume rejects
- MDC blocks inside blockquotes
- file names whose URL changes

## Config: `app.config.ts` → `blume.config.ts`

Read `app/app.config.ts` (`app.config.ts` at the project root on Nuxt 3), `nuxt.config.ts`, the CSS that `css` lists, and `.env.example`.

| `app.config.ts` | Blume |
| --- | --- |
| `seo.title` | `title`. Docus falls back to `site.name` in `nuxt.config.ts`, then the `package.json` `name`, then the git repository's name, so carry the one the site showed |
| `seo.description` | `description` (Docus falls back to the `package.json` `description`) |
| `seo.titleTemplate` | drop. The default `%s - <site>` is Blume's; report a custom one |
| `seo.schema` | drop (report). Blume writes its own JSON-LD |
| `header.title` | `title`, when there's no logo |
| `header.logo.{light,dark,alt}` | `logo: { image: { light, dark, alt }, text: "" }`. Docus shows the logo without the title. A monochrome SVG → `currentColor` and the string form (SKILL.md) |
| `header.logo.display: 'wordmark'` | the `wordmark` files as the logo |
| `socials` (Simple Icons slug → URL) | `footer.socials` for the platforms Blume lists (`twitter` → `x`). Others (`nuxt`, `npm`) → `footer.links`, or drop (report) |
| `github` (`url`, `branch`, `rootDir`), or nothing | `github: { owner, repo, branch, dir }`. **Docus reads the git remote when `github` isn't set,** so edit links showed anyway: take `owner`/`repo` from the remote. `dir` = `rootDir`; `branch` only when it isn't `main`. `github: false` → leave it out |
| `toc.bottom.links` | `navigation.featured` (`to` → `href`). Report the move |
| `navigation.sub` | `navigation.tabs` (see Navigation). `'aside'` anchors have no Blume form; report |
| `docus.locale` (not `en`) | a one-locale `i18n` block |
| `docus.colorMode` | `theme.mode`. Blume always shows the toggle; report |
| `assistant.faqQuestions` | `ai.assistant.suggestions` (`[{ label }]`; flatten categories) |
| `ui.colors.primary` | `theme.accent`. Nuxt UI paints shade 500 in light mode and 400 in dark: a Blume preset of the same name, else `{ light, dark }` with those Tailwind values. **Not declared means Docus's emerald:** the site turns Blume's default color unless you offer `theme.accent: "green"`; report it either way |
| `--ui-radius: 0` in CSS | `theme.radius: "none"` |
| `toc.title`, `docus.shortcuts`, `search.fts`, other `assistant.*` and `ui.*` keys | drop (report the `ui` overrides) |

| `nuxt.config.ts` | Blume |
| --- | --- |
| `site.url` / `NUXT_SITE_URL` | `deployment.site`, unless the host is Vercel or Netlify (SKILL.md) |
| `routeRules` with `redirect` | `redirects` (see URLs and redirects) |
| `@nuxtjs/i18n` and `i18n` | see i18n |
| `llms.notes`, `llms.sections` | `agents.llmsTxt: { details }` as Markdown, if worth keeping; `llms.title`/`description` drop |
| `mcp` | Docus serves an MCP server at `/mcp` (or `mcp.route`) unless `mcp: false` or `mcp.enabled: false`. To keep one: `agents.mcp: { enabled: true, name }` (and `route` when it isn't `/mcp`) plus a host adapter (server output). Blume's tools are fixed, so report the site's own tools and prompts in `server/mcp/` |
| `docus.assistant` | Docus turns the assistant on when the build has `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`: check the live site for it. Keep it as `ai: { assistant: { enabled: true, provider: gateway({ model }) } }` (`gateway` from `blume/ai`; Docus's default model is `google/gemini-3-flash`) plus a host adapter, or drop it (report) |
| `app.head`, `@vercel/analytics`, `@nuxtjs/plausible`, `@nuxt/scripts` analytics | the provider's factory from `blume/analytics` (`vercel()`, `plausible({ domain })`, `cloudflare({ token })`); other scripts → `script()`; `meta` → `seo.metatags`. `@vercel/speed-insights` has no adapter (report) |
| `content.build.markdown` (`toc`, `highlight.theme`, plugins), `mdc.highlight.theme` | `toc` and `markdown.code.theme` only when they differ from the defaults; each remark/rehype plugin's syntax converted by hand (report) |
| `css` | what still applies → a root `theme.css` against Blume's tokens |
| `studio`, `agentDiscovery`, `ogImage`, `sitemap`, `robots`, `schemaOrg`, `image`, `icon`, `nitro`, `vite` | drop (report). Blume writes its own sitemap, robots, OG images, and JSON-LD |

**A project `content.config.ts`** adds collections such as a blog or changelog. Those aren't docs pages: map a blog to `type: blog` and a changelog to `type: changelog` (or `githubReleases()`, SKILL.md Changelogs), and report anything else.

**Theme overrides** (`AppHeader*.vue`, `AppFooter*.vue`, `Docs*.vue`) aren't content. Map what they add to config (`navigation.cta`, `navigation.actions`, `footer.links`, `banner`), but read their `v-if`s first: a button shown only on the landing page (`route.path === '/'`) belongs on the landing page, since Blume's `cta` shows site-wide.

## Navigation

The codemod writes each `.navigation.yml` as a `meta.ts` (`title`, `icon`) and each page's `navigation` as `sidebar` (`title` → `label`, `icon`, `false` → `hidden`). What's left:

- **A folder's `navigation: false`** hides it: set `sidebar.hidden: true` on its pages (the codemod reports it).
- **A folder with an `index.md` but no `.navigation.yml`:** Docus labels it with the index page's title. Blume uses the humanized folder name, so set `meta.ts` `title` when they differ.
- **Order:**
  - Docus compares paths as text: `1.intro`, `10.faq`, `11.glossary`, `2.setup`. Blume sorts the numbers. In a folder with ten or more unpadded siblings, keep Blume's order (almost always what the author meant) and report the change.
  - Docus also interleaves pages and subfolders. Blume lists a level's pages above its subfolders, so report a page that sorted after a folder.
- **Display:** Docus draws every folder as an always-open group, which is Blume's default `flat` display.
- **`navigation.sub`** (a header tab bar, or anchors in the sidebar) makes each top-level folder a section that scopes the sidebar. That's `navigation.tabs`: one `{ label, path, icon? }` per top-level folder with pages, with `label` and `icon` from its `.navigation.yml`. A section with no index page needs no `href`, since a Blume tab falls back to the section's first page, as Docus did.

## Pages: frontmatter and titles

The codemod maps `navigation`, `links` (header buttons → `related` cards at the foot of the page), and `seo.ogImage`. It removes `layout: docs` and `sitemap`. What's left:

- **No `description`:** when a page opens with a paragraph (after an optional `# H1`), Docus took it as the description, so it showed twice. Blume derives none. To keep the meta description without the repeat, set `seo.description` to that paragraph (optional; say which you did).
- **`sitemap: false`** has no sitemap-only switch: add `seo: { noindex: true }` only when the page should also leave search engines.
- **`toc: false`** → `mode: wide` (report), or drop. Another `layout` → a Blume `mode`.
- **Other keys** Nuxt Content kept and Blume rejects: drop and report each one, or declare it with `frontmatter.extend` if a component you wrote reads it.
- **Titles:** Docus renders frontmatter `title` in the page header, falling back to the first `# H1`, so a body H1 showed twice. The codemod moves a lone H1 into `title` and reports the rest.

## MDC syntax

The codemod applies these rules; you need them for what it leaves. They're remark-mdc's behavior (checked against `remark-mdc@3.11.1`):

- **Block component:** an opening line `::name`, optionally followed by `{attributes}` and nothing else, then Markdown, then a closing line of colons only.
  - Props are inline (`{key="value" flag .class #id}`) or a YAML block, from `---` right after the opener to the next `---`. A `:key='[…]'` holds JSON.
  - Slots are `#name` lines inside the block.
  - An inline component is `:name[text]{attrs}`; alone on a line, it renders as a block.
- **Pairing:**
  - Every opener nests, even at the same colon count.
  - A closer closes the innermost open block **whose opener has exactly as many colons**, together with anything still open inside it. It must not be indented deeper than that opener. Any other colon line, or a `::` mid-line, is text.
  - An unclosed block runs to the end of its parent, and a closer inside a code fence is code.
  - Check the old HTML for a literal `::` to see what the live site already showed broken.
- **MDX safety:** in a `.mdx` page, prose must escape `{` and `}` as `\{` and `\}`, and turn **any `<` followed by a non-space character** into `&lt;` (or `\<`) unless it opens a real tag: `useFetch<User>()`, `<script setup>` written as text, `<50 ms`, `<= 5`. Case matters as in JSX: `<input>` is HTML, but `<Input>` is a component, so a generic like `useTool<Input>()` is text. HTML comments become `{/* … */}`, `<https://…>` autolinks become links, and `<br>` becomes `<br />`. Code spans and `$$` math stay as written.
- **Code fences:** ` ```ts [file.ts]{2} ` → ` ```ts file.ts {2} ` (`title="Two words"` for a label with spaces). Blume reads ` ```ts [file.ts]{2} ` and a multi-word title as written too, the range highlighting its lines, so this only tidies. Leave MDC samples inside fences alone: they're documentation.

## What the codemod leaves

- **Custom components:** `app/components/content/*.vue`, or a Nuxt module's. Read the SFC to see what it renders and which props and slots it reads, then convert it:
  - to Markdown
  - to a Blume component
  - to a static `.astro` component registered in `components.ts`
  - to the `.vue` file as an island in `islands/`, with `@astrojs/vue` and `vue` installed. `:items='["a"]'` becomes `items={["a"]}`, and named slots become props or children.

  Report each one. A component that rendered nothing on the live site (an unknown tag) has nothing to convert.

- **Callouts with `to`:** the whole callout was a link. Add the link to its text when it isn't there already.
- **Card descriptions:** Nuxt UI's prose card renders neither a `description` prop nor a `#description` slot, so that text never showed. The codemod keeps it as the card's body and flags it: keep it, or delete it to match the old page.
- **Blocks with a slot the conversion doesn't read** (a card's `#footer`, a tab's extra slot) stay as written: convert them by hand.
- **`code-tree`** becomes a `<CodeGroup>` titled by file path. The tree view is gone; a `<FileTree>` before it can show the layout.
- **`prompt`:** Blume has no `windsurf` or `claude` action, and no prompt icon (the codemod reports both).
- **Prose about features that didn't carry over:** grep the content for the dropped MCP tool and prompt names, `docus`, `/.well-known/skills`, and `Studio`, and list every page that now says something false.

## Landing page

`content/index.md` renders full-width, with no sidebar, title, or table of contents. Its `title` and `description` feed only the meta tags. The codemod leaves its `u-page-*` and custom components as written.

- **Markdown landing** → `index.mdx` with `mode: custom` (no title or sidebar rendered, so write the heading) and `sidebar.hidden: true` (Docus never listed it).
- **A designed landing**, or `app/pages/index.vue` → `pages/index.astro` on `PageLayout`.

| Nuxt UI | Blume, in the `mode: custom` page |
| --- | --- |
| `u-page-hero` (`title`, `description`, `links`, or slots) | `# Title`, a paragraph, and a line of Markdown links; the primary one can also be `navigation.cta` |
| `u-page-section` | `## Title`, a paragraph, and its features as cards |
| `u-page-feature`, `u-page-card` (`title`, `description`, `icon`, `to`) | `<Card title icon href>description</Card>` in `<CardGroup cols={3}>` |
| `u-page-grid`, `u-page-columns` | `<CardGroup cols={3}>` |
| `u-button`, `u-page-cta` | Markdown links; a heading and a paragraph |
| `u-page-logos`, decorative `div`s (glows, gradients) | a row of images, or drop (report) |

## Icons

Blume resolves Lucide names only (`zap`, or `lucide:zap`); **anything else renders nothing.** The codemod converts `i-lucide-*` (aliases of renamed icons included) and reports the rest:

- **Other sets** (`i-heroicons-*`, `i-ph-*`): the closest Lucide name, checked at [lucide.dev/icons](https://lucide.dev/icons).
- **Brands** (`i-simple-icons-*`): Lucide has a few (`github`, `gitlab`, `slack`, `linkedin`, `youtube`), but **`i-simple-icons-x` is not Lucide's `x`, a close cross.** Otherwise, save the SVG under `public/` and pass its path (`icon="/icons/nuxt.svg"`), or drop it (report).
- **`i-custom-*`** (Docus's `app/assets/icons/*.svg`): copy the SVG to `public/icons/` and pass the path.

## i18n

Docus i18n is `@nuxtjs/i18n` (`defaultLocale`, `locales: [{ code, name }]`) plus one `content/<code>/` folder per locale, and it forces the `prefix` strategy: every locale is under its code, the default included, and `/` redirects to the default.

- Move `content/<default>/` up to `content/` (a default-locale folder warns `BLUME_I18N_DEFAULT_LOCALE_FOLDER`). Keep the others as `content/<code>/`, and run the codemod on `content/`.
- Write `i18n: { defaultLocale, locales: [{ code, label }], hideDefaultLocalePrefix: false }`, `label` = `name`. That keeps every `/en/…` URL. Nothing serves `/` then, so add `{ from: "/", to: "/<default>", status: 302 }` as Docus did.
- **Regional codes are lowercase in Docus URLs** (`zh-TW` → `/zh-tw/…`): use the lowercase code as Blume's `code` and folder.
- Leave out any configured locale with no `content/<code>/` folder: Docus skipped it.

## URLs and redirects

Docus routes a page by its path under `content/`. It strips an `N.` prefix from each segment, drops `index`, and slugifies (lowercase, spaces → `-`). Blume strips `N.`, `N-`, and `N_` prefixes and `index` the same way, so **most URLs carry over unchanged**, with no trailing slash or `.html` to redirect. The codemod reports the exceptions:

- **A dash prefix** (`01-intro.md`) stays in the Docus URL and Blume strips it: pin `slug` or redirect.
- **Uppercase letters or spaces** were lowercased by Docus: rename the file.
- **A version name** (`1.x`, `2.0`) stays whole in Docus: pin `slug`.
- **`_` files** are pages in Docus and excluded by Blume: rename them.

**Redirects:**

- **`routeRules` → `redirects`.** A string `redirect` is a 307 in Nitro (`status: 307`); `{ to, statusCode }` → `{ to, status }`. A `/**` key strips its base: `'/old/**': { redirect: '/new/**' }` → `{ from: "/old/:path*", to: "/new/:path*" }`.
- **`/raw/<route>.md`** is the Markdown copy of each page, which Docus links from `llms.txt`. Blume serves it at `/<route>.md`, so one rule covers it: `{ from: "/raw/:path*", to: "/:path*" }`. A `routeRules` redirect between two `/raw/…md` paths should target Blume's copy directly (`/raw/old.md` → `/new.md`), or it chains through that rule.
- **Agent skills:** a `skills/` folder Docus published under `/.well-known/skills/` → `agents.skills: "./skills"`. Blume publishes them under `/.well-known/agent-skills/`, a skill with references as one `.tar.gz`. Redirect the old index to the new one, and report the change. Links can name the new index (`/.well-known/agent-skills/index.json`): `blume validate` accepts the files Blume generates.
- **Anchors:** MDC slugs headings like Blume (`github-slugger`), then collapses repeated dashes, trims edge dashes, and prefixes a leading digit with `_`. `## Name & Title` is `#name-title` in Docus and `#name--title` in Blume; `## 1. Install` is `#_1-install`. After the first build, run `node <skill>/scripts/pin-heading-ids.mjs --old <old build>`, `--write`, and rebuild until it reports 0. On a server build (`vercel()`, `node()`) it reads the pages from `dist/client` itself.
- **Verify** every old URL: a built page, or a redirect `from` whose target is built (SKILL.md Verification).

## Deploy and teardown

- **Keeping the assistant or the MCP server** needs server output: `deployment: vercel()` (or `node()`, `netlify()`, `cloudflare()`). `blume preview` can't serve a `vercel()` build, so check it with `blume dev`, then a preview deployment.
- **Vercel with `vercel()`:**
  - The build writes the Build Output API folder `.vercel/output` in the Blume project, not `dist/`.
  - In the project's `vercel.json`, set `"framework": null` and the install and build commands (`references/monorepo.md` §4 for a workspace), and **no `outputDirectory`**. `framework: null` overrides a project still set to the Nuxt preset.
  - In the dashboard, set the Root Directory to the docs package and Node to 22.19 or later. Set `AI_GATEWAY_API_KEY` unless the project relies on Vercel's OIDC token.
  - With Turborepo, add `.vercel/output/**` to the docs' build outputs.
  - List the dashboard settings as steps for the user.
- **Dependencies:** remove `docus`, `nuxt`, the `@nuxt/*`/`@nuxtjs/*` modules, `nuxt-studio`, `better-sqlite3`, `@iconify-json/*`, `tailwindcss` (if only the theme used it), mapped analytics packages, `@nuxt/eslint-config`, and `vue` (keep it with `@astrojs/vue` for islands). Keep what the site's tests or scripts still import.
- **Scripts:** `dev`/`build`/`generate`/`preview` → `blume dev`/`build`/`build`/`preview`. **Delete `postinstall: nuxt prepare`**, which fails once Nuxt is gone.
- **Files:** after harvesting, delete `nuxt.config.ts`, `app/`, `content.config.ts`, `server/` (report its routes), and a Nuxt `eslint.config.mjs`. The codemod leaves a `.navigation.yml` whose keys `meta.ts` can't hold.
- **`tsconfig.json`:** a Nuxt one points into `.nuxt/`, and `blume build` then fails with `BLUME_TSCONFIG_EXTENDS`. Delete or replace it.
- **`.gitignore`:** in the docs package's own file, `.nuxt`, `.output`, `.data` → `.blume`, `dist`.
- **CI:** grep for `nuxt generate`, `nuxi`, `.output/public`, and `--extends docus`.

## Docus 1.x (`@nuxt-themes/docus`)

Written from `@nuxt-themes/docus@1.15.1` and `@nuxt-themes/elements@0.9.5`. Everything above applies (run the codemod for fences, frontmatter, and the H1), with these differences:

- **Config** is `app.config.ts` → `docus: { … }`:
  - `title`, `description` → same keys
  - `url` → `deployment.site`
  - `socials` → `footer.socials`. Values are handles (`twitter: '@nuxt_js'`, `github: 'owner/repo'`), so build each URL.
  - `github: { owner, repo, branch, dir }` → `github`
  - `header.logo`/`title` → `logo`/`title`
  - `aside.collapsed` → `navigation.sidebar.display: "group"`
  - `footer.textLinks`/`iconLinks` → `footer.links`
  - everything else → drop (report)
- **Folders** use `_dir.yml` (`title`, `icon`, `navigation: false`, `navigation.redirect` → a redirect from the folder's route).
- **Titles** are the body `# H1` (the codemod moves it).
- **Frontmatter:**
  - `layout: page` → `mode: custom` or `mode: center`
  - `aside: false` → `mode: center`
  - `toc: false` → `mode: wide`
  - `redirect` → a redirect
  - `bottom`, `header`, `fluid`, `main` → drop
- **Components** (Nuxt Elements, left as written and reported):
  - `::alert{type}` → that directive (`primary` → `tip`)
  - `::callout{type}` with `#summary`/`#content` → the directive holding the summary, then `<Expandable title="Details">` around the content
  - `::list{type}` → a plain list
  - `::badge{type}` → `<Badge>`
  - `::button-link{href}` → a link
  - `::terminal{content}` → a `bash` fence
  - `::card-grid` + `::card{icon}` with `#title`/`#description` → `<CardGroup>` + `<Card>`
  - `::block-hero` → the landing page
  - `::code-block{label}` → a titled fence in `<CodeGroup>`
  - `::video-player{src}` → `<video>`
  - `::sandbox`, `::props`, `::copy-button`, `:ellipsis` → drop (report)
- **URLs:** Nuxt Content 2 routes the same way, so check the old sitemap for trailing slashes and pin heading ids as above.

## Dropped — report these

Report each of these, and anything else you drop:

- **Theme:**
  - the brand color, when it was Docus's default emerald
  - Nuxt UI overrides and theme CSS that doesn't map
  - a custom `seo.titleTemplate`, `seo.schema`, and the TOC title
  - logo extras, and socials with no Blume platform
  - a forced color mode (the toggle stays)
  - `navigation.sub: 'aside'` anchors
  - a header button that showed only on the landing page (now site-wide)
- **Navigation:** text-order sorting (`10.` before `2.`), and pages that sorted after a folder.
- **Frontmatter:**
  - `links` (now `related` cards)
  - `sitemap: false`, `toc`, `layout`, and other unknown keys
  - derived descriptions
- **Components:**
  - callout `to` links, callout colors (mapped to the nearest type; `<Callout color>` takes a CSS color when a tint matters), and card colors
  - prompt icons and Windsurf/Claude actions
  - the `code-tree` file browser and `code-preview` live rendering
  - Nuxt UI landing decorations
  - custom and module components
  - brand icons with no SVG
- **Server features:**
  - the site's own MCP tools and prompts
  - server routes and `@vercel/speed-insights`
  - the assistant, if not kept
  - old `/.well-known/skills/` file URLs, and pages whose prose describes any of these
- **Anchors:** old ids that were already broken.
