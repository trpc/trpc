# Fern Docs → Blume

Fern Docs is a hosted platform driven by a `fern/` folder: `docs.yml` declares the **entire** navigation (tabs, sections, pages, the API Reference, changelogs, versions, products), pages are MDX files anywhere under `fern/`, and the API Reference is generated from an OpenAPI/AsyncAPI spec or a **Fern Definition**. Two things set it apart from the other sources:

- **The same `fern/` folder usually drives SDK generation too** (`generators.yml`, `definition/` or `apis/<name>/`). Only the docs move. Never delete or rewrite the API definition, a `generators.yml`, or `fern.config.json` (see [Teardown](#teardown-keep-sdk-generation)).
- **URLs come from `docs.yml`, not from file paths.** A page's URL joins slugs from its tab, sections, and page name, and a frontmatter `slug` replaces most of that. Files sit wherever the team put them (`pages/get-started/welcome.mdx` can serve `/welcome`).

Scope: checked against Fern CLI 5.44.8 and an end-to-end migration of agentmail-to/agentmail-docs (115 pages, a Fern Definition with 149 endpoints and 8 webhooks, 270 old URLs). Versions, products, tab variants, translations, `folder:` entries, and OpenAPI (rather than Fern Definition) inputs weren't in that run: the guidance for them below is untested.

## Detect

- **`fern/docs.yml` beside `fern/fern.config.json`** (run from the repo root), or `docs.yml` + `fern.config.json` in the working directory (run from inside `fern/`). Monorepos nest it (`docs/fern/docs.yml`).
- `fern.config.json` **without** a `docs.yml` is an SDK-only Fern project: the docs live elsewhere (often a Mintlify `docs.json`), so use that source's reference and leave `fern/` alone.
- A stale `fern/docs.yml` can outlive a move off Fern. If the repo also carries another docs config, check which one the live site runs: Fern pages answer with an `x-fern-renderer` header (`curl -sI https://<docs-domain>/ | grep -i x-fern`).

## Run the codemod first

The bundled codemod does the mechanical half: URL computation and file placement, `meta.ts`, frontmatter, the common components, assets, and every redirect. Steps, in order:

1. **Save the old URL list.** Fetch `https://<docs-domain>/sitemap.xml` and keep only the paths, one per line, in `old-urls.txt` (a Fern sitemap can name a different host than the one you fetched). Hidden pages aren't in it; the codemod computes those from `docs.yml`. Run the CORS probe under [Try it](#layout-summary-snippets-try-it) while you're there.
2. **Dry run**, from the folder that holds `fern/` (where `blume.config.ts` goes):

   ```bash
   node <skill>/scripts/fern-codemod.mjs --sitemap old-urls.txt
   ```

   It prints a sitemap diff (`0 computed URL(s) not in it, 0 of its URLs not computed` is the goal; otherwise fix those pages by hand with [Fern's URL rules](#ferns-url-rules) and report them), the `navigation.tabs` entries for the config, which APIs are Fern Definitions, a TODO list of judgment calls, and the icons it couldn't map. `--out` sets the content root (default `docs`), `--public` the public folder, `--fern` the Fern folder. It **stops** on `versions` or `products`: migrate those by hand.

3. **Apply** with `--write`. It moves every published page to a path that reproduces its old URL, writes frontmatter and `meta.ts` files, converts components, moves the assets pages use (and the logo and favicon) into `public/`, and saves `fern-migration.json`. A YAML or JSON file a page links to (a spec offered for download) is copied, not moved, since SDK generation may read it. It's idempotent: a rerun skips moved pages.
4. **Write `blume.config.ts`** from [Config](#config-docsyml--blumeconfigts), with the printed tabs and `logo.href` set to the page `/` now redirects to.
5. **Set up the API reference** ([API reference](#api-reference)): export a Fern Definition, write the overlay (tag names, webhooks, idempotency headers), add `openapi()`.
6. **Build, then list the operation routes**:

   ```bash
   npx blume build
   node <skill>/scripts/operation-routes.mjs dist > routes.json
   npx fern-api@<version> export --api <api-name> spec.json   # JSON because the path ends in .json
   ```

   The join needs a JSON copy of the spec the build rendered: for a Fern Definition, that export (a scratch file, not the committed spec); for a YAML OpenAPI input, `npx @redocly/cli bundle <spec>.yaml --output spec.json`.

7. **Join endpoints and write the redirects**:

   ```bash
   node <skill>/scripts/fern-codemod.mjs endpoints --routes routes.json --spec /api-reference=spec.json --sitemap old-urls.txt          # dry run
   node <skill>/scripts/fern-codemod.mjs endpoints --routes routes.json --spec /api-reference=spec.json --sitemap old-urls.txt --write
   ```

   One `--spec <route>=<file>` per API. It maps every old endpoint, webhook, and group URL to its Blume route, translates `docs.yml` redirects, adds the content-move, changelog, feed, and `/` redirects, rewrites content links that point at old URLs, and checks every old URL is served or redirected (it must print `every old URL is served or redirected`). `--write` saves `fern-redirects.json`; import it:

   ```ts
   import fernRedirects from "./fern-redirects.json" with { type: "json" };
   // in defineConfig:
   redirects: [...fernRedirects],
   ```

   Fix a redirect it flagged by filtering that entry out and adding your own after the spread.

8. **Work the TODO list**, then `blume build`, `blume validate --strict`, `blume audit --only redirects`, SKILL.md's heading-anchor check (`pin-heading-ids.mjs`), and `fern check` after the [teardown](#teardown-keep-sdk-generation).

What it leaves to you: the config, the overlay, the TODO list, the components it names, links already broken on Fern, CI, and contributor docs. It never touches `generators.yml`, the definition, or a spec.

## Inventory

Read `docs.yml` first, then every file it points at: `redirects` (a list, or YAML files that each hold a `redirects:` list), `tabs.<key>.changelog`, every `path:` in `navigation`, `css`, `js`. **Every path in a Fern YAML file is relative to that YAML file.**

- **Unpublished drafts.** Fern builds only the files `docs.yml` references plus each changelog folder; any other `.md`/`.mdx` under `fern/` is a draft nobody sees. The codemod leaves them in place and lists them. Blume would publish them: delete them or move them to a `_`-prefixed folder (`_drafts/`), and report the list.
- **SDK generation.** Every `generators.yml` and its `groups` stay exactly as they are.
- **Second instances.** Each `instances[]` entry is a deployment of the same docs (a second domain, a subpath). One Blume build serves one; report the rest (see [Deploy](#urls-redirects-and-deploy)).

**Where the Blume project goes.** If the repo root has a `package.json`, put `blume.config.ts` there with content in `docs/` (the default root). If it has no JavaScript toolchain (a Python or Go repo whose docs were only `fern/`), make a self-contained docs package (`docs/` holding `package.json`, `blume.config.ts`, and `content.root: "content"`), run the codemod from there with `--fern ../fern --out content`, and say which you chose. Don't make `fern/` itself the content root: it keeps holding the SDK config. See `references/monorepo.md` for workspaces.

## Config: `docs.yml` → `blume.config.ts`

Map only what's set.

| Fern `docs.yml` | Blume | Notes |
| --- | --- | --- |
| `title` | `title` | Fern shows it only in the browser tab; Blume also shows it beside the logo (see `logo`) |
| `logo` (`{ light, dark, href, height, right-text }`) | `logo: { image: { light, dark, alt }, href, text }` | the codemod moves the files into `public/`. Fern shows the image alone unless `right-text` is set, so set **`text: right-text`, or `text: ""`**. A local monochrome SVG can collapse to `logo: "/logo.svg"` with `currentColor` fills (SKILL.md). Set `href` to the first page when nothing serves `/`. `height` drops |
| `favicon` | **drop the field** | the codemod moves the file to `public/favicon.<ext>`; Blume detects it by filename |
| `colors.accent-primary` (or `accentPrimary`), a string or `{ light, dark }` | `theme.accent` | same shape |
| `colors.background` | `theme.background` | same shape |
| `colors.*`, `layout.*`, `settings.*` (others), `theme.*`, `global-theme`, `page-actions`, `experimental`, `check`, `ai-examples`, `libraries`, `roles` | **drop** (report) | `global-theme` merged a registry theme at publish: read its values off the live site |
| `typography.bodyFont` / `headingsFont` / `codeFont` | `theme.fonts.body` / `display` / `mono` | Fern fonts are files in the repo (`path`, or `paths` with `weight`/`style`): each role takes `{ name, variants: [{ src, weight, style }] }` |
| `navbar-links` `type: filled` / `primary` | `navigation.cta` (`{ label: text, href }`) | one only; extra filled links go to `actions`. `url` is Fern's old name for `href` |
| `navbar-links` `type: minimal` / `outlined` / `secondary` | `navigation.actions` (`[{ label: text, href }]`) | text only: link icons drop. A `mailto:` link works |
| `navbar-links` `type: github` / `dropdown` | `github: { owner, repo }` / **no equivalent** | flatten a dropdown into `actions` (report) |
| `footer-links` | `footer.socials` | keys carry over except `twitter` → `x`, `hackernews` → `hacker-news` |
| `footer` / `header` (React files) | **drop** (report) | or a layout slot in `components.ts` |
| `instances[].custom-domain` | `deployment.site` (`https://…`) | only when the target host isn't Vercel or Netlify (SKILL.md). **A domain with a path** (`acme.com/docs`) is a reverse-proxied subpath → `deployment: { base: "/docs" }`. **Several instances** → one Blume build; keep the canonical one (`metadata.canonical-host` names it when set) and report the rest |
| `instances[].edit-this-page.github` (`{ owner, repo, branch }`) | `github: { owner, repo, branch, dir }` | `dir` = path from the repo root to the folder holding `blume.config.ts` |
| `metadata.canonical-host` | `deployment.site` | same host rule as `custom-domain`; a path in it is the `base` above |
| `metadata.og:description` / `twitter:site` | `description` / `seo.x.handle` | other `og:*`/`twitter:*` drop: Blume writes them |
| `announcement.message` | `banner` | a string, or `{ content, link: { text, href } }` |
| `analytics.*` | the matching factory from `blume/analytics` (`posthog`, `googleAnalytics`, `googleTagManager`, `segment`), or `script()` | a `${VAR}` value → `process.env.VAR` |
| `js` (a path, `{ path, strategy }`, or `{ url, strategy }`) | `script({ src \| content, strategy })` per tracking script | a third-party loader ports; code that reads or restyles Fern's DOM (`.fern-*`) doesn't (report it). Fern's strategies (`beforeInteractive`, `afterInteractive`, `lazyOnload`) aren't Blume's (`async`, `defer`): pick one or leave it out. A `<link rel="help" href="/llms.txt">` injection drops: Blume publishes `llms.txt` |
| `css` | a root `theme.css` | `.fern-*` selectors match nothing in Blume; report what you drop |
| `default-language`, `settings.http-snippets` | `codeSamples` on `openapi()` | that language first; a list → that list; `false` → `false` |
| `settings.disable-search` | `search: false` |  |
| `layout.hide-feedback` | `feedback: false` |  |
| `ai-search` / `ai-chat` (Ask Fern) | **drop** (report) | Blume's assistant is opt-in and self-hosted (`ai.assistant`, a provider key, server output); offer it, don't enable it silently |
| `agents.*` | **drop**, or `agents.llmsTxt.details` for directive text | Blume generates `llms.txt` and `robots.txt` |

## Navigation

### Fern's URL rules

The codemod applies these; you need them for its sitemap diff and anything it doesn't handle. Each level contributes a slug, joined outermost first: **product → version → tab → sections → page**.

- **Each slug is the item's `slug:` if set, else lodash `kebabCase` of its display name**: tab `display-name` (not the tab's key), `section:` title, `page:` name. `kebabCase` lowercases, drops punctuation, and splits camelCase and letter/digit boundaries: `API Reference` → `api-reference`, `AgentMail` → `agent-mail`, `SOC 2` → `soc-2`, `v3 (Latest)` → `v-3-latest`.
- **`skip-slug: true`** on a tab, section, or api entry drops that level from the URL but keeps it in the sidebar. A changelog tab ignores it.
- **A frontmatter `slug` is the page's whole URL below any product/version prefix**: it replaces the tab and section slugs too. A `docs.yml` `slug:` replaces only that item's own segment.
- **An `api` entry's base** is its `summary` page's frontmatter `slug` when set; otherwise its `slug` (or `kebabCase(title)`) under the tab.
- **A changelog** serves its index at its slug and **each entry at `<changelog>/<YYYY>/<M>/<D>`** (no zero padding), titled with the date (`September 5, 2026`). Two entry files dated the same day share one URL: Fern merged them into one page.
- **`/`** answers with a 307 to the first page when no landing page is set. **API group paths** (`/api-reference/inboxes/threads`) answer with a 307 to the group's first endpoint and aren't in the sitemap, but content links to them.
- **The first version is the default and has no version segment**; every other version is prefixed with its slug. Products always carry their slug.

### What the codemod builds

- **One folder per tab** at the tab's URL prefix. The tab whose pages share no single prefix (a `skip-slug` tab, or one whose pages all carry root-level frontmatter slugs) becomes the content root, with a tab at `path: "/"`. Only one tab can be the root; the codemod reports a second one, which must move under a prefix (route change, redirects).
- **A section** whose pages share a URL segment → a real folder; one that adds no segment → a `(group)` folder. A section's `path` (its overview page) → that folder's `index.mdx`.
- **A page whose URL departs from its folder** (a frontmatter `slug`) stays in its sidebar folder with `slug` set, since Blume places a page in the sidebar by file path, not route.
- **A file `docs.yml` lists twice** is published once, at its first listing; the other URL redirects there (reported).
- **`meta.ts`** per folder: `pages` in `docs.yml` order, the section title and Lucide icon, and a collapsible section (`collapsed`, `collapsible`, `collapsed-by-default`) → `display: "group"`. Blume lists loose pages above subgroups, so a section that interleaves pages and subsections renders its pages first: report any such reorder.
- **Labels.** Fern labels a page in the sidebar with its `page:` name (or `sidebar-title`) and titles it with frontmatter `title`. So: no `title` → `title: <page name>` (or an H1 that opens the body, which it removes); a different `title` → `sidebar.label: <page name>`. The api **summary** page keeps its `title` with no label (its page name usually repeats the tab label).
- **`hidden: true`** → `hidden: true`, `seo: { noindex: true }`, and `search: { exclude: true }`: Fern keeps hidden pages reachable but out of search and indexing.
- **The root URL.** Nothing serves `/` under a root tab, so it redirects `/` to the first page (307), as Fern did; set `logo.href` to that page. The tab at `/` links to the sidebar's first page on its own. A root `index.mdx` would move the landing page to `/`; do that only if the user wants `/` as the landing URL.

By hand: `availability` (`beta`, `deprecated`, …) → `sidebar.badge` (`Beta`) or `deprecated: true`; `- link:` items → `navigation.featured` (`{ label, href, icon? }`) or an explicit `navigation.sidebar` link (report which); a hidden **tab** (its printed line ends `(hidden on Fern)`) → leave it out of `navigation.tabs`; the codemod already marked its pages hidden.

### Tabs

The codemod prints one `navigation.tabs` entry per tab (`{ label: display-name, path, icon }`). Keep them as header tabs.

- An **`href` tab** (Blog, GitHub, a dashboard) has no content → `navigation.actions` or `navigation.featured`; a GitHub tab → `github`.
- **Tab `variants`** (several sidebars under one tab): the codemod reports them. One subfolder per variant and a tab with `items` (`{ label, path }` per variant); variant pages move, so add redirects and report the approximation.

### Changelog

The codemod moves each entry to `changelog/<YYYY-MM-DD>[-suffix].mdx` (`MM-DD-YYYY` and `MM-DD-YY` names are renamed, so entries sort by date and a two-digit year's month isn't read as an ordering prefix. Fern parsed those in the publishing machine's time zone, so one can sit a day off: the sitemap diff shows it) with `type: changelog`, `date`, and a `title`: the frontmatter one, the date as Fern showed it, or the file suffix sentence-cased (`agentid-sign-in-keys` → "Agentid sign in keys"). **Review every suffix title** (`AgentID sign-in keys`); the TODO list names them. `tags` → `changelog.category` (the first) and `search.tags` (all).

- **Same-day entries.** The day's Fern URL redirects to the unsuffixed entry, or else the first by file name. Fern showed both on one page: consider linking the second from the first, and report it.
- `overview.mdx` (or `index.mdx`, `summary.mdx`) → its text goes into `changelog: { title, description }` in `blume.config.ts`, since an `index.mdx` would replace Blume's generated `/changelog` index (a list, where Fern's index rendered whole entries). Its `layout` and `authors` drop.
- A non-date file (`TEMPLATE.mdx`) was never published: move it out or `_`-prefix it, and update it to Blume's format if contributors copy it.
- The feeds `/<changelog>.rss` (`.atom`, `.json`) redirect to `/changelog/rss.xml`, which needs a site URL.
- For a public GitHub repo, offer `githubReleases()` as SKILL.md "Changelogs" says; keep the files when the user says the entries are curated rather than release notes.

### Versions and products (by hand, untested)

- **`versions`** → Blume's native versioning (`docs/content/versioning.mdx` in the installed package). The first Fern version is the live tree at the content root; every other version → a folder named by its slug, listed in `versions.archived`. Place each version file's `navigation` with the same rules; a `ref:` version lives in git, so check it out. Per-version API references → one `openapi()` each, with its own `route`.
- **`products`** → one folder per product plus `navigation.selectors: [{ kind: "product", label, items }]`.
- `<If versions products>` → keep each folder's matching branch.

## Content and components

The codemod writes every page as `.mdx` and converts:

- **Callouts.** `<Note>`, `<Tip>`, `<Info>`, `<Warning>`, `<Success>`/`<Check>`, `<Error>`, `<Launch>`, and `<Callout intent>` (no intent → `info`, as Fern rendered it). A top-level one becomes a `:::type[Title]` directive (dedented). One whose icon maps to Lucide (a directive can't set one), or one nested in a component, becomes `<Callout type title icon>`; an icon with no Lucide equivalent drops (reported).
- **Code groups.** `<CodeBlocks>` → `<CodeGroup>`; every untitled fence inside a group gets Fern's language title (`title="Python"`, `title="cURL"`). Blume labels an untitled grouped fence by its language anyway, so the title only keeps Fern's spelling. `<CodeBlock title>` wrappers are unwrapped onto the fence: Blume's `<CodeBlock>` renders a wrapped fence, but not the wrapper's `title`.
- **Fence metas.** Multi-word bare titles are quoted (Fern and Blume both read every word of ` ```js Snippet with title` as the title), `filename=` → `title=` and `wordWrap` → `wrap` (Blume warns `BLUME_CODE_FENCE_OPTION` on the Fern spellings), `env` → `dotenv` (Shiki has no `env`: `BLUME_UNKNOWN_CODE_LANGUAGE`).
- **Cards and accordions.** `<Cards>` → `<CardGroup>`, card icons → Lucide, Fern-only card props drop. `<AccordionGroup>`/`<Accordion>` → `<Accordion>`/`<AccordionItem>`; a lone `<Accordion>` is wrapped in one.
- **`<Icon>`**: icon → Lucide, `size` × 4 (Fern counts in 4px units). **`<Frame>`**: `background` drops. **`<Tab language>`**: `language` drops (Blume syncs same-titled tabs).
- **`<ParamField path>`** → `<ParamField name>`: Fern's `path` is the field's name, and Blume's `path=` would mark it a path parameter. `toc` drops. Nested fields in an `<Indent>` (reported) → an `<Expandable title="properties">` in the parent field's body.
- **Snippets.** `<Markdown src="/snippets/x.mdx" planName="x" />` → `<include planName="x">/_snippets/x.mdx</include>` on a line of its own, with the snippet moved to `<content-root>/_snippets/`. Its `{{planName}}` placeholders carry over as written; Blume reads an include prop only when its name starts with a lowercase letter, so rename any that don't.
- **Embeds and comments.** A YouTube iframe → `<YouTube id>` (a playlist embed → `<YouTube url>`); `allowfullscreen`/`frameborder` → `allowFullScreen`/`frameBorder` (MDX drops the lowercase forms silently); `<!-- -->` → `{/* */}`.
- **Assets.** `/assets/x.png` and `../x.png` → moved into `public/` at their path from `fern/` and linked root-absolute. A YAML or JSON file is copied instead (SDK generation may read it; the copy goes stale when it changes). An asset no page or config references stays put: move or delete it.
- **Links.** Absolute links to the docs' own domain → root-relative; links to moved pages, endpoints, and Fern's `api:METHOD/path` syntax → the new routes (the `endpoints` step).

**Reported for you to convert** (a leftover Fern tag gets a `BLUME_UNKNOWN_COMPONENT` warning, or crashes the page):

| Fern | Blume |
| --- | --- |
| `<EndpointRequestSnippet endpoint="POST /x">`, `<EndpointResponseSnippet>` | a hand-written fenced sample plus a link to the operation page: Blume can't embed an operation's sample in prose |
| `<EndpointSchemaSnippet>`, `<Schema>`, `<SchemaSnippet>`, `<WebhookPayloadSnippet>`, `<RunnableEndpoint>` | a link to the operation page; a small schema can become a `TypeTable` |
| `<Badge intent outlined>`, `<Availability type>` | `<Badge variant stroke>` (`success`, `warning`, `error` → `danger`, `tip` → `accent`); an availability that labels the page → `sidebar.badge` |
| `<Code src title>` | `<include meta='title="…"' lang="…">./path</include>` with the file inside the content root |
| `<Files>`/`<Folder>`/`<File>` | `<Tree>`/`<Tree.Folder>`/`<Tree.File>` |
| `<Versions>`/`<Version title>` | `<Tabs>`/`<Tab title>` |
| `<If>` (roles), `<Feature flag>` | the public or default content; ask before dropping role-gated text |
| `<Button href>`, `<Download src>`, `<Copy>` | a link (or `<Card href>`), a link to the file in `public/`, inline code |
| `<Aside>`, `<Indent>`, `<StickyTable>`/`<SearchableTable>`/`<PaginatedTable>` | the content inside |
| `<Prompt title>`, `<ScrollWalkthrough>` | `<Prompt description>`; `<Steps>` with a code block per step |
| `<ChangelogTags>`, `<Template>` | delete (report) |

Not reported, but check: headings inside `<Steps>` (Fern makes each a step) → one `<Step title>` each; `<Anchor id>` → `<a id="x"></a>`; `<llms-only>`/`<llms-ignore>` → `<Visibility for="agents">`/`<Visibility for="web">`; `maxLines` → `expandable`; inline `$…$` math → `$$…$$`; custom React components → an island or a `components.ts` override. **Unclosed fences** (Fern rendered an empty block): the codemod closes them at the end of the file and reports them; delete the stray fence.

### Frontmatter

Fern ignores unknown keys; Blume's schema is strict. The codemod maps `title`, `sidebar-title` → `sidebar.label`, `subtitle` → `description` (Blume renders `description` under the title), `description` → `seo.description` when `subtitle` took `description`, `headline` → `seo.title`, `slug`, `noindex` → `seo.noindex`, and the `docs.yml` `icon`. It reports every other key; map these by hand:

| Fern | Blume |
| --- | --- |
| `canonical-url` | `seo.canonical` (absolute) |
| `image`, `og:image` | `seo.image` |
| `keywords` | `search.keywords` (a list) |
| `last-updated` | drop it everywhere and set `lastModified: "git"` site-wide; retire any workflow that stamps it, since the key now fails the build |
| `layout` | `mode`: `overview`/`reference` → `wide`, `page` → `center`, `custom` → `custom`, `guide` → drop |
| `hide-nav-links: true` | `pagination: false` |
| `availability` | `sidebar.badge`, or `deprecated: true` |
| `position` (orders pages in a `- folder:` entry) | `sidebar.order` |
| `hide-toc`, `force-toc`, `max-toc-depth`, `hide-feedback`, `hide-page-actions`, `no-image-zoom`, `breadcrumb`, `search-metadata`, `edit-this-page-url`, `logo`, `nofollow`, `jsonld:breadcrumb`, `og:*`, `twitter:*`, `excerpt`, `tags` | drop (report) |
| keys Fern never read (`sidebar_position`, `lastUpdated`) | drop |

### Icons

Fern uses Font Awesome; Blume is Lucide-only. The codemod normalizes Fern's spellings (`fa-solid fa-bolt`, `solid bolt`, bare `bolt`), maps them to Lucide names Blume bundles, and reports the rest. Most brand icons (`discord`, `google`, `aws`, `python`, `node-js`, `x-twitter`) have no Lucide equivalent: they drop. An image path on a component (`icon="./icons/x.svg"`) → `public/` and a root-absolute path; one in `docs.yml` is reported for you to move. For icons you write yourself (config, hand conversions), check each name from the folder holding `blume.config.ts`; an unknown icon renders nothing:

```bash
node -e "const p=require.resolve('@iconify-json/lucide/icons.json',{paths:[require('path').dirname(require.resolve('blume/package.json'))]});const j=require(p);for(const n of process.argv.slice(1))console.log(n,n in j.icons||n in (j.aliases||{}))" zap mail-check discord
```

## API reference

Each `- api:` entry → one `openapi()` (or `asyncapi()`/`graphql()`) source from `blume/reference`, with **`route` set to the api entry's old base URL** so the overview keeps its address, and a tab at that route. Find the spec each entry renders:

- `specs:` on the api entry → those files (`type: openapi | asyncapi | graphql`).
- Otherwise `api-name: <name>` → `fern/apis/<name>/`, or `fern/` with one API. There, `generators.yml` `api.specs` lists OpenAPI/AsyncAPI files (older projects use top-level `openapi:`/`async-api:`); **a `definition/` folder is a Fern Definition**, which the codemod's dry run names.

### OpenAPI and AsyncAPI inputs

- **Point `spec` at the file where it lives** (SDK generation reads it too).
- **Fern `overrides`** are Fern's deep-merge format, not OpenAPI Overlays. Most hold only `x-fern-*` SDK extensions, which Blume ignores; content an override changes for readers → an Overlay in `overlays`. Fern's own `overlays:` files carry over.
- **`x-fern-ignore: true` operations would appear** in Blume: remove them with an overlay action (`target: $.paths.*[?@['x-fern-ignore'] == true]`, `remove: true`), likewise operations an api entry's `audiences` filtered out.
- gRPC and OpenRPC references have no Blume renderer: report them.

### Fern Definition inputs → export to OpenAPI

Blume can't read a Fern Definition. Export it with the Fern CLI, which runs offline with no login:

```bash
npx fern-api@<version from fern/fern.config.json> export --api <api-name> openapi/<api-name>.yml
```

- The output is **OpenAPI 3.0.1** (Blume upgrades it). Operation ids are `<package path>_<endpoint>` (`inboxes_threads_list`); each Fern package becomes one PascalCase tag (`InboxesThreads`); `info.title` is the API's name with an empty `version`.
- **It drops webhooks, WebSocket channels, and `idempotency-headers`.** Restore the first and last with the overlay below; a WebSocket channel has no Blume page, so redirect its old URL to the guide that covers it and report it.
- **A committed export.** If the repo already commits an OpenAPI generated from the definition (a `fernapi/fern-openapi` generator group writing locally, or a CI step running `fern export`), point `spec` at it, then check it isn't stale: export to a scratch path and diff. If they differ, report it and refresh it with the repo's own command (`fern generate --group <group> --local`), not a second copy. Look for workflows that trigger on that file (a release pipeline) before committing a refresh. Only when nothing produces a committed file, commit your export and add a `"docs:spec"` script that reruns it.

Docs-only changes go in an overlay so the spec stays regenerable. The agentmail overlay, abridged:

```yaml openapi/docs.overlay.yaml
overlay: 1.1.0
info: { title: Docs fixes, version: 1.0.0 }
actions:
  - target: $.info
    update: { title: AgentMail API }
  # Tags are flat in Blume: name the concatenated package tags.
  - target: $.paths.*.*.tags[?@ == 'InboxesThreads']
    update: Inbox Threads
  # Fern's sidebar order.
  - target: $
    update:
      tags: [{ name: Inboxes }, { name: Inbox Threads }]
  # Webhooks the export dropped: their payload schemas survive in components.
  - target: $
    update:
      x-webhooks:
        messageReceived:
          post:
            summary: Message Received
            tags: [Webhook Events]
            requestBody:
              content:
                application/json:
                  schema: { $ref: "#/components/schemas/MessageReceivedEvent" }
            responses:
              "200":
                description: Return a 2xx status to acknowledge the event.
  # One action per `idempotent: true` endpoint in the definition.
  - target: $.paths['/v0/inboxes/{inbox_id}/messages/send'].post.parameters
    update:
      - name: Idempotency-Key
        in: header
        schema: { type: string }
```

**Restore webhooks this way** rather than redirecting their pages: one `x-webhooks` entry per webhook in the definition, keyed by its name, with a `$ref` to its payload schema. Blume upgrades `x-webhooks` to `webhooks` and gives each a page at `<route>/<tag-slug>/<kebab-name>`, which the `endpoints` step matches to the old URL. Nested packages (`Inboxes › Threads`) become sibling tags: report the lost nesting.

### Layout, summary, snippets, Try it

- **`summary`** (a page shown at the API's root) → the codemod places it at `<route>/introduction.mdx`, a normal page in the reference sidebar. The old base URL serves Blume's overview, which renders `info.description`.
- **`layout`**, `alphabetized`, `flattened`, `paginated` → Blume orders tag groups by the top-level `tags` list (set it in the overlay) and operations within a tag in the spec's order (paths as listed, each path's methods as written). An endpoint order that `layout` or `alphabetized` set and the spec doesn't share → a `pages` list of operation slugs in `<route>/<tag-slug>/meta.ts`, or report it. An endpoint's `title` → its `summary` via overlay; `hidden: true` endpoints → remove them or let them show (ask).
- **`snippets`** (SDK package names) → Fern rendered SDK calls; Blume generates HTTP-client samples. Add `x-codeSamples` through the overlay to keep SDK calls, or report the loss.
- **Try it.** Fern's API Explorer proxies requests; Blume's playground sends them from the browser, so the API must answer CORS for the docs origin. Probe it:

  ```bash
  curl -si -X OPTIONS https://<api-host>/<path> -H 'Origin: https://<docs-domain>' -H 'Access-Control-Request-Method: GET'
  ```

  No `Access-Control-Allow-Origin` in the answer → `playground: false`, and report it; the alternative is `playground: { proxy: true }`, which needs server output and a host adapter (SKILL.md). `environments: []` → `playground: false`; `oauth: true` → Blume takes a pasted token and doesn't run the flow (report).

### API URLs

The `endpoints` step computes these; check its output against them.

- **Fern Definition**: the operation id split on `_`, each part kebab-cased, under the base: `inboxes_threads_list` → `/api-reference/inboxes/threads/list`.
- **OpenAPI**: with `x-fern-sdk-method-name`, `<base>/<x-fern-sdk-group-name>/<x-fern-sdk-method-name>`; otherwise `<base>/<first tag>/<the operation id minus the tag's leading words>`, or the summary when there's no operation id. Each part kebab-cased (`v1` → `v-1`). Read from Fern's parser, not from a migrated site: the `endpoints` step's coverage check catches any URL it gets wrong.
- **Group paths** → the overview's anchor for that tag: `/api-reference/inboxes/threads` → `/api-reference#inbox-threads` (307, as Fern's was). Content linking to a group gets the same anchor; `blume validate` checks it.

Blume routes rarely match Fern's (the `endpoints` step skips any that do), and a pattern redirect over the old prefix also covers the new pages (`BLUME_REDIRECT_MATCHES_PAGE`), hence one exact redirect per endpoint. Don't shorten operation ids with an overlay: OpenAPI needs them unique across the whole spec, and shortened ones repeat (`list` in every tag), which warns `BLUME_OPENAPI_DUPLICATE_OPERATION_ID`.

## URLs, redirects, and deploy

- **`docs.yml` redirects** → `{ from, to, status }`: Fern's `permanent` defaults to true (308), `permanent: false` → 307; Blume's own default is 301, so the codemod writes the status. `:name` and `:name*` carry over; `:name+` and regex groups are reported (expand them into exact entries). A destination that moved is followed to its final route, and a `:slug*` pattern into the reference expands into one entry per operation. Trailing-slash duplicates merge.
- **A destination that's neither a page nor another redirect** was already broken on Fern (the TODO list names it): point it at the intended page and report it.
- **`blume validate --strict` finds links that already 404 on Fern.** Fix the link, don't add a redirect for it, and report the list.
- **A subpath instance** (`acme.com/docs`): sources, destinations, and links carry the subpath; strip it, since Blume adds `base` itself. Serving both a domain and a subpath means two builds.

## Teardown (keep SDK generation)

**Keep**, even with no docs left in it: `fern/fern.config.json`, every `generators.yml`, the Fern Definition, every spec, override, and overlay a `generators.yml` references, and CI steps that run `fern check`, `fern generate --group <sdk>`, or `fern export` (with the `FERN_TOKEN` secret if they use it).

**Remove**, once migrated: `fern/docs.yml`, redirect YAML files, the docs folders that moved (pages, `changelog/`, `snippets/`, assets, docs `components/`, `css`/`js`), CI steps and wrapper scripts that publish or preview the docs (`fern generate --docs`), and the `fern-api` dependency only if nothing else uses the CLI.

Then **grep the repo for the old paths and syntax**: `fern/pages`, `fern/changelog`, `fern/snippets`, `docs.yml`, `<CodeBlocks>`, `<Note>`, `last-updated`. Contributor docs (`AGENTS.md`, `CONTRIBUTING.md`, templates) and generators that write into `fern/snippets/` need the new paths, frontmatter, and components. Run `fern check` afterwards.

Repoint `package.json` scripts to `blume dev`/`build`/`preview`, add `blume`, and regenerate the lockfile (SKILL.md step 6). Tell the user what can't be committed: moving the custom domain's DNS (or the proxy behind a subpath instance) off Fern, then unpublishing the site in the Fern dashboard.

## Dropped: report these

- **Hosted features**: the API Explorer's proxy, login-injected credentials, and OAuth flow; Ask Fern search and chat; AI-generated examples; **Fern's docs MCP server (`/_mcp/server`)**, which has no static equivalent (Blume's MCP server is at `/mcp` and needs server output; `.md` page mirrors and `llms.txt` carry over), so update content that advertises it; the dashboard, analytics, preview links, RBAC and authenticated docs (host-level protection instead, per the deployment docs' **Private docs** section), feature flags.
- **API reference**: SDK snippets (unless rebuilt as `x-codeSamples`), WebSocket channel pages, a `layout` or `alphabetized` endpoint order you didn't rebuild with `meta.ts`, nested sections, hidden endpoints, gRPC/OpenRPC references.
- **Navigation and theme**: dropdown and link icons, approximated variants, sidebar reorders, moved `link` items, extra `colors`, `layout`, custom `header`/`footer`, `css` aimed at `.fern-*`, and `js` that isn't a tracking script.
- **Content**: API embeds replaced by samples or links, code tooltips, `<ChangelogTags>`, role gating, and each dropped frontmatter key.
- **Icons** with no Lucide equivalent, by name and where they were used.
- **Unpublished drafts** and what was done with them.
- **Second instances** and what replaces them.
