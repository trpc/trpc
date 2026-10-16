# ReadMe → Blume

ReadMe (readme.com developer hubs) is a hosted platform. Only content reaches Git: settings, the landing page, the glossary, variables, redirects, and every metrics and login feature live in its dashboard. Pages are MDX, or ReadMe's looser "MDXish" dialect, saved as `.md`. Published URLs are flat per section (`/docs/<slug>`, `/reference/<slug>`, `/recipes/<slug>`, `/page/<slug>`, `/changelog/<slug>`) however deep a page sits in the sidebar. The plan below keeps every one of them: section folders stay at the top of the content root, categories become `(group)` folders, and nested pages pin their flat URL with `slug`. The API reference is the exception: Blume generates operation pages at new routes, so each old one gets a redirect.

Two things go wrong with a green build and no warning: emoji blockquote callouts (plain blockquotes) and `:emoji:` shortcodes (literal text). Two more only warn: `doc:`/`ref:` links (dead links; `blume validate` reports `BLUME_UNSUPPORTED_LINK_SCHEME`) and inline `onClick` handlers (they render and do nothing; `BLUME_MDX_EVENT_HANDLER`). The codemod handles the first three; the handlers are yours.

## Detect

| Shape | Tells | The sidebar lives in |
| --- | --- | --- |
| **A. Bi-directional Git sync** (ReadMe Refactored) | `_order.yaml` in `docs/`, `reference/`, `recipes/`, `custom_pages/` and their folders; category folders with spaces (`docs/Getting Started/`); `reference/*.json` specs beside endpoint pages with `api: { file, operationId }` frontmatter; `reference/ReadMeConfig/`; `custom_blocks/`; a `main` branch holding only `changelogs/`; branches named after versions (`v3.0`) | folders and `_order.yaml` |
| **B. `rdme@10` upload** (one-way) | CI running `readmeio/rdme@v10` or `npx rdme@10` with `docs upload`, `reference upload`, `changelog upload`, `custompages upload`, `openapi upload`; frontmatter `category: { uri }`, `parent: { uri }`, `position`, `privacy: { view }`, `content: { excerpt }` (also `rdme docs export` output) | frontmatter |
| **C. Legacy `rdme` ≤ 9** | CI running `readmeio/rdme@v9` or older (`rdme docs ./dir`, `rdme openapi`, `rdme changelogs`); frontmatter `category: <24-hex id>` or `categorySlug`, `parentDoc` or `parentDocSlug`, `order`, `hidden`, `type: basic \| link \| error` | frontmatter, keyed by opaque IDs |

rdme ignores folder layout, so in shapes B and C the folders say nothing about the sidebar. rdme 10 still accepts `rdme changelogs` as a hidden alias, so tell B from C by the rdme version and the frontmatter. A shape A repo can still run `rdme openapi upload` in CI: it's shape A.

**Get everything before you convert.**

- **Shape A** is complete per version branch. Find the branch holding the hub's default version (it can be `v3.0`, not `main`). **Changelogs live only on `main`**: `git archive <main-sha> changelogs | tar -x -C <work-dir>`. Ignore `<version>_<name>` branches (ReadMe's editing branches, kept after they merge).
- **Shapes B and C** hold only what CI uploads, and drift: editor changes never come back, and a failing upload step stops changes going out. Inventory the live hub, export what the repo lacks, and diff pages against their live source.
- **Exports.** A Refactored project: connect bi-directional sync to a new, empty repository (Settings → Git Connection), which writes shape A with every version as a branch; a ZIP from the Branch menu (no images); or `npx rdme@10 docs export <dir> --branch <version>` and `rdme reference export <dir>` (shape B frontmatter). A legacy project: `rdme@9` can't export; read pages through API v1 (`GET /api/v1/categories/{slug}/docs`, `GET /api/v1/docs/{slug}`) or upgrade the project. Refactored hubs usually serve a page's Markdown at `<url>.md` (docs.readme.com does), and `/llms.txt`, when it's on, lists every public page or links per-section files that do.

**Go easy on the live hub.** A ReadMe hub can start answering `429` after as few as eight requests in a few minutes, even spaced seconds apart. Spend them on one page of the hub (save it: it carries the settings JSON below), `sitemap.xml`, `llms.txt`, and a few spot checks. The `files.readme.io` image CDN is separate: one run fetched 84 images there at one every half second without a `429`.

## Run the codemod first

For shape A, on a branch whose name matches no ReadMe version (see Teardown), with the changelogs copied from `main` into the work tree and one page of the hub saved as `hub.html` (skip the `curl` when the user already saved one at the root):

```bash
curl -s https://docs.example.com/docs/<any-page> -o hub.html   # settings JSON + glossary
node <skill>/scripts/readme-codemod.mjs --site https://docs.example.com --glossary hub.html .          # report only
node <skill>/scripts/readme-codemod.mjs --write --site https://docs.example.com --glossary hub.html .  # apply
```

`--site` (repeatable: add the `*.readme.io` origin too) makes absolute links to the hub root-relative. It's zero-dependency, deterministic, and idempotent (a rerun reports `Nothing to change.`). It:

- moves `custom_pages/` → `page/`, `changelogs/` → `changelog/`, categories → `(Category)` group folders, `.md` → `.mdx`;
- maps frontmatter (Frontmatter, below) and pins `slug` wherever Blume's route would differ from ReadMe's URL;
- converts callouts, links, magic blocks, ReadMe components, variables, reusable content, icons, shortcodes, code fences, and headings (Content);
- writes `_order.yaml` → `meta.ts`, deletes endpoint, tag, and empty parent pages, and turns link pages into redirects (Navigation);
- writes `reference/overlays/<spec>.overlay.json` (API reference), `readme-redirects.json` (the redirects it can compute), and `readme-migration.json` (every old URL, every deleted endpoint, for the second pass).

**Its report is the to-do list**: per file, what needs judgment (custom components, inline components, `<style>`, event handlers, dead links, unmapped icons), then "Left for you". Work through it with the sections below. A second pass after the first build handles endpoint redirects and order (API reference).

Shapes B and C: rebuild the tree first (Navigation, shapes B and C), then run the codemod. With no `_order.yaml` it converts page content and frontmatter only: no moves, slug pins, URL inventory, endpoint handling, or redirects (it reports link pages instead).

## Config: the dashboard → `blume.config.ts`

There's no config file in Git. Every page of a Refactored hub embeds the project's settings as JSON: read them from the saved `hub.html` rather than asking. Map what's set:

| ReadMe (settings JSON) | Blume | Notes |
| --- | --- | --- |
| `name` | `title` |  |
| `logo`, `logo_white_use` | `logo` | download into `public/`. With `logo_white_use: true` the hub showed a white logo on a colored header, invisible in Blume's light header: recolor the white parts to `currentColor`. A bare mark → the string form (`logo: "/logo.svg"`); a wordmark → `{ image: "/logo.svg", text: "" }` (SKILL.md) |
| `favicon` | `public/favicon.png` (or `.svg`/`.ico`) | picked up by name |
| `brand.link_color` (`colors.body_highlight`) | `theme.accent` | `_dark` variants → `{ light, dark }` |
| `brand.primary_color` (`colors.main`) | `theme.action`, or `theme.accent` when no link color | the colored header has no equivalent: report |
| `brand.theme` | `theme.mode` |  |
| `typography.headline` / `body` (`Open+Sans:400:sans-serif`) | `theme.fonts.display` / `body` (`{ name: "Open Sans" }`) | Typekit → local `variants`, or drop |
| `nav_names` + enabled `modules` | `navigation.tabs` | one tab per enabled section with content (`{ label: "Developer hub", path: "/docs" }`) |
| header links (`link_url` entries) | `navigation.actions` | a sign-up or "Get API keys" button → `navigation.cta`; a login link stays in `actions` |
| `first_page` | `index.mdx` at the root, or a `/` redirect (status 302) | the landing page doesn't sync |
| `custom_domain` | `deployment.site` | unless the host is Vercel or Netlify (SKILL.md) |
| Enterprise group path (`/<project>/docs/…`) | `basePath: "/<project>"` | one Blume site per child project |
| `integrations.google.analytics`, `segment`, `heap`; custom JS | `googleAnalytics()`, `segment()`, `heap()`, or `script({ src \| content })` in `analytics` | these load only in production builds, and wait for `consent` when it's set |
| `integrations.intercom`, `zendesk` (a support widget readers click) | a `PageFooter` component (`defineComponents`, SKILL.md "analytics") that loads it | not `analytics`, which can hold it until consent. Check region settings (an AU Intercom workspace needs `api_base`) |
| `integrations.google.site_verification`, `<meta>` tags in head HTML | `seo.metatags` | other head HTML: report |
| `stylesheet_hub2` (custom CSS) | a root `theme.css` | rules for ReadMe's classes (`.rm-*`, `.callout_*`, hashed names) match nothing: carry only rules for the site's own markup |
| Footer HTML | `footer: { copyright, links }` | a copyright line → `copyright`, plain text: strip the tags, decode entities (`&copy;` → `©`). Report the rest |
| `variables.defaults` | `variables` | Content. **Defaults can be real credentials** (an API key): never copy one into config |
| `glossaryTerms` | `--glossary hub.html` | the codemod writes `<Tooltip>`s |
| `redirects` | `redirects` | URLs and redirects |
| `error404` | `pages/404.astro` or Blume's default | URLs and redirects |
| Ask AI, MCP server | `ai.assistant`, `agents.mcp` | need a server-output host adapter: report |

Then the layout. **Leave the section folders where they are.** Set `content.root: "."` and scope `include` (`references/monorepo.md` §1), import the codemod's redirects, and add the reference:

```ts
import { defineConfig } from "blume";
import { openapi } from "blume/reference";
import redirects from "./readme-redirects.json";

export default defineConfig({
  content: {
    root: ".",
    include: [
      "index.mdx",
      "docs/**/*.mdx",
      "reference/**/*.mdx",
      "recipes/**/*.mdx",
      "page/**/*.mdx",
      "changelog/**/*.mdx",
    ],
  },
  redirects: [...redirects /* , your own */],
  reference: [openapi({ sources: [/* API reference */] })],
});
```

`page/` is ReadMe's custom pages at `/page/<slug>`; Blume's own `pages/` folder is for `.astro` pages, a different thing.

## Navigation (shape A)

What the codemod does, so you can check it:

- **Categories → group folders.** `docs/Getting Started/` → `docs/(Getting Started)/`: the group keeps the label and adds no URL segment.
- **`_order.yaml` → `meta.ts` `pages`**, entries as written (`pages` ignores the parentheses), less duplicates and entries with no file. A category folder's `meta.ts` also sets `title` where Blume would relabel the folder name (`Self-Serve` would show as "Self Serve"). A parent page's folder gets `title` from the parent and `display: "group"`.
- **`slug` pins.** ReadMe serves every child flat (`/docs/<child>`; the nested path 404s), so every page below a parent folder gets `slug: docs/<stem>`, and a nested parent's own `index.mdx` takes `docs/<folder>`. A parent folder directly in a category needs none: its folder name is the route. Any stem starting with a digit gets one too, since Blume strips `^\d+[-_.]` as an ordering prefix (`1-setup` → `/docs/setup`); dates (`12-05-2022`, `2024-01`, `2022-05-12`) and versions (`1.2`) stay whole, so their pins are harmless.
- **Hidden pages** (`hidden: true`) were left out of the sidebar and search but served by link: `hidden: true` + `search.exclude: true`, URL kept.
- **Empty parent pages** (frontmatter, no body) redirected to their first child on ReadMe. The codemod deletes them and adds a 302 to the first child; prefer that to keeping one as a `directory: "card"` landing page. A parent that stays (with a body, or kept as a landing page) whose child has the same title fails `validate --strict` (`BLUME_NAV_DUPLICATE_LABEL`): retitle one, and report it.
- **Link pages** (`link: { url }`): deleted, with a 302 to the URL. If the link must stay visible, add it to `navigation.featured`.
- **Section roots.** `/docs` and `/reference` redirect to the section's first page, as on ReadMe; a typed URL would 404 without it. ReadMe answers them with a 301; the codemod writes a 302, since the first page can change.
- **Custom pages** had no sidebar: `hidden: true` plus `mode: center` (`fullscreen: true` → `mode: custom`).

Left for you: an HTML custom page (`custom_pages/<slug>.html`) → `page/<slug>.mdx` with its HTML as JSX, or `pages/page/<slug>.astro` on `PageLayout` for a full document with scripts (`docs/advanced/custom-pages.mdx`); and `/` (see `first_page`).

### Versions

Version branches hold full copies of guides, recipes, and the reference; ReadMe serves the default version without a prefix and others at `/<version>/docs/<slug>`. **Recommend migrating the default version only**, with `{ from: "/<version>/:path*", to: "/:path*" }` for each other version and the default's own prefix (`/v3.0/docs/x` redirected to `/docs/x` on ReadMe). Pages that only exist in an old version then 404: report it. To keep old versions, run the codemod on each branch's checkout and copy its `docs/`, `recipes/`, and `reference/` into `<version>/` (`v2.1/docs/…` serves `/v2.1/docs/…`), drop that version's prefix redirect (a pattern over pages fails the build), add `"<version>/**/*.mdx"` to `content.include` (a scoped `include` never scans the copy otherwise), and set `versions.archived` (newest first) and `versions.current`. Each id is the URL segment (`v2.1`): ids must start with a letter. References, the changelog, and custom pages stay unversioned, and an archived tree's sidebar isn't scoped by tabs: report both.

## Navigation (shapes B and C)

Rebuild the tree from frontmatter into shape A's layout, then run the codemod:

- **Category** → `docs/(<Category title>)/`. Shape B's `category.uri` ends in the title (`/branches/3.0/categories/guides/Getting%20Started`): decode it. Shape C's `category` is an ID: resolve it with `GET /api/v1/categories`, the hub's sidebar, or the user. `categorySlug` names it.
- **Parent** (`parent.uri`, `parentDoc`, `parentDocSlug`) → a folder named for the parent's slug, holding the parent as `index.mdx`; pin each child's `slug` as in shape A.
- **Order** (`position`, `order`) → the folder's `meta.ts` `pages`.
- **Slug**: frontmatter `slug`, else the file name. Name each file after its slug, and pin any that starts with a digit.
- **Custom pages and changelog entries** → `page/<slug>.md` and `changelog/<slug>.md`, whatever folder CI uploaded them from: the codemod maps their frontmatter by those folder names (`custom_pages/` and `changelogs/` work too), but outside shape A it moves nothing, so the folder is the URL.

The codemod reports these navigation keys and leaves them: delete them once the tree is built.

## Content

**Every page becomes `.mdx`**: ReadMe's `.md` files are MDX, and in a Blume `.md` page directives stay literal text and components don't render. The codemod converts the mechanical syntax (table below). It also clears what ReadMe's lenient MDXish engine (`"mdxish": true` in the settings JSON) accepts and strict MDX rejects: it deletes `<!-- -->` comments, self-closes void tags, and converts `[block:…]` JSON. **It leaves everything that needs judgment, and reports it per file:**

- **Inline components.** A page that defines a component (`export const Name = …`) is left byte for byte. Without hooks it renders as static HTML. With hooks it fails the build: move it to `islands/<Name>.tsx` (`export default`). One defined on several pages goes in `islands/` once.
- **Custom components** (`custom_blocks/<Name>.mdx`): use a Blume component when it's presentational (a card grid → `CardGroup`), else move it to `islands/<Name>.tsx` and keep `<Name />` in the pages. Blume compiles Tailwind v4 utilities from the project's `.mdx` and `.tsx` files (Tailwind's default theme plus Blume's tokens, `dark:` keyed to Blume's theme), so utility classes keep working; ReadMe's CSS variables (`var(--color-border-default)`) don't exist in Blume: swap them for Blume's (`var(--blume-border)`) or its token utilities (`border-border`, `bg-muted`). Text moved from a prop into children needs `{` and `}` escaped (`\{`), or the build fails (`BLUME_MDX_UNDEFINED_NAME`, at the brace's line).
- **Event handlers.** `<button onClick={…}>`, `onMouseEnter`, and friends on inline HTML build green and do nothing; `blume check` and `build` warn `BLUME_MDX_EVENT_HANDLER` at each one. Rebuild the widget as an island (`grep -rnE 'on[A-Z][a-zA-Z]*=' --include='*.mdx'` outside code finds them before a build). Hubs often paste the same widget (a "contact support" box) into dozens of pages: one island, and replace every copy. A handler that calls a support widget's global (`Intercom('show')`) also needs that widget loaded (Config, `integrations.intercom`).
- **`<HTMLBlock>` with `<style>`, `<script>`, or handlers** stays wrapped. **Don't move its `<style>` rules into `theme.css`**: ReadMe authors write global selectors (`p`, `ul`, `h3, h4`), which there restyle the whole site, sidebar included. Rebuild the markup with Blume components (`Tabs`, `Columns`, `CardGroup`, `Panel`, callouts). ReadMe stripped `<script>` unless `runScripts` was on: rebuild what a script did as an island or a `script()` adapter.
- **Font Awesome `<i>` icons** in raw HTML (`<i className="fa fa-plug" />`): `<Icon icon="<lucide>" />`; Blume loads no Font Awesome, so the `<i>` renders empty. Tailwind classes in raw HTML (`className="mt-4 p-4 bg-gray-50"`) still compile, but fixed colors ignore dark mode: prefer a component (`Panel`, a callout) or Blume's token utilities (`bg-muted`, `border-border`).
- **Unknown components** (`<PostmanRunButton>`, `<MCPIntro>`, `<TableOfContents>`): drop or replace; each fails the build.
- **Variables.** `<<name>>`, `{user.name}`, and `<Variable name>` became `{{name}}`; define each in `variables` (from `variables.defaults`). ReadMe filled them per reader; Blume shows one default to everyone (report). The codemod leaves `<<name>>` inside code as written and reports it: change one to `{{name}}` by hand where it should show the default (Blume substitutes in code too).
- **Glossary terms** with no definition: pass `--glossary`, or write the `<Tooltip>` by hand.
- **Dead links.** Hubs collect links to slugs from older versions that 404 on the live site too. Check a few live first (ReadMe cross-redirects some, `/reference/x` → `/docs/x`), then point each at the closest current page, or unlink it and keep the text. Report the list.
- **Images** stay on `files.readme.io`: download them into `public/` and rewrite the URLs (`grep -rhoE 'https://files\.readme\.io/[^)" ]+'`). Some have no extension: add one. Review every alt the codemod derived from a file name.
- **Tables** with lists or blocks in their cells, or spanning cells (`colSpan`, `rowSpan`), stay `<table>`: check they render.
- **Recipes**: the codemod deletes the line-highlight comments and demotes the step headings; the walkthrough modal is dropped (report). Repeat a highlighted excerpt under its step with `{1-4}` where it mattered.

| ReadMe | Blume (codemod) |
| --- | --- |
| `> 📘 Title` / `>` / `> Body` (emoji first) | `:::info[Title]` … `:::`; 📘 ℹ️ → `info`, 👍 ✅ → `success`, 🚧 ⚠️ → `warning`, ❗️ 🛑 ‼️ ⁉️ → `danger`, any other emoji → `note`. An emoji alone means no title; `#` marks drop |
| `<Callout icon theme>` | the directive for `theme` (`okay` → success, `warn` → warning, `error` → danger, `default` → note), else for `icon`; a first-child heading becomes the title |
| `[block:callout]`, `[block:code]`, `[block:image]`, `[block:table]`/`parameters`, `[block:api-header]`, `[block:embed]`, `[block:html]` | the same conversions as their component forms |
| adjacent fences (ReadMe's code tabs) | `<CodeGroup>`; untitled tabs labeled with the language, as ReadMe showed them |
| ` ```javascript Node SDK ` | ` ```javascript title="Node SDK" `; `node` → `js`, `curl` → `bash`, `cplusplus` → `cpp`, `objectivec` → `objc` |
| `<Image src alt caption>`, `<Image …>caption</Image>`, `![1544](url "image.png")` | `![alt](src)`, in `<Frame caption>` when captioned; numeric or missing alts derived from the file name; `align`/`width`/`border` drop |
| `<Embed>` (YouTube, including `google.com/sorry` interstitials), `[x](url "@embed")` | `<YouTube id>`; anything else → a link |
| `<HTMLBlock>{`…`}</HTMLBlock>` | its HTML, inline: comments removed, void tags closed, braces as entities |
| `<Table>` | a Markdown table: a cell's paragraphs joined with `<br />`, all-empty rows dropped |
| `<Cards columns>` / `<Card iconColor badge target>` | `<CardGroup cols>` / `<Card color>`, `badge` → `<Badge>`, `target` drops; braces from props escaped |
| `<Columns layout>`, `<Tab icon>` | `<Columns cols>`, Lucide icons |
| `<Accordion title>` | a run → one `<Accordion>` of `<AccordionItem>`s; one alone → `<Expandable>`, or a one-item `<Accordion>` when it has an icon (`Expandable` takes none) |
| `<Glossary>`, `<<glossary:x>>` | `<Tooltip tip>` |
| `<Anchor>`, `<Recipe>`, `[block:recipe]`, `[block:tutorial-tile]` | a link, `<Card href="/recipes/<slug>">` |
| `custom_blocks/<Name>.md` used as `<Name />` | `_snippets/<name>.mdx` + `<include>/_snippets/<name>.mdx</include>` |
| `doc:x`, `ref:x`, `page:x`, `changelog:x`, `blog:x`; `https://<site>/docs/x` | `/docs/x`, `/reference/x`, …; root-relative |
| Font Awesome (`fad fa-hand-wave`) on frontmatter, cards, tabs, accordions | Lucide, or dropped and reported |
| `:tada:` | 🎉 (unknown names reported) |
| a body `# H1` repeating the title; any other body H1 | deleted; every body heading demoted one level |

Callout titles had anchor ids on ReadMe; Blume's don't. Headings otherwise keep their anchors: both slug with github-slugger, so skip `pin-heading-ids.mjs`, which would also crawl the rate-limited hub. One exception: ReadMe's slugger also counted callout titles and the H1 the codemod deletes, so a later heading with the same text was `<slug>-1` on ReadMe and is `<slug>` in Blume. Another: for a heading that ends in an emoji or symbol after a space, github-slugger keeps a trailing dash (`## Features ✨` → `#features-`), which Blume drops (`#features`). `blume validate --strict` flags links to the old id; retarget them.

## Frontmatter

Blume's page schema is strict. The codemod maps:

| ReadMe | Blume |
| --- | --- |
| `title` | `title` |
| `excerpt` (A, C), `content.excerpt` (B) | `description` |
| `hidden: true` (A), `privacy.view: anyone_with_link` (B) | `hidden: true` + `search.exclude: true` |
| `hidden: true` (C) | the same, reported: rdme maps it to `privacy.view: anyone_with_link`, but check the live URL and use `draft: true` if it 404s |
| `deprecated`, `state: deprecated` (B) | `deprecated: true` |
| `icon`, `appearance.icon` (B) | `icon` (Lucide) |
| `metadata.title` / `description` / `image` | `seo.title` / `description` / `image`; B's `image: { uri }` is an image id, not a URL: reported |
| `metadata.keywords` | `search.keywords` |
| `metadata.robots: noindex`, `allow_crawlers: disabled` (B) | `noindex: true` |
| `next.pages`, `content.next` (B) | `related`, dropping entries that aren't pages in the repo; Blume takes 10 at most (the rest reported) |
| `link`, `content.link` (B) | a redirect (Navigation) |
| `table_of_contents: false` | `mode: wide` (an approximation: report) |
| `fullscreen` (custom pages) | `mode: custom`, else `mode: center` |
| `recipe`, `x-import`, `name`, `api`, `api_config`, `recipes` | dropped (`recipes` reported) |

It keeps keys it doesn't know and reports them: Blume rejects unknown keys, so map or delete each. It drops C's `type` (`basic`, `link`, `error`), since Blume's own `type` sets the content type. Changelog keys are under Changelog.

## API reference

Every endpoint page is generated from an OpenAPI file. The codemod records each one's old URL, operation, and prose in `readme-migration.json`, and deletes it.

1. **Specs → sources.** One `openapi()` source per spec in `reference/`, labeled with the ReadMe category its endpoints sat under, or the spec's `info.title`: `{ label: "Connect", spec: "./reference/connect.json" }` serves `/reference/connect`, with operations at `/reference/connect/<tag>/<operation>`. **A category that held several specs** (the report lists them) can't share a label: they'd share a route and the first would win. Give each its own label, or merge the specs first, and report the split. A single spec → `openapi({ spec })`. Add a `navigation.tabs` entry for `/reference`. A YAML spec: convert it to JSON (`npx @redocly/cli bundle x.yaml --output x.json`) and rerun the codemod, which reads JSON only.
2. **Overlays.** `reference/overlays/<spec>.overlay.json` sets each operation's `description` to its spec text plus the prose its ReadMe endpoint page showed, and converts the ReadMe Markdown inside spec descriptions (emoji callouts, shortcodes, `doc:` links), which ReadMe rendered and Blume would show plain. Add each to its source: `{ label, spec, overlays: ["./reference/overlays/connect.overlay.json"] }`. JSX doesn't render in descriptions (`<` and `{` are escaped): rewrite any the report names as Markdown.
3. **Build, then run the second pass.** List the generated routes, then hand them to the codemod with the same `--spec` pairs (the source's route, then its spec):

   ```bash
   npx blume build
   node <skill>/scripts/operation-routes.mjs dist --spec /reference/connect=reference/connect.json > routes.json
   node <skill>/scripts/readme-codemod.mjs --routes routes.json --spec /reference/connect=reference/connect.json --write .
   ```

   It adds a 301 from each old endpoint URL (`/reference/getaccount`) to its operation page, and a 302 from each tag page (`/reference/accounts-1`) to the tag's first endpoint, as ReadMe answered. It skips an old URL that is now a page (`/reference/enrich`, ReadMe's operation, against an Enrich source's overview): a redirect there would hide the page (`BLUME_REDIRECT_MATCHES_PAGE`). It reports each, so you can pick another `route` instead. It adds a 302 from `/reference` to the first endpoint when nothing else claims it, and drops any pass-one redirect that would now hide a reference page. It also rewrites links to old endpoint and tag URLs outside fenced code, dropping anchors (reported), and writes `<route>/<tag-slug>/meta.ts` (`defineMeta({ title, order, pages })`) with ReadMe's endpoint order, where it can differ from the spec's order, which the generated sidebar follows.

4. **Source order, by hand.** Write `<route>/meta.ts` → `defineMeta({ order: <n> })` for each source, with the order the report gives (ReadMe's category order). It merges over the generated group's settings, so the source's `label` stays its title.

- **Conceptual pages** (no `api` key) stay in `reference/(<Category>)/` at `/reference/<slug>` and join the reference tab's sidebar; their group folder's `meta.ts` takes an `order` among the sources.
- **`reference/ReadMeConfig/`** (`api_config` pages: getting started, authentication, my requests) showed the reader's own API key and request log. The codemod keeps any prose as a page and deletes empty ones: redirect each deleted URL to the closest page.
- **Hidden endpoints**: remove the operation with an overlay action (`remove: true`) if it should stay unpublished. `x-internal: true` likewise: Blume ignores the flag.
- **`x-readme` extensions** (and flat spellings like `x-samples-languages`, at the root or on an operation): `samples-languages` → `codeSamples`: `shell`, `node`, `javascript`, `python`, `ruby`, `go`, `php`, `java`, `csharp`, `kotlin`, `swift`, `c`, `cplusplus` (read as `cpp`), and `powershell` carry over as written (so does `curl`, which some specs use); `objectivec`, `http`, `json`, `clojure`, `ocaml`, and `r` have no Blume generator and warn `BLUME_OPENAPI_UNKNOWN_CODE_SAMPLE`: leave them out and report them. `code-samples` → `x-codeSamples` by overlay (`language` → `lang`, `code` → `source`, `name` → `label`). `explorer-enabled: false` → `playground: false`; `proxy-enabled` (on by default: Try It went through ReadMe's CORS proxy) → `playground: { proxy: true }` on a server-output host, or the API must allow the docs origin (say which). `codeSamples` and `playground` are per `openapi()` adapter, not per source or operation: when specs or operations disagree, take the setting most of them use and report the rest. `samples-enabled` is no longer supported on ReadMe (it hid nothing): ignore it. `headers`, `x-default`, `oauth-options`, `parameter-ordering`, `metrics-enabled`: no equivalent (report).
- **Versioned references**: unversioned in Blume; an archived version's spec can be its own source with `route: "/<version>/reference"` (report).

## Changelog

The codemod moves `changelogs/<slug>.md` → `changelog/<slug>.mdx` (same URL; digit-led stems pinned with `slug`, which date names no longer need) and adds `type: changelog`:

| ReadMe | Blume |
| --- | --- |
| `date`, `published_at` (what synced repos contain), `created_at` (B) | `date` (the day). None (common in C) → reported: take it from the live entry |
| `author` | `authors`; B's ID object drops |
| `type` (`added`, `fixed`, `improved`, `deprecated`, `removed`; `none`) | `changelog.category`, capitalized; `none` omitted |
| `hidden: true`, `privacy.view: anyone_with_link` | `hidden: true`: still built, out of the index and feed |

It also adds `/changelog.rss` → `/changelog/rss.xml`; the feed needs `deployment.site` or a detected host. Add a `{ label, path: "/changelog" }` tab. If the project is open source on GitHub and its releases are the product changelog, offer `githubReleases()` (SKILL.md "Changelogs").

## URLs and redirects

**The old URL list**: `readme-migration.json` lists every URL the repo served (hidden pages included) with its kind; add `sitemap.xml` (it omits hidden pages and empty parents), `llms.txt`, other versions (`/<version>/docs/…`), and Enterprise or translated segments (`/<project>/`, `/lang-de/`). At the end every entry must be a page or a redirect to one.

- **Status codes.** Use 302 where ReadMe answered with a 302 (empty parents, tag pages, `/`), for link pages, and for section roots (ReadMe's 301 points at whichever page is first, which can change), and the default 301 for moves (operations). The codemod does, except `/`, which it leaves to you (`first_page`).
- **ReadMe's own redirects** (`redirects` in the settings JSON, or Settings → Errors & Redirects: `old -> new` per line, full-match regex with `$1`, applied only when no page matches): a literal rule → `{ from, to }`; one-segment or rest-of-path patterns → `:name` / `:name*` (`/old(/\S*)? -> /new$1` → `{ from: "/old/:path*", to: "/new/:path*" }`, which also sends `/old` to `/new`); anything else → host rules (report).
- **Versions**: `{ from: "/<version>/:path*", to: "/:path*" }` (Versions).
- **The custom 404** (`error404`): rebuild that custom page as `pages/404.astro`, or keep Blume's default. Keep or redirect its `/page/<slug>` URL.
- **`blume validate`** accepts a redirect `from` as a link target, so rewrite links before trusting it. It warns about a redirect whose `to` leads nowhere (`BLUME_BROKEN_REDIRECT`), but not about loops or chains: run `blume audit --only redirects` after each build. A link to `/llms.txt` or another file Blume generates passes while the config has that feature on.
- **Check every old URL** against `dist/` and `dist/blume-redirects.json` (no host adapter), following redirects until each lands on a page, or request each from `blume dev` or `blume preview` with `curl -sL`: both answer every redirect, patterns included.

## Teardown

**Disconnect the sync first.** With bi-directional sync on, ReadMe's GitHub app reads and writes every branch named after a version, so restructuring one rewrites the live hub. Migrate on a branch that matches no version (`blume-migration`; `<version>_<name>` would sync), and have the user disconnect the repository (Settings → Git Connection) before merging. Remove every `rdme … upload` step from CI in any shape (and an `rdme` dependency); `rdme openapi validate` can stay as a spec linter.

Delete `custom_blocks/` once converted, `reference/ReadMeConfig/` leftovers, `frontmatter.schema.json`, `hub.html`, `routes.json`, and `readme-migration.json` once the redirects are final (keep `readme-redirects.json`: the config imports it). Scaffold a `package.json` with `blume` and `dev`/`build`/`preview` scripts. Moving the custom domain's CNAME is the user's step: list it.

## Dropped — report these

- **Hosted features**: the editor, Branches and Reviews, the AI Linter and Agent, suggested edits (Blume's edit link comes from `github`), discussions and the dev FAQ, API Metrics, My Developers, My Requests and API logs, the Developer Dashboard, health status updates, and the landing page builder (rebuild as `index.mdx` with `mode: custom`, or `pages/index.astro`).
- **Personalized docs**: per-reader variables, API keys in Try It, `x-default` credentials, and the `ReadMeConfig` widgets. Blume's Try It takes credentials the reader types.
- **Login-gated docs** (custom login, JWT, site password, hidden versions): Blume has no sign-in. Point at host-level protection (deployment docs, **Private docs**); it covers the whole site, so public and private pages need two sites.
- **Changelog options** (layouts, relative dates, author toggle, translations), recipe walkthrough modals, Global Reusable Content across projects, translations through Localize or Transifex (offer `i18n` and `blume translate`), and Enterprise cross-project navigation.
- **Approximations**: `mode: wide` for `table_of_contents: false`, image sizes and alignment, emoji and unmapped icons, unmapped `x-readme` extensions, unversioned references and changelog, custom components restyled as islands, and HTML or scripts dropped from custom blocks.
