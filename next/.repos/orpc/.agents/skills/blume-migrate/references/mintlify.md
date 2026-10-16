# Mintlify → Blume

The deepest migration. Mintlify declares its **entire navigation in `docs.json`**; Blume derives navigation from the filesystem. The bulk of the work is reshaping content into folders + tabs and translating config, callouts, and icons.

## Detect

- `docs.json` (current) or `mint.json` (legacy) at the repo root — the config file.
- A `mintlify` dependency / `mintlify dev` script.
- Content is `.mdx` under the repo root (Mintlify has no `content.root` — pages live at the top level), with a `/snippets` folder and image dirs like `/images`.

Read `docs.json` first; it drives everything.

## Config: `docs.json`/`mint.json` → `blume.config.ts`

Resolve `$ref` includes first (Mintlify splits config across files). Map only what's set:

| Mintlify | Blume | Notes |
| --- | --- | --- |
| `name` / `title` | `title` |  |
| `description` | `description` |  |
| `logo` (string or `{ light, dark, href }`) | `logo` (string, or `{ image: { light, dark, alt }, text, href }`) | Mintlify's `light`/`dark` nest under Blume's `image`; ensure files land in `public/`. **If the SVG is local and monochrome** (a solid black or white mark), rewrite its `fill`/`stroke` to `currentColor` and collapse `{ light, dark }` to the string shorthand `logo: "/logo.svg"` — one file that inherits the theme text color and flips with light/dark automatically. If the logo is a **wordmark** (brand name baked in), set `text: ""` so it doesn't render twice beside `title` |
| `favicon` (string **or `{ light, dark }`**) | **drop the field** — copy the file(s) into `public/` under conventional names (`favicon.svg`/`icon.png`) | Blume auto-detects by filename; there is **no** favicon config field. A `{ light, dark }` source maps to a filename pair: light file → `public/icon.png`, dark file → its `-dark` sibling `public/icon-dark.png` (same directory and extension — convert if the formats differ) |
| `colors.primary` + `colors.light` | `theme.accent` (`{ light, dark }`) | accent is now **per-mode**: `accent: { light: <colors.primary>, dark: <colors.light> }`. If Mintlify sets only `primary`, collapse to the string shorthand `accent: "<colors.primary>"` (applies to both modes) |
| `colors.dark` | `theme.action` |  |
| `appearance.default` | `theme.mode` (`light`/`dark`/`system`) |  |
| `appearance.strict` | **drop** | `theme.strict` was removed — writing it is a config error |
| `background.color.{light,dark}` | `theme.background` (`{ light, dark }`) | one field now: `background: { light: …, dark: … }` (a bare string applies to both) |
| `background.image` | `theme.backgroundImage` (`{ light, dark }`) | same per-mode shape as `background` |
| `background.decoration` | **drop** | no Blume equivalent |
| `fonts.family` / `fonts.{heading,body}.family` | `theme.fonts.{display,body}` | a curated slug (kebab-case, e.g. `space-grotesk`) maps directly; any other Google family maps to the object form `{ name: "Family Name" }`; a self-hosted font (`fonts.*.src` URLs) maps to `{ name, variants: [{ src, weight }] }` after downloading the files into the project |
| `banner` | `banner` (`{ content, dismissible, id, link: { href, text } }`) | **only** those keys — drop `banner.color`/`banner.type` |
| `styling.latex: true` | **drop the field** — block math `$$…$$` renders in `.mdx` with no config | there is **no** `markdown.math` field; Blume writes inline math with two dollar signs too — convert each inline `$…$` to `$$…$$` inside the sentence, checking every pair is math and not currency or a shell variable |
| `styling.codeblocks.theme` | `markdown.code.theme` (`{ light, dark }`) |  |
| `search.prompt` | **drop** | no equivalent |
| `seo.metatags` | `seo.metatags`, minus the tags Blume writes itself | keep verification tokens, `theme-color`, and the like as written; Blume refuses `description`, `robots`, `og:title`/`og:description`/`og:image`/`og:url`/`og:type`/`og:site_name`, `twitter:*` card tags, and `article:*` dates, so move those to their settings (`og:image` → `seo.og` or a page's `seo.image`, `twitter:site` → `seo.x.handle`) and drop the rest. `seo.paths` (folder tags) has no equivalent: set per-page `seo` frontmatter |
| `seo.indexing: "all"` | `search.indexing.includeHiddenPages: true` |  |
| `variables` (`{{name}}`) | `variables` | same syntax and names (letters, digits, `_`, `-`); pages keep their `{{name}}` references unchanged |
| `integrations.posthog` (`{ apiKey, apiHost, sessionRecording }`) | `posthog({ key, host })` in the `analytics` list | preserve the host verbatim (e.g. `us.posthog.com` — Blume's default is `us.i.posthog.com`); `sessionRecording: false` → `disable_session_recording: true`; every adapter is imported from `blume/analytics` |
| `integrations.ga4` (`{ measurementId }`) | `googleAnalytics({ id })` |  |
| `integrations.gtm` (`{ tagId }`) | `googleTagManager({ id })` |  |
| `integrations.plausible` (`{ domain, server }`) | `plausible({ domain, host })` | `server` is a bare hostname; `host` is an origin — prepend `https://` |
| `integrations.fathom` (`{ siteId }`) | `fathom({ site })` |  |
| `integrations.pirsch` (`{ id }`) | `pirsch({ code })` |  |
| `integrations.mixpanel` (`{ projectToken, region }`) | `mixpanel({ token, region })` |  |
| `integrations.amplitude` (`{ apiKey }`) | `amplitude({ key })` |  |
| `integrations.segment` (`{ key, cdnUrl }`) | `segment({ key, cdn })` |  |
| `integrations.hightouch` (`{ writeKey, apiHost }`) | `hightouch({ key, host })` |  |
| `integrations.heap` (`{ appId }`) | `heap({ id })` |  |
| `integrations.hotjar` (`{ hjid, hjsv }`) | `hotjar({ id, version })` | both numbers |
| `integrations.clarity` (`{ projectId }`) | `clarity({ id })` |  |
| `integrations.logrocket` (`{ apiKey }`) | `logrocket({ id })` |  |
| `integrations.clearbit` (`{ publicApiKey }`) | `clearbit({ key })` |  |
| `integrations.adobe` (`{ launchUrl }`) | `adobe({ url })` |  |
| any other `integrations` script | `script({ src, strategy, attributes })` / `vercel()` in the `analytics` list | one `script()` adapter per provider without a factory |
| `telemetry` (`{ enabled: false }`) | `feedback: false` | Mintlify's switch also turned off its feedback widgets; Blume sends no telemetry of its own, so only the rating needs turning off |
| Feedback toggles in the Mintlify dashboard (not in `docs.json`) | `feedback: { comments: true }` for contextual (written) feedback | ask whether the site collected written feedback; Blume sends comments through the `analytics` adapters as `feedback_comment` events. Code-snippet feedback, edit suggestions, and raise-issue have no equivalent: report them |
| `integrations.cookies` (`{ key, value }`), or a content-folder `.js` file that injects Osano or Ethyca/Fides | `consent`, imported from `blume/consent`: `osano({ customerId, configId })` (both IDs from the `cmp.osano.com/<customerId>/<configId>/osano.js` URL), `ethyca({ privacyCenter })` (the origin that serves `fides.js`), or `native()` for Blume's own banner | Mintlify's `cookies` pair only switched off its own telemetry for readers whose localStorage lacked the value; under `consent`, every `analytics` adapter waits for the reader instead. Delete the injector script. Another consent manager (Transcend, OneTrust, …) has no adapter: report it |
| A root `skill.md`, or `.mintlify/skills/<name>/SKILL.md` | move each into a `skills/<name>/` folder and set `agents.skills: "./skills"`; drop Mintlify-only frontmatter (`groups`) | Blume already generates a skill for the site at `/skill.md` (`agents.skillMd`, on when `deployment.site` is set); a root `skill.md` replaces it only if its `name` matches the site's title slug (`Acme Docs` → `acme-docs`), so set that name |
| `contextual` (`["copy","chatgpt","claude",…]`) | **mostly free** | Copy-as-Markdown and Open-in-chat are default page actions; `mcp` needs `agents.mcp.enabled` + server output (report as a follow-up) |
| `footer` (`{ socials, links }`) | `footer: { socials, links }` | `socials` keeps its keys, except `twitter`/`x-twitter` → `x` and `earth-americas` → `website`; a key outside Blume's list drops (report); `links` is one row of `{ label, href }`: every column's `items` flatten into it in order, and each column's `header` drops (report) |
| `api.mdx` (`{ server, auth: { method, name } }`) | `api: { server, auth: { method, name } }` | the defaults for `api`-frontmatter pages |
| `api.playground` (`{ display, proxy }`) | `api: { playground }` | `display: "none"` → `playground: false`; `"simple"` has no site-wide form, so set `playground: simple` in each page's frontmatter; `proxy` (on by default in Mintlify) → `playground: { proxy: true }`, which needs a server-output adapter, or leave it off to send directly |
| `redirects` (`{ source, destination, permanent }`) | `redirects: [{ from, to, status }]` | `source` → `from`, `destination` → `to` as written, patterns included (`/beta/:slug*`, `/old/article-*`); `permanent: false` → `status: 307`, otherwise `status: 308` |
| `navigation.languages` | `i18n` | see i18n below |

A minimal result is often just `defineConfig({ title, logo, theme: { accent } })`.

## Icons: FontAwesome → Lucide (required)

Mintlify defaults to **FontAwesome**; Blume is **Lucide-only**. Convert every icon reference — frontmatter `icon`, nav-group `icon`, `<Icon>`, `<Card icon>` — to the closest Lucide name. Discard Mintlify's `iconType` (solid/regular/brands) entirely.

**Automate the frontmatter pass — don't hand-edit it.** `scripts/mintlify-codemod.mjs` (in this skill, zero-dependency) remaps every **frontmatter** `icon:` using the table below, drops icons with no Lucide equivalent, and — in the same pass — drops/renames unsupported frontmatter keys (see [Frontmatter](#frontmatter)). It's deterministic and idempotent, and reports what it changed per file plus what it couldn't (unknown icons, OpenAPI-stub flags):

```bash
# <skill> = this skill's directory (the one containing SKILL.md); dry run first (report only), then apply:
node <skill>/scripts/mintlify-codemod.mjs <content-dir>
node <skill>/scripts/mintlify-codemod.mjs --write <content-dir>
```

The codemod touches **only frontmatter**. Icons in MDX **body** (`<Icon icon="…">`, `<Card icon="…">`, nav-group icons in `docs.json`) it does not see — convert those by hand using the same table. Common mappings:

| FontAwesome | Lucide |  | FontAwesome | Lucide |
| --- | --- | --- | --- | --- |
| `bolt` | `zap` |  | `gear`/`cog` | `settings` |
| `circle-info`/`info` | `info` |  | `wand-magic-sparkles`/`magic` | `sparkles` |
| `house` | `house` |  | `magnifying-glass` | `search` |
| `gauge`/`gauge-high` | `gauge` |  | `puzzle-piece` | `puzzle` |
| `envelope` | `mail` |  | `file-lines` | `file-text` |
| `pen-to-square` | `square-pen` |  | `trash-can` | `trash-2` |
| `xmark`/`times` | `x` |  | `circle-check` | `circle-check` |
| `triangle-exclamation` | `triangle-alert` |  | `circle-exclamation` | `circle-alert` |
| `arrow-right-from-bracket` | `log-out` |  | `right-to-bracket` | `log-in` |
| `location-dot`/`map-marker` | `map-pin` |  | `comments` | `messages-square` |
| `cube` | `box` |  | `cubes`/`boxes` | `boxes` |
| `layer-group` | `layers` |  | `diagram-project`/`sitemap` | `workflow`/`network` |
| `chart-line` | `chart-line` |  | `chart-simple`/`chart-column` | `chart-column` |
| `flask` | `flask-conical` |  | `robot` | `bot` |
| `screwdriver-wrench`/`toolbox` | `wrench` |  | `circle-question`/`question` | `circle-help` |
| `life-ring` | `life-buoy` |  | `shield-halved` | `shield` |
| `rocket`/`book`/`book-open`/`code`/`terminal`/`key`/`lock`/`user`/`users`/`database`/`server`/`cloud`/`bell`/`calendar`/`star`/`heart`/`tag`/`folder`/`globe`/`link`/`download`/`upload`/`check`/`copy`/`play`/`filter` | _(same name — verify)_ |

**Rules:** verify each Lucide name exists at [lucide.dev/icons](https://lucide.dev/icons) before writing it. **Brand icons** (`fa6-brands:*`): Lucide still ships a few brand marks, and Blume renders them under the same name — `facebook`, `github`, `gitlab`, `instagram`, `linkedin`, `slack`, `twitter`, `youtube`. Keep those. The rest (`discord`, `x-twitter`, `docker`, `npm`, `python`, `react`…) have **no** Lucide equivalent, and FontAwesome's `apple` is the Apple logo while Lucide's `apple` is the fruit. Where no Lucide counterpart exists, **drop the icon and report it**. An icon that only marks a link to the repository or a social profile usually has a better home: the `github` config (renders the footer's repo link) or `footer.socials`. The build won't catch a wrong name for you: an unknown icon renders nothing, and it's only a warning (`BLUME_UNKNOWN_ICON`) for navigation icons — an icon prop on a component like `<Card>` fails silently — so check every name.

## Navigation: `docs.json` `navigation` → filesystem + tabs

Mintlify's `navigation` object (`tabs`/`anchors`/`dropdowns`/`products`/`versions`/`languages`/`groups`/`pages`) is fully config-declared. **Prefer restructuring content into folders**, not porting the config verbatim:

- **`groups`** (`{ group, pages: [...] }`) → a folder per group. The `group` name → the folder's humanized name or a `meta.ts` `title`. Nested groups → nested folders. `expanded: false` → `meta.ts` `collapsed: true` (inverted). `tag` → the folder/page `sidebar.badge`. `directory` (`card`/`accordion`/`none`, on a group, tab, or the navigation itself) → `meta.ts` `directory` on that folder, or on the content root's `meta.ts` for the whole navigation; it inherits down the tree the same way, and lists the pages on the group's `root`/`index` page. **Folder metadata is a `meta.ts` module** (`export default defineMeta({ title, icon, order, collapsed, pages, display, directory })`), a TypeScript file — **not** JSON. Blume does not read a `meta.json`, so any folder-level config you carry over from the source (or hand-write to preserve a group's label/order/collapse) must be authored as `meta.ts`. (Render mode — flat/group/page — defaults to the global `navigation.sidebar.display` in `blume.config.ts`; a folder overrides its own group with `meta.ts` `display`, or `sidebar.display` in its `index` page's frontmatter.)
- **Config-only nested groups don't exist on disk — you must materialize them, or they flatten silently.** A nested `{ group, pages }` almost never has a matching subfolder: its pages sit **flat in the parent directory** (e.g. `platform/analytics/getting-started.mdx`, `…/quick-reference.mdx`) and the grouping lives **only** in the `docs.json` `pages` array. If you leave the files where they are, filesystem-derived nav sees one flat folder and the inner group vanishes — Mintlify's `Analytics → Reference → {…}` becomes a flat `Analytics → {…}`. To preserve it you must **either** move those pages into a real subfolder (`platform/analytics/reference/`, with a `meta.ts` for the label/`collapsed`), **or** declare the shape in an explicit `navigation.sidebar`. Walk **every** `pages` array recursively and treat any nested `group` object as a folder-move to plan, not files already in place. When inventorying the nav (workflow step 2), record the config nesting depth separately from the on-disk depth — they diverge exactly here.
- **This is the canonical case for `navigation.sidebar` over folders.** Materializing a purely-presentational nested group as a subfolder changes URLs (`/platform/analytics/getting-started` → `/platform/analytics/reference/getting-started`) for no reason other than a visual grouping, forcing a `redirects` entry per page. When you want to keep the nesting **and** the URLs, an explicit `navigation.sidebar` group (`{ label, items }`) is the better trade — it nests the existing routes without moving any file. Pick per group; don't reflexively flatten.
- **`pages`** entries are page refs (paths without extension) → files at the corresponding path. An entry that's `"GET /path"` is an OpenAPI endpoint stub → **delete it** (Blume generates these; see OpenAPI).
- **`tabs`** (top-level `navigation.tabs`, e.g. `App` / `API` / `API reference`) → Blume's **header tabs** `navigation.tabs` (`{ label, path, icon? }`). **Keep them as tabs — do not flatten them into `navigation.sidebar` groups or sections.** Flattening is the easy translation error: it collapses the site's top-level structure into one global sidebar and loses the header tab bar entirely. A Mintlify top-level tab is a header tab; map it to one. Put each tab's pages in **one folder** and point the tab's `path` at it — the tab then scopes the sidebar automatically (under the tab's `path`, the sidebar shows only that folder). **Blume resolves the active tab by URL prefix** (the tab whose `path` is the longest prefix of the current route), so every page in a tab must live under that tab's single `path`. Mintlify tabs freely mix pages from any folder / arbitrary routes; Blume tabs scope by prefix, so a tab that pulls in routes from all over is **not portable as-is**. You have two choices, per tab:
  - **Move the pages under one prefix** so they share the tab's `path` (a route change → add a `redirects` entry for each moved page). This preserves the exact tab grouping.
  - **Accept the closest shape** — assign each shared/cross-cutting page to one tab's folder and link to it from the others — when moving routes isn't worth the churn.

  Call this trade out explicitly in the migration report; don't silently pick one. **The scoping is bidirectional:** on the root/landing route Blume _hides_ every tab folder and lists only untabbed top-level pages — so a Mintlify home whose single sidebar showed everything becomes a lean root list plus one sidebar per tab. That's automatic; don't try to exclude tab folders from the root by hand.

- **`dropdowns`/`products`/`versions`** → `navigation.selectors` (`{ kind, label, items: [{ label, path, icon?, description?, tag? }] }`). Use `kind` `dropdown`/`product`/`version` accordingly.
- **`anchors` / `navigation.global.anchors`** (persistent sidebar-top links — Blog, Changelog, Community, Contact/Support) → **`navigation.featured`** (`{ label, href, icon? }`). These pin to the **top of the sidebar, above every section, on every route** (not tab-scoped) — the right home for Mintlify's always-visible utility links. An external `href` opens in a new tab; an internal one (`/contact`) is build-time validated against your pages. Convert the FontAwesome `icon` to Lucide as usual. (This replaces the old "drop and report" for anchors.)
- **`navbar.links`** (plain header links — Log in, Status, Support) → **`navigation.actions`** (`[{ label, href }]`), rendered in the header left of the icon buttons. A GitHub link → the `github` config (or `navigation.repo` as a URL when the docs repo is private) instead; it renders in the footer, the only place Blume links a repository. Header links hide on phones; a link that must survive there belongs in `featured`.
- **`navbar.primary`** (the header **CTA button** — "Get Started"/"Sign Up", `type: "button"`) → **`navigation.cta`** (`{ label, href }`, singular: Blume renders exactly one filled button). A `type: "github"` primary → the `github` config instead. A route the docs don't serve (the product's own `/signup`) must be an absolute URL, or it raises `BLUME_NAV_MISSING_PAGE`.
- **`languages`** → `i18n`, not a selector (see below).
- Only fall back to an explicit `navigation.sidebar` for a shape the filesystem genuinely can't express.

This reshaping **changes URLs** — a page moved from `getting-started/quickstart` into the API tab's folder becomes `/api/…`, an `index` promotion drops a segment, etc. Record each old→new path and add a `redirects` entry for it (see below); otherwise every existing link and bookmark 404s.

## Content & component transforms

Rewrite each page's MDX:

- **Callouts → directives** (directives are **MDX-only** — Mintlify content is already `.mdx`, so this just works; never rename a page to `.md`): `<Note>`→`:::note`, `<Tip>`→`:::tip`, `<Warning>`→`:::warning`, `<Info>`→`:::info`, `<Check>`→`:::success`, `<Danger>`/`<Error>`→`:::danger`. `<Callout type="x">` maps by type (`caution`→warning, `check`→success). A `title` attr → `:::type[Title]`. A callout with an `icon` or `color` (Mintlify's generic `<Callout icon="key" color="#FFC107">`) stays a `<Callout>` instead, since a directive can't set them: Blume's takes `type`, `title`, `icon` (remap it with the table below), and `color` (any CSS color); drop `iconType`.
- **Accordions — container/item inversion!** Mintlify nests `<Accordion title="…">` inside `<AccordionGroup>`. Blume inverts: `<AccordionGroup>`→`<Accordion>` (container), and each Mintlify `<Accordion title="…">`→`<AccordionItem title="…">` (item).
- **`<Tabs>` → `<Tabs inline>`.** Mintlify renders tabs **borderless** — a strip on a full-width rule with the content flowing beneath as prose — while Blume's `<Tabs>` defaults to a bordered box. Add `inline` to each `<Tabs>` to preserve Mintlify's appearance; every child `<Tab title="…">` is unchanged. Don't add `param` — Mintlify tabs switch in place and don't deep-link to the URL, so plain `inline` is the faithful mapping.
- **These pass through — Blume ships them natively:** `<Columns>`/`<Column>`, `<Expandable>`, `<Tooltip>`, `<Frame>`, `<Panel>`, `<Card>`/`<CardGroup>`, `<Tab>`, `<Steps>`/`<Step>`, `<View>` (its `title` becomes an option in the page's view picker, as on Mintlify; remap its `icon` with the table below and drop `iconType`). Keep them as-is.
- **Code-block titles carry over.** Both read every bare word after the language as the title (` ```ts Acme SDK `), and `wrap` and `expandable` mean the same in both. Mintlify's other fence options don't: `lines` → `lineNumbers` (left as is, it does nothing and warns `BLUME_CODE_FENCE_OPTION`), `highlight={1-2,5}` → `{1-2,5}`, `focus={2}` → a `// [!code focus]` comment on each line, and drop `icon="…"`.
- **`<RequestExample>`/`<ResponseExample>` pass through.** Top-level ones pin to a column beside the page on wide screens, request above response, as on Mintlify; `dropdown` works the same.
- **Hand-written endpoint pages pass through.** `api: "POST /v1/users"` frontmatter, with `authMethod` (`bearer`/`basic`/`key`/`none`) and `playground` (`interactive`/`simple`/`none`), works as on Mintlify: the page's `<ParamField>`s build its Try it panel and request samples. Keep them as written.
- **API fields pass through.** `<ParamField>` (`path`/`query`/`header`/`body`, `type`, `required`, `deprecated`, `default`, `placeholder`) and `<ResponseField>` (`name`, `type`, `required`, `deprecated`, `default`, `pre`, `post`) render natively, nested `<Expandable>` fields included. Keep them as written. An older `<RequestField>` isn't supported: rewrite it as a `<ParamField>`.
- **`<Update>`** (a Mintlify changelog entry) has no component form → convert to a `type: changelog` page, or use the `githubReleases()` source.
- **Snippets become includes.** Blume has no `/snippets` import mechanism; its reuse is `<include>`. Move each snippet into the content folder as a `_`-prefixed partial (`_snippets/x.mdx`, which never renders as a page), and replace `import X from "/snippets/x.mdx"` + `<X prop="v" />` with `<include prop="v">./_snippets/x.mdx</include>` on its own line. In the partial, rewrite each `{prop}` placeholder to `{{prop}}`: include attributes are props read with the variables syntax. Named string imports (`import { foo } from "/snippets/vars.mdx"`) → a site-wide `variables` entry read as `{{foo}}`, or inline the value.

## Frontmatter

Mintlify page frontmatter → Blume's strict schema. **`scripts/mintlify-codemod.mjs --write` does the mechanical rows automatically** (rename, drop, icon-remap) and flags the judgment rows (`openapi`/`asyncapi`) for you — see [Icons](#icons-fontawesome--lucide-required) for the invocation. The table is both the mapping reference and a description of exactly what the codemod does:

| Mintlify | Blume | Codemod |
| --- | --- | --- |
| `title` / `description` | pass through | — |
| `sidebarTitle` | `sidebar.label` | renames |
| `icon` | remapped to a Lucide name in place (top-level `icon` is valid Blume frontmatter; keep it there) | remaps |
| `tag` | `sidebar.badge` | renames |
| `canonical` | `seo.canonical` | renames |
| `og:image` | `seo.image` | renames |
| `hidden: true` | valid top-level in Blume — **kept as-is**; add `noindex: true` yourself if the page must also leave the search index | left (do by hand) |
| `openapi`/`asyncapi` | usually an endpoint stub → **delete the page** (Blume generates operation pages); else drop the key and keep it as a normal page | **flags** for review — never auto-deletes a page |
| `api`, `authMethod`, `playground` | kept as written (a hand-written endpoint page, see above) | left |
| `related` (a list) | kept as written: root-relative paths, URLs, and `{ Title: link }` entries render as Related pages cards | left; `related: true` has no equivalent (Blume has no automatic related pages), so drop it (report) |
| `mode` | `mode`, as written | `default`, `wide`, `center`, `custom`, and `frame` carry over; `assistant` has no equivalent → drop (report) |
| `hideFooterPagination: true` | `pagination: false` | renames (`false` drops, since the links show by default) |
| `keywords`, `boost` | `search.keywords`, `search.boost` | renames |
| `searchable: false` | `search.exclude: true` | renames (`searchable: true` drops, since pages are searchable by default) |
| `public`, `rss`, `groups`, `hideApiMarker`, `iconType` | **drop** (report) | drops |

The codemod leaves the source key in place and reports a conflict rather than clobbering data when a rename target already exists (e.g. a page already has `sidebar.label`) or the value is too structured to move safely — resolve those by hand. Remove any duplicate H1 in the body — `title` renders the H1. (The codemod only edits frontmatter; it never touches the body.)

## OpenAPI

Top-level `openapi`, `api.openapi`, or a per-group/per-tab `openapi` → `reference: [openapi({ sources: [{ spec, label?, route? }] })]`, with `openapi` imported from `blume/reference` (`spec` alone is the single-source shorthand; several per-tab specs become several sources, or several `openapi()` entries when they need different routes; a spec the source embedded with Scalar becomes a `scalar({ spec })` entry). A Mintlify `{ source, directory }` object: `directory` → the source's `route`. An `asyncapi` field maps the same way to `asyncapi({ … })` in the list. **Delete every per-endpoint stub page** (frontmatter `openapi: "GET /path"`, `openapi: "spec.json webhook name"`, or a `"GET /path"` nav entry) — Blume's native renderer generates one real page per operation and per webhook, and shows callbacks on their operation's page. **Add a `navigation.tabs` entry pointing at the reference `route` yourself** (Mintlify's API tab maps to it); the reference does not create a header tab automatically.

- **Vendor the spec.** Mintlify usually points at a spec **URL**. Copying that straight into `spec:` makes every build fetch it at build time — a single point of failure in CI/offline/behind a proxy, and a failed fetch silently drops the reference (leaving the tab pointing at a route that 404s). Prefer downloading it into the repo (`curl … -o openapi/<name>.json`) and pointing `spec` at that local path. If you keep the URL, report the dependency and consider a `prebuild` refresh-with-fallback.
- **Fix endpoint links.** Blume operation routes are `<route>/<slugified-tag>/<slugified-operationId>` (tag `Models` + id `listModels` → `/api-reference/models/list-models`: a camelCase tag or id is split into kebab-case, not just lowercased — see SKILL.md "OpenAPI") — this differs from Mintlify's endpoint URLs, so **rewrite every inbound link to an operation**. `blume validate` resolves operation pages like any other route and flags the ones you miss.
- **Overlays carry over.** An `openapi: { source, overlays: [...] }` object → that source's `overlays` (`openapi({ spec, overlays })`, or `overlays` on each entry in `sources`), in the same order; Blume applies Overlay 1.0 and 1.1 the same way. An overlay Mintlify found only through its `extends` field (auto-discovered, not listed in `docs.json`) must be listed explicitly: Blume doesn't scan for overlays.
- **Code samples carry over.** `api.examples.languages` → `openapi({ codeSamples: [...] })`; Blume generates the same 18 languages and accepts Mintlify's keys and aliases (`bash`, `javascript`, `node`, `csharp`, `dotnet`, `c++`, …) as written. `api.examples.autogenerate: false` → `codeSamples: false`. `x-codeSamples` in the spec needs nothing: Blume renders them ahead of the generated samples.
- **Keep the "Introduction" page.** Mintlify commonly has a written intro/auth page in an "Introduction" group beside the "Endpoints" (openapi) group in the same tab. Keep it: a normal content page placed under the `openapi()` adapter's `route` (e.g. `<root>/api-reference/introduction.mdx`) merges into the reference tab's sidebar alongside the generated operations. Delete only the per-endpoint stubs, not the conceptual pages.

## Assets

Mintlify serves every top-level dir (e.g. `/images`) at the site root. Blume serves `public/` at the site root. **Move root asset dirs into `public/`** (`mv images public/images`) — every `/images/...` reference still resolves, unchanged. Move loose root files (`logo.png`, `favicon.png`) under `public/` too.

## i18n

`navigation.languages` (≥2) → `i18n: { defaultLocale, locales: [{ code, label }] }`. The `default: true` language → `defaultLocale`. Translated content already lives in ISO-code directories, which match Blume's `dir` parser — no file moves. Remove any language selector; language switching is handled by i18n.

Per-language `banner`, `navbar`, and `footer` (on `navigation.languages[]`) merge into the one site-wide config, with each label as a map of language code to that language's text: `banner: { content: { en: "…", fr: "…" } }` (and `link.text`), `navigation.actions`/`cta` labels, and `footer` link labels. Hrefs stay single — Blume moves an internal link into the reader's language itself. A language without an entry shows the default language's text. Report what doesn't merge: a banner or link set for only some languages, or one whose href differs per language.

## Dropped — report these

- **A group's `boost`** (on a `navigation` group, inherited by its pages) → no inherited boost; set `search.boost` on the pages that need it.
- **Authentication** (password or SSO, set in the Mintlify dashboard) → Blume has none of its own; point the user at host-level protection (Vercel Deployment Protection, Netlify password protection, Cloudflare Access), per the deployment docs' **Private docs** section. It covers the whole site, so a mix of public and private pages needs two sites.
- **`<Update>`** changelog components, `iconType`, `background.decoration`, `search.prompt`.
