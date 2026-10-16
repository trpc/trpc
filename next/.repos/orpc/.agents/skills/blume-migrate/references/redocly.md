# Redocly → Blume

Covers **Redocly Realm** and the products on the same project format (Redoc, Revel, Reef, alone or combined), usually hosted and edited in **Reunite**. A project is a `redocly.yaml`, `.md` pages written in **Markdoc** (`{% tag %}`, not MDX), optional `sidebars.yaml` files, and API description files in the content tree, each rendered as a reference **at its own path**. The work: Markdoc tags become directives and components, each page's body H1 becomes `title`, sidebars become folders and tabs, and every API operation URL changes shape, so the old ones get generated redirects.

## Detect

A **Realm-family project** has at least one of these (`redocly.yaml` is optional; Realm builds a bare folder of Markdown):

- a `sidebars.yaml`, or a prefixed `<name>.sidebars.yaml`, at the root or in a section folder;
- `.md` pages using Markdoc tags (`{% admonition`, `{% tabs`, `{% partial`);
- `@theme/`, `_partials/`, `@l10n/`, or `@<version>/` folders, or `*.page.tsx` React pages;
- a dependency on `@redocly/realm`, `@redocly/redoc`, `@redocly/revel`, `@redocly/reef`, or a combined package (`@redocly/redoc-revel`, `@redocly/redoc-reef`, `@redocly/revel-reef`). Reunite builds projects with no `package.json`, so a missing one proves nothing.

Three look-alikes:

- **A lint/bundle-only `redocly.yaml`**, with none of the above and only keys Redocly CLI reads (`extends`, `rules`, `decorators`, `preprocessors`, `plugins`, `apis`, `resolve`, `telemetry`), configures `redocly lint`/`bundle`. Leave it untouched and migrate the framework the docs actually use.
- **The legacy Redocly Developer Portal** (Gatsby; `siteConfig.yaml`, `theme.ts`, a `@redocly/developer-portal` dependency, `.mdx` pages, `*.page.yaml` reference pages, and a `sidebars.yaml` that maps named sidebars to groups of `pages:`). Its content is MDX with `:::` admonitions, so this file's Markdoc mappings don't apply: use SKILL.md's general model, this file's Config, API reference, and URL sections, and tell the user it was the legacy portal.
- **A standalone Redoc embed** (an HTML page loading `redoc.standalone.js` with `<redoc spec-url>` or `Redoc.init`, or a `redocly build-docs` script): migrate only the spec, with `openapi({ spec })`, and rewrite links to its `#tag/…`/`#operation/…` anchors. A Redoc-product project (`@redocly/redoc` alone) has no Markdown either.

**Keep the content where it is**: `content.root: "."`, with `content.include` scoped to the real content folders (`["guides/**/*.{md,mdx}", "apis/**/*.{md,mdx}"]`, per `references/monorepo.md` §1), plus each root-level page by name (`"index.{md,mdx}"`, `"changelog.{md,mdx}"`). A root `*.md` glob would also publish `README.md`, which Realm never did. Routes then keep their paths, `/`-rooted partial paths keep resolving, and the description files stay where `redocly.yaml`'s `apis.*.root` and the lint scripts expect them.

**Realm publishes every `.md` in the project** except the root `README.md` and `public/`, partials folders, `static/`, `@theme/`, and the `ignore` globs, so the old sitemap often lists accidental pages: `.github/pull_request_template`, files under `.claude/`, planning notes. Leave those out of `content.include`, add no redirect for them, and list them in the report so the user can add one if they want full URL coverage. Underscore-prefixed files outside a partials folder were pages in Realm but are excluded by Blume's default `**/_*`: rename any that are real pages (`content.exclude: ["!**/_*"]` would publish every partial too).

## Config: `redocly.yaml` → `blume.config.ts`

Resolve `$ref`s first (`redirects: { $ref: ./redirects.yaml }` is common). Product folders can hold their own `redocly.yaml`, and `env.<environment>` blocks override per environment: map the production values and report the rest.

| Redocly | Blume | Notes |
| --- | --- | --- |
| `seo.title` (`seo.projectTitle` when set) | `title` | Blume appends ` - <title>` to every docs page's `<title>` (not to a page titled the same as the site). Realm added a suffix only with `projectTitle`, so on most Realm sites this is a visible change: report it |
| `seo.description` | `description` |  |
| `seo.siteUrl` | `deployment.site` | unless the new host is Vercel or Netlify (auto-detected). Cloudflare Pages exposes only a per-deploy URL, so keep it there |
| `seo.meta` (`[{ name, content }]`), `seo.keywords` | `seo.metatags` (`{ [name]: content }`, `keywords: "a, b"`) | minus the tags Blume writes itself; the build names the setting that owns a refused tag |
| `seo.lang` | nothing for English; else `i18n: { defaultLocale: "<code>", locales: [{ code: "<code>", label: "<language name>" }] }` | `label` is required |
| `seo.image`, `seo.jsonLd`, `seo.llmstxt` | **drop** (report) | Blume generates per-page cards, JSON-LD, and `llms.txt`; a page in `llmstxt.excludeFiles` gets `ai.exclude: true` |
| `logo.image` / `logo.srcSet` (`"./l.svg light, ./d.svg dark"`), `altText`, `link` | `logo` / `logo: { image: { light, dark, alt }, href }` | move the files into `public/`; a wordmark also gets `text: ""` |
| `logo.favicon` | **drop the field**: copy the file to `favicon.<ext>` or `icon.<ext>` in the root or `public/` | detected by filename, for `.svg`, `.png`, and `.ico` only: convert any other format |
| `navbar.items` | `navigation.tabs` / `actions` / `cta` | see Navigation |
| `footer.items` (columns, each a `{ group, items }` or a single item) | `footer.links` (one row) + `footer.socials` | flatten every column's items in order (`page` → its route). Links to a platform in Blume's `footer.socials` list (`docs/configuration/index.mdx`) become socials; a podcast (Spotify, Apple Podcasts) is `podcast`; others (TikTok) stay links. `copyrightText` → `footer.copyright`. Column labels drop (report) |
| `redirects` (`'/from': { to, type }`) | `redirects: [{ from, to, status: type }]` | write `from` without a trailing slash; a trailing `/*` carries over as written (`{ from: "/a/*", to: "/b/*" }`), and also matches the bare `/a`. Blume takes 301/302/307/308 only |
| `markdown.toc` | `toc: { maxHeadingLevel: <depth> }`, or `toc: false` for `hide` | Realm's default depth 3 is Blume's default |
| `markdown.lastUpdatedBlock` | `lastModified: "git"`, **only when declared** and not `hide: true` | Realm shows "Last updated" by default; if the source left it at that, offer `lastModified: "git"` in the report. Either way, every page the migration edits (nearly all of them, since each H1 moves) shows the migration commit's date; a rename alone keeps the page's date. Say so |
| `markdown.editPage.baseUrl` | `github: { owner, repo, branch, dir? }` | the path after the branch → `dir`; a non-`github.com` origin → `host` |
| `ignore` | `content.exclude: [ … ]` | the globs add to Blume's defaults (`**/_*`, `**/.*`), so `_partials/` stay out of routing |
| `colorMode` | `theme.mode` | `ignoreDetection` with a first mode of `dark` → `"dark"` |
| `banner` (a list) | `banner: { content, link: { href, text }, dismissible }` | one banner: keep the first unscheduled, untargeted one. `content` is plain text, so a Markdown link in it becomes `link`; colors, targets, schedules drop |
| `feedback` | `hide: true` → `feedback: false`; `type: comment` → `{ comments: true }` | other types drop |
| `search` | omit (built-in Orama); `suggestedPages` → `search: { provider: orama(), popular }` (`orama` from `blume/search`) | `engine` and `filters` (facets) drop |
| `analytics` | `ga.trackingId` (a `G-` id) → `googleAnalytics({ id })`, `gtm.trackingId` → `googleTagManager({ id })`, `amplitude.apiKey` → `amplitude({ key })`, `segment.writeKey` → `segment({ key })`, `heap.appId` → `heap({ id })`, `adobe.scriptUrl` → `adobe({ url })`, `fullstory`/`rudderstack` → `script()` | from `blume/analytics`. A `UA-` id is Universal Analytics, dead since 2023: drop it and say so |
| `scripts.head` / `scripts.body` | one `script({ src, strategy, attributes })` each in `analytics` | local `./static/x.js` → `/x.js`; `async`/`defer` → `strategy`. **Adapters in `analytics` load only in production builds and wait for consent when `consent` is set.** A script the page needs to work (a support widget, a form embed that buttons call) goes in a `PageFooter` layout slot component instead (`<script is:inline src="…">`), which runs in `blume dev` too. That slot renders on every content page, API operation pages included, but not on `mode: custom` or `frame` pages or custom `pages/`: report where the script is now missing |
| `links` | a Google Fonts stylesheet → `theme.fonts` (`{ body, display, mono }`) | each role a curated slug, or `{ name: "Family" }` for anything else; mind renamed families (Source Sans Pro is `source-sans-3`). `preconnect` links drop |
| `access` (`requiresLogin`, `rbac`, `sso`, `idps`), root `rbac`/`requiresLogin`/`sso`, `ssoDirect`, `userMenu` | **drop** | Blume has no login: point at host-level protection (deployment docs, **Private docs**), which covers the whole site; report every protected path |
| `l10n` (older: `i18n`) | `i18n` | see i18n |
| `apis`, `openapi`, `graphql` | `reference` adapters; **keep `apis` in `redocly.yaml`** | see API reference |
| `products` (`{ id: { name, folder, icon } }`) | `navigation.selectors: [{ kind: "product", label, items: [{ label: name, path: "/<folder>" }] }]` |  |
| `aiAssistant`, `mcp` | nothing | offer `ai.assistant` / `agents.mcp` (server output) as follow-ups |
| `mockServer`, `catalogClassic`, `entitiesCatalog`, `scorecard*`, `developerOnboarding`, `apiFunctions`, `skills`, `corsProxy`, `responseHeaders`, `reunite`, `removeAttribution`, `palette`, `breadcrumbs`, `codeSnippet`, `navigation`, `navbar.hide`, `footer.hide`, `sidebar.hide` | **drop** (report) | `consent` → a `blume/consent` adapter if the site runs one; `navigation.actions` are Blume's default page actions |
| `extends`, `rules`, `decorators`, `preprocessors`, `plugins`, `resolve`, `telemetry`, `recheck` | **keep in `redocly.yaml`** | see Teardown |
| `'{{ process.env.X }}'` | `process.env.X` in `blume.config.ts` |  |

## Navigation: `sidebars.yaml` and `navbar` → folders and tabs

With no sidebar file, Realm generates the sidebar from the file tree (natural sort, `index` first), which Blume's generated sidebar reproduces. Otherwise every file ending in `sidebars.yaml` is a sidebar (one only pulled in through another's `$ref` isn't), `page:` paths resolve from the sidebar file (or the project root with a leading `/`), and **a page no sidebar lists shows no sidebar** (unless its frontmatter `sidebar.path` names one): in Blume's generated tree it would appear. `sidebar.hidden: true` hides it, but also drops it from search, the sitemap, and `llms.txt`, where Realm still listed it: hide only orphans nobody should find, and report which you hid. Realm labels default to the page's `seo.title`, then its first heading, so most `label`s only restate the new `title`.

- **`group` + `items`** → a folder with a `meta.ts` (`title`, and `pages` in the declared order). A group whose pages sit flat beside others, or come from several folders, has no on-disk counterpart: move its pages into a subfolder (a page the group opened becomes its `index`, keeping its URL; the others get redirects) or use an explicit `navigation.sidebar`, per SKILL.md "Config-declared nesting".
- **`label`** → `sidebar.label`, only where it differs from `title`. **`href`** → an explicit sidebar link or `navigation.featured`. **`directory`** → leave the folder to the generated sidebar. **`$ref`** → inline it.
- **`expanded`**: Realm groups collapse by default, which `navigation.sidebar.display: "group"` reproduces. `expanded: true`/`always` → `collapsed: false` in that folder's `meta.ts`. **`menuStyle: drilldown`** → `display: "page"`.
- **`separator`** and **`separatorLine`** have no equivalent: a labeled separator heading a run of pages is usually better as a group; report the rest.
- **`badges`** → `sidebar.badge` (first name). **`icon`** → Lucide (Icons). `rbac`, `disconnect`, `additionalProps`, `external`, `*TranslationKey` drop.
- **An API description listed as a `page`** places that API's generated tree. Blume can't put generated operation pages into an explicit `navigation.sidebar`; they sit wherever the source's `route` puts them (see API reference).

**Several sidebars → header tabs.** Realm gives each page the sidebar that lists it, so one sidebar file per section (`guides/sidebars.yaml`), or top-level `tab:` entries in `sidebars.yaml`, is a tabbed site: one `navigation.tabs` entry per section folder (a `tab` with `menu:` → a tab with `items`). The root sidebar's pages, if they share no folder, get a tab with `path: "/"` and an `href` to their landing page; Blume picks the longest matching tab path, so section routes still select their own tab.

**`navbar.items`**: an item that opens a section with its own sidebar is that section's tab. The first item into the root sidebar is the root tab; other items into the same sidebar become `navigation.actions`, or drop if they duplicate a tab's target. A "Sign up" button → `navigation.cta` with an absolute URL; a GitHub link → `github`.

## Content: Markdoc → MDX

Blume parses `.md` as plain Markdown; directives, components, and ` ```mermaid ` fences need `.mdx`. **Rename only the pages that end up with one of those** (`<include>` works in `.md` too), and leave the rest `.md`, so the diff stays small and their history keeps its file names. Then fix what MDX parses differently, in pages and in every partial an `.mdx` page includes (an included partial parses as MDX):

- **Angle-bracket autolinks** (`<https://…>`, `<team@acme.com>`) fail to compile: write `[text](url)` or a bare URL.
- A literal `{` or `}` in prose: escape it or put it in inline code. **HTML comments** → `{/* */}`.
- **Raw HTML** must be JSX-valid: string `style="…"` → `style={{ … }}` or a class in `theme.css`; close void tags (`<br />`). `<figure>` + image + `<figcaption>` reads better as `<Frame caption="…">` around the image. A raw `<iframe>` of a YouTube video → `<YouTube id="…" />`.
- **File links follow the rename**: Blume resolves `./setup.md` by source file, trying the other extension when that file is gone, so a link to a page renamed `setup.mdx` still lands on it, `slug` and numeric prefix included. Update them anyway: a link to the old name breaks wherever the Markdown is read as files, such as on GitHub.

**Every Markdoc tag must be converted**: in `.md` an unconverted tag ships as literal text with a green build, and `blume check` and `build` only warn `BLUME_TEMPLATE_TAG` at its line (in `.mdx` the page fails to compile, and `blume check` and `validate` report it as `BLUME_MDX_SYNTAX`). Finish with `grep -rn '{%' <content folders>` returning only samples that document Markdoc itself, in code where the warning skips them.

**The body H1 is the title.** Realm renders the page's first `# H1` and uses it for `<title>`, sidebar label, and breadcrumb (unless the page sets `seo.title`; a page with no H1 uses its first heading of any level). Move it to frontmatter `title`, delete it from the body, and demote any later H1 to `##`. Links to the H1's own anchor (`#<h1-slug>`, often the first entry of a hand-written contents list) now break: remove them or point them at the page.

| Markdoc | Blume (`.mdx`) |
| --- | --- |
| `{% admonition type="info" name="Title" %}` … `{% /admonition %}` | `:::info[Title]` … `:::` (`success`, `warning`, `danger` keep their names; `idea` → `tip`). No `name` → no brackets |
| `{% tabs %}` / `{% tab label="X" %}` | `<Tabs>` / `<Tab title="X">`; `tabs id="k"` → `param="k"`. **A group of tabs that each hold only a code fence** → `<CodeGroup>` with titled fences (` ```ts title="X" `); a bare fence directly inside `tabs` was a tab named by its `label` |
| `{% code-group %}` | `<CodeGroup>` with titled fences; `mode="dropdown"` → `<CodeGroup dropdown>` |
| `{% partial file="…" variables={a: "x"} /%}` | `<include a="x">…</include>` on its own line (Partials) |
| `{% raw-partial file="…" /%}` | inline the file's text |
| `{% code-snippet file="./x.js" title="x.js" /%}` | `<include lang="js" meta='title="x.js"'>./x.js</include>` (the file inside `content.root`). `from`/`to`/`before`/`after` ranges: paste the lines into a fence instead (report) |
| `{% cards columns=N %}` / `{% card title to icon image %}` | `<CardGroup cols={N}>` / `<Card title href icon img>`; `layout="horizontal"` → `horizontal` |
| `{% accordion-group %}` / `{% accordion title expanded %}` | `<Accordion>` / `<AccordionItem title defaultOpen>` |
| `{% numbered-list %}` / `{% numbered-item %}` | `<Steps>` / `<Step title>` (an item's leading heading becomes `title`) |
| `{% img src alt caption /%}` | `![alt](src)`, inside `<Frame caption="…">` when it had a caption. `srcSet` light/dark pairs have no equivalent: keep one image (report) |
| ` ```mermaid ` fence, `{% diagram type="mermaid" %}` | a ` ```mermaid ` fence (inline the file), in an `.mdx` page. PlantUML and Excalidraw have no renderer: export to SVG (report) |
| `{% icon name="…" /%}`, `{% inline-svg file /%}` | `<Icon icon="<lucide-name>" />`, `![alt](./file.svg)` |
| `{% table %}` | a pipe table (raw HTML for `colspan`/`rowspan`) |
| `{% if %}` / `{% else /%}` | no conditionals: keep the branch the live site showed; per-reader branches (`$rbac`, `$user`) keep the public one (report) |
| `{% $frontmatter.x %}` / `{% $env.PUBLIC_X %}` | the literal value / `{{public-x}}` with a `variables` entry (`"public-x": process.env.PUBLIC_X ?? ""`: values must be strings, so an unset variable would fail the config) |
| `{% json-schema %}`, `{% json-example %}`, `{% openapi-code-sample %}`, `{% openapi-response-sample %}`, `{% replay-openapi %}` | a fenced sample or a `TypeTable`, or a link to the operation page, which renders samples and Try it itself (report) |
| `{% markdoc-example %}`, `{% login-button %}`, `{% connect-mcp %}`, `{% code-walkthrough %}` | the fence only / drop (report); a walkthrough becomes prose and fences or `<Steps>` |
| `## Heading {% #id %}` / `{% .class %}` | `## Heading [#id]` / drop |
| any other tag | a custom tag from `@theme/markdoc/schema.ts`: rewrite its markup, or make its component an island (`islands/<Name>.tsx`, used as `<Name …/>`) |

**Code fences**: Realm reads fence meta only from an annotation: ` ```js {% title="app.js" highlight="{2,4-6}" %} ` → ` ```js title="app.js" {2,4-6} `, and `highlight="/word/"` → `// [!code word:word]`. A bare word after the language was ignored by Realm but becomes a title in Blume: delete stray ones. `[!code highlight|++|--|word|focus|error|warning]` comments carry over.

**Partials** live in `_partials/` folders at any depth, which Blume also keeps out of routing. `markdown.partialsFolders` replaces that default: add the folders it names to `content.exclude` (which keeps Blume's defaults) or rename them with a leading `_`. A leading `/` in `file` meant the project root, which is `content.root` when that's `"."`. Variables become lowercase attributes (`favFood` → `favfood`), read in the partial as `{{favfood}}`; a partial that read `$frontmatter` needs the value passed in. A partial used only by `.md` pages can stay `.md`.

## Frontmatter

| Redocly | Blume |
| --- | --- |
| body `# H1` | `title` |
| `title` (top level) | **drop.** Realm never rendered it on Markdown pages (`<title>` was the H1), so moving it to `seo.title` would change live titles. Offer it in the report when it looks like a deliberate SEO title |
| `description` (top level) | `description` (Realm used the site description instead; this improves the meta description) |
| `seo.title`, `seo.description`, `seo.image` | the same keys (`seo.title` was also Realm's sidebar label: copy it to `sidebar.label` to keep that) |
| `seo.keywords` | `search.keywords`, as a list (a string splits on commas). Blume uses them as search terms and writes no per-page `<meta name="keywords">` |
| `excludeFromSearch: true` | `search.exclude: true` + `ai.exclude: true` (+ `noindex: true` to keep it out of the sitemap, as Realm did) |
| `slug` | `slug` (a full route); a list → the first as `slug`, the others as redirects |
| `redirects: { '/old/': {} }` | a config `redirects` entry per path, `from` without the trailing slash. Exact entries beat wildcards, as in Realm |
| `sidebar: { hide: true }` (hides the sidebar on this page; it doesn't take the page out of one) | `mode: center`. Not `sidebar.hidden`, which removes the page from the navigation, search, and the sitemap |
| `sidebar: { path }` (which sidebar this page shows) | drop: the tab whose `path` holds the page decides its sidebar |
| `navigation.nextButton` + `previousButton` `hide: true` | `pagination: false` |
| `navbar`/`footer` hidden | `mode: custom` (the header only: no sidebar, title, or footer). The header always shows: report a hidden navbar |
| `rbac` | drop; report the page as access-controlled |
| `markdown.*`, `codeSnippet`, `breadcrumbs`, `colorMode`, `feedback`, `search`, `versionPicker`, `banner`, `template`, `keywords` (Typesense search curation), `seo.meta`/`jsonLd`/`lang`/`priority` | drop (report what was set) |
| top-level `editPage` (including legacy `editPage: { disable }`) | drop without reporting: Realm reads only `markdown.editPage`, so it never had an effect |
| custom keys (`metadata`, …) | `frontmatter.extend` if the site needs them, else drop |

## API reference

Realm renders every description in the content tree (a `.yaml`/`.json` with a top-level `openapi:`, `swagger:`, or `asyncapi:` key, or a `.graphql` schema) **at its path without the extension**: an overview at `/apis/orders/openapi`, a page per tag, and a page per operation below it. `apis` entries match files by `root` and carry lint and display settings; a description needs no entry to render. List every description, and report any `apis.*.root` that points at a missing file.

- **Use `openapi()`** from `blume/reference`, one source per description: like Realm, it gives each operation its own page and URL. (`scalar()` would collapse each API onto one page.) AsyncAPI → `asyncapi()`; GraphQL → `graphql()` with `endpoint`. Leave the files where they are.
- **Choose each `route`.** When the description shares its folder with guides (`apis/orders/openapi.yaml` beside `apis/orders/quick-start.md`), keep the old path (`route: "/apis/orders/openapi"`): its overview URL survives, and the reference sits in that folder's group beside the guides. **When the description is alone in its folder** (`apis/orders/openapi.yaml` and nothing else), the old path nests the reference's group inside a folder group that holds only it: use the folder as the route (`route: "/apis/orders"`), so the reference is that group. That moves one overview URL, which the catch-all below covers. Either way, `label` (the `sidebars.yaml` label, else the spec's `info.title`) names the group. Choosing a route inside a topic folder elsewhere moves the reference to where a `sidebars.yaml` had placed it, at the cost of more redirects; say which you chose. Add a `navigation.tabs` entry if an API was a top-level section.
- **Spec problems fail `blume validate --strict`** (`BLUME_OPENAPI_*` warnings, e.g. path parameters declared `in: query` or missing). Fix them with an OpenAPI Overlay in the source's `overlays`, leaving a generated spec untouched, and report them for a fix at the source.
- **Decorators don't run.** Realm applies `decorators` (`remove-x-internal`, `filter-out`, `info-override`), and the `preprocessors` and `plugins` behind them, when it bundles a description; Blume reads the raw file. When any are configured, point `spec` at `redocly bundle <api> --output <file>` output or express the change as an Overlay.
- **Tag labels and order.** Blume reads `x-displayName` for each tag group's label, and orders tags as the spec's `tags` list does and operations as the spec lists them. `x-tagGroups` isn't read: when the spec has them and their flattened order (how Realm ordered tags) differs from `tags`, write `<route>/<tag-slug>/meta.ts` with `defineMeta({ order })`, the tag's position there (the folder under `content.root`, mirroring the route; it must sit in a folder `content.include` reaches, or `BLUME_META_OUTSIDE_INCLUDE` warns that it's never read). It merges over the generated title and order. Get each tag's folder name from Blume's routes (below), not by slugifying. `x-tagGroups` names drop, and tags left out of every group, which Realm hid, now appear: report both. `x-traitTag`, `x-logo`, and `x-badges` are ignored.
- **Code samples**: `codeSamples.languages[].lang` (root and per-API `openapi:`) → `codeSamples`; Blume reads Redocly's names (`curl`, `JavaScript`, `Node.js`, `Python`, `Java`, `C#`, `PHP`, `Go`, `Ruby`). `R`, `Payload`, `Java8+Apache`, and `C#+Newtonsoft` have no generator and warn `BLUME_OPENAPI_UNKNOWN_CODE_SAMPLE`: drop them and report. With no languages set, Realm showed its full default list and Blume shows `curl`, `js`, `python`: report the difference. `x-codeSamples` render natively. `codeSamples`, `playground`, and `expandSchemas` are `openapi()` options, shared by all its sources: APIs whose settings differ go in separate `openapi()` entries.
- **Try it**: `hideReplay: true` → `playground: false`. Realm proxied Try it requests by default; Blume sends them from the browser. Set `playground: { proxy: "<url>" }` only for a proxy the user runs; **never carry over a Redocly-hosted one** (`/_api/cors/`, the default; `https://cors.redocly.com`; `https://cors.redoc.ly`). Probe each API's server for CORS with `curl -si -X OPTIONS -H 'Origin: https://<docs-host>' -H 'Access-Control-Request-Method: GET' <server-url>/<some-path>` and list the ones without a matching `access-control-allow-origin` as a follow-up: `playground: { proxy: true }` fixes them once the user picks a server-output host.
- **Other display options**: `excludeFromSearch` → the source's `includeInSearch: false`; `schemasExpansionLevel: all` → `expandSchemas: true`; `layout`, download buttons, `showExtensions`, `feedback` (Blume's page rating shows on every overview and operation page, with no per-source switch), `mockServer`, and the rest drop (report).

## URLs and redirects

**Save the old URL list first**: a Realm site with `seo.siteUrl` serves `<site>/sitemap.xml`, listing every page **and every API overview, tag, `section/`, and operation page**. Every URL on it must end up a Blume page or a redirect to one.

- **Page routes.** Realm slugs the file path: lowercased, spaces → `-`, `_` and `.` kept, **numeric prefixes kept**. Blume keeps the filename's case and its spaces, and strips a numeric prefix followed by `-`, `_`, or `.` (`01_setup` → `/setup`; a date like `2024-01` or a version stays whole). Rename mixed-case and spaced files to match; a numbered file needs `slug` (or a redirect) to keep its number; a nested `README.md` (Realm `/…/readme`, Blume `/…/README`) becomes `readme.md` to keep its URL.
- **Moved pages** (materialized groups, `index` promotions, tabs) and **Realm's own redirects** (config, frontmatter `redirects`, extra `slug`s) all become `redirects`. A long generated list reads best in its own `redirects.ts` module, imported into `blume.config.ts`.
- **Operation pages change shape.** Realm: `<old route>/<tag-slug>/<operationId lowercased>` (`getMultipleDomains` → `getmultipledomains`, `Domains.getDomain` → `domains.getdomain`), or `<old route>/<tag-slug>/paths/<JSON pointer>/<method>` with no `operationId` (`…/paths/~1pets~1%7Bid%7D/get`). Realm tag slugs keep underscores. Blume's slugs differ, so write **one exact redirect per operation**, generated:
  1. `blume build` once with the references configured.
  2. `node <skill>/scripts/operation-routes.mjs dist > operation-routes.json` prints, per reference route, every endpoint (`GET /pets/{id}`, or `POST petAdopted` for a webhook) mapped to its Blume route, read from the build itself (a Vercel server build's pages are in `.vercel/output/static`: pass that). `--spec <route>=<file.json>` adds operationIds (convert YAML first: `npx @redocly/cli bundle openapi.yaml --output openapi.json`).
  3. For each old operation URL, find its operation in the spec: match the last segment against each `operationId` lowercased, or decode the pointer (`%7B` → `{`, `~1` → `/`, `~0` → `~`) to a path plus method. Look up `METHOD path` under the new route, and emit `{ from: <old URL path>, to: <route> }`.
- **Tag, `section/`, and tag-description heading pages** (`<old route>/<tag>`, `<old route>/section/<heading>`, `<old route>/<tag>/<heading>`) don't exist in Blume: send them to the overview. When the route moved, one catch-all does it: `{ from: "<old route>/:path*", to: "<new route>" }` (exact operation entries still win). When the route stayed, use `{ from: "<route>/section/:path*", to: "<route>" }` and `{ from: "<route>/:tag", to: "<route>" }`, plus exact entries for tag headings; a pattern that covers a page fails the build (`BLUME_REDIRECT_MATCHES_PAGE`).
- **Legacy hash links** (`#operation/<id>`, `#tag/<tag>`, `#section/…`) worked on Realm, which resolved them in the browser, and still appear **in content, partials, and the description files' own descriptions**. A server can't redirect a fragment. `blume validate` flags one on a page that still exists as a broken anchor, but accepts any redirect `from` as a link target, so it misses the ones whose path now redirects: `grep -rn '#operation/\|#tag/' <content> <spec files>` and rewrite each to its Blume route. Rewrite absolute links to the site itself (`https://<docs-host>/…`) to root-relative paths too; `blume audit` flags the ones left.
- **Trailing slashes.** Realm answered `/a/` with a 301 to `/a`, and so do `blume dev` and `blume preview`, for pages and redirect sources alike. In production it depends on the host: static hosts serve a page's `a/index.html` at `/a/`, and server builds (`vercel()`, `node()`) match `/a/` for a redirect `from`, but whether a static host applies a redirect rule to the slashed form varies. When old links used trailing slashes (frontmatter `redirects` often did), check one slashed redirect on a preview deployment and report it.
- **Versions and locales**: Realm drops the `@` from version folders (`api/@v1/x.md` → `/api/v1/x`) and serves the default version without its segment; non-default locales get the lowercased code (`@l10n/es-ES/` → `/es-es/…`).
- **Check coverage**: after the build, every old URL should be a page in `dist/` (`<path>/index.html`) or resolve through `dist/blume-redirects.json` (exact entries first, then patterns) to one. That manifest is written for a static build with no host adapter; with one, request each URL from a running `blume dev` (or `blume preview` of a static build) instead: both answer every redirect, patterns included. `blume audit --only redirects` checks the redirects themselves.

## Assets, theme, React pages, and the repo

- **`static/` → `public/`**: Realm serves `static/` at the root, so root-relative references keep working. Drop a Redocly-hosting `robots.txt` (`/~/`, `/cdn-cgi/` rules); Blume writes its own.
- **`.gitignore`**: Realm projects often list `public/` (and sometimes `_partials`), which would leave moved files uncommitted: remove those lines. Add `.blume/`, `dist/`, and `.env.local`, as `blume init` does.
- **Node**: Blume needs Node 22.19 or later, and Realm templates often pin 20 in `.nvmrc`. Update `.nvmrc`/`.node-version`, `engines.node`, and CI `node-version`.
- **`@theme/styles.css`**: the brand color (`--color-primary-base` or the variable it points at) → `theme.accent`; check it against dark mode, which `blume audit` checks for contrast. Rules for the site's own classes (a landing page, figures) move to a root `theme.css`, with `html.dark` selectors rewritten as `[data-theme="dark"]`. Rules for Realm's components don't apply: report them.
- **`@theme/components/*`**: a component a page uses → an island (`islands/`, or imported by a custom page with `client:*`); an ejected Realm component → the matching layout slot if one exists, else drop. `@theme/layouts`, `Templates`, `plugin.*`, and `markdoc/` drop once their tags are converted.
- **`*.page.tsx`**: `index.page.tsx` → `pages/index.astro` on `PageLayout`, with interactive parts as React islands, or an `index.mdx` with `mode: custom` when it's mostly links. Its `export const frontmatter` gives the title. `404.page.tsx` → `pages/404.astro`, or Blume's built-in 404. A React-state light/dark image swap becomes two images with CSS hiding one.

## i18n

`l10n: { defaultLocale, locales: [{ code, name }] }` → `i18n: { defaultLocale, locales: [{ code, label: name }] }`. Pages under `@l10n/<code>/` move to `<code>/` at the content root. Blume uses `code` as written in URLs, so write it lowercase (`es-es`, folder too) to keep Realm's URLs. `translations.yaml` label keys → per-locale `meta.ts` titles and tab label maps; UI strings → `i18n.ui` where Blume has one; report the rest.

## Versions

Realm versions a folder through `@<version>/` subfolders and an optional `versions.yaml` (`default`, order; with no `default`, the last listed version is the default); the default version serves without its segment. Blume's versioning is site-wide:

- **Version folders at the content root** → Blume versioning: the default version becomes the current tree (`versions.current: { label }`, required), the others top-level folders listed newest first in `versions.archived` as `{ id, label? }` (ids start with a letter: `@1.0` → `v1.0`, redirect `/1.0/:path*`).
- **A versioned section** (`api/@v1/`) → plain folders reproduce the URLs: the default version's files move up into `api/`, the others into `api/v1/` (a name like `1.0` stays whole). Add a `navigation.selectors` entry `{ kind: "version", … }` and report the missing old-version notice and version-scoped search. Versioned descriptions → one `openapi()` source each.

## Icons

Realm icons are Font Awesome names (`book`, `solid check-circle`, `brands github`) or image paths. Strip the pack prefix and map to Lucide with the table in `references/mintlify.md`; image paths work as written; brand icons other than the few Lucide ships (listed there, `github` among them) have no Lucide match (report).

## Teardown — keep lint and bundle working

1. **Trim `redocly.yaml`, don't delete it**: remove the portal keys and keep `extends`, `rules`, `decorators`, `preprocessors`, `plugins`, `resolve`, `telemetry`, and each `apis` entry's `root`, `output`, `overlays`, and lint keys (drop its `openapi`/`graphql`/`theme` display keys). If nothing but `apis` roots remain, keep it anyway when scripts or skills run `redocly lint`; otherwise ask. Run the lint script before and after: the result should match.
2. Keep `@redocly/cli` and its scripts and CI jobs. Remove the Realm-family packages, `styled-components` and the other template peers nothing else imports (keep `react`/`react-dom` if an island uses them), and the `realm` scripts; add `blume` and the `blume dev`/`build`/`preview` scripts.
3. Delete `sidebars.yaml` files, `versions.yaml`, `@theme/`, the React pages once rebuilt, `translations.yaml` once mapped, the `tsconfig.json`/`types.d.ts` that only served them, and the redirects file a `$ref` pointed at.
4. Reunite settings (custom domain, environment variables, teams, hosted analytics) live outside the repo: list what the user must recreate.

## Dropped — report these

Login, RBAC, and SSO (every protected path); Reunite's editor, reviews, previews, and feedback dashboard; the API explorer's mock server, environments, saved auth, and default CORS proxy (and which APIs now fail CORS); `x-tagGroups` names and the tags they hid; API tag and `section/` pages (redirected); sidebar separators and `expanded: always`; footer column labels; the ` - <title>` suffix now on every `<title>`; dropped frontmatter titles; `seo.image`/`jsonLd` and `llms.txt` sections; extra banners; search facets; resolved `if` branches and per-reader content; `code-snippet` ranges; the Markdoc tags with no equivalent; PlantUML/Excalidraw; light/dark image pairs; unmatched icons; ejected components and Realm CSS; a `UA-` analytics id; scripts that now load only in production; trailing-slash URLs; the accidental pages left out; reset "last updated" dates.
