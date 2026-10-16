# GitBook → Blume

GitBook is a hosted editor. This reference covers the Markdown it writes when a space syncs to GitHub or GitLab (Git Sync): `SUMMARY.md` (a space's navigation), `.gitbook.yaml` (where its files live, plus redirects), and, on site-wide Git Sync, `gitbook-docs.yaml` (which space maps to which directory). Theme, logo, header and footer links, custom domain, site redirects, and access control live in the GitBook app, not the repo. Two things set this migration apart:

- **URLs follow `SUMMARY.md`, not the file tree.** Moving a page in the editor changes its URL but not its file. Blume derives route _and_ sidebar from the file path, so the core move is putting each file at its old URL.
- **Blocks are Liquid-style tags (`{% hint %}`) and raw HTML inside `.md`.** Almost every page becomes `.mdx`, and MDX rejects several things GitBook writes.

## Detect

- **`.gitbook.yaml`** or **`.gitbook.yml`** (GitBook reads both) at the root or in a space directory; **`gitbook-docs.yaml`** for site-wide Git Sync.
- A **`SUMMARY.md`** (GitBook writes it opening `# Table of contents`; a hand-written one may open `# Summary`), with `* [Title](path.md)` items and `## Group` headings, beside a **`.gitbook/`** folder (`assets/`, `includes/`, maybe `vars.yaml`). `.gitbook.yaml` is optional, so this pair can be the only sign.
- Pages that open with a `# Title` line and use `{% hint %}`, `{% tabs %}`, `{% content-ref %}`; sync commits titled `GITBOOK-<n>: …`.
- **Not this format:** `book.toml` + `src/SUMMARY.md` is mdBook. `book.json` + `SUMMARY.md` is the legacy GitBook CLI or HonKit — see [Legacy GitBook CLI](#legacy-gitbook-cli-bookjson).

## First, collect what the repo doesn't hold

Do this while the GitBook site is still published. Nothing moves before step 1.

1. **Old URLs.** `<site>/sitemap.xml` indexes one `sitemap-pages.xml` per published space (`/sitemap-pages.xml`, `/de/sitemap-pages.xml`, …); fetch them all. They list every canonical page, hidden and generated OpenAPI pages included, but not `noIndex`/`noRobotsIndex` pages (take those from `SUMMARY.md`). `<site>/llms.txt` lists the same pages with their `.md` URLs. Save the paths, one per line, outside the content root.
2. **Site redirects** (Settings → Redirects). The app has no export: `GET https://api.gitbook.com/v1/orgs/{organizationId}/sites/{siteId}/redirects?limit=1000` with a token (paginated: while the response has `next.page`, fetch again with `&page=<it>`), or ask the user. With neither, report it as a follow-up.
3. **Site customization.** `GET https://api.gitbook.com/v1/orgs/{organizationId}/sites/{siteId}/customization` with a token. Without one, read the published HTML: logo and favicon URLs go through `~gitbook/image?url=<original>` (decode `url` and download it), the header carries a light logo (`class="block dark:hidden …"`) and, when one is set, a dark one (`hidden dark:block`), and the inline CSS declares the primary color as an RGB triplet, `--primary-original`.
4. **Spaces not in the repo.** Compare the sitemap index with the repo's directories. A space with `content.directory: null`, or a language or version the site serves but the repo lacks (often GitBook-made translations), has no Markdown here. Ask: export it (Git Sync that space into a branch, or `POST https://api.gitbook.com/v1/spaces/{spaceId}/git/export`) and migrate it; regenerate it with `blume translate` once `i18n` is set; or drop it and redirect its URLs (see URLs and redirects). Report the choice.

## Config

Map what step 3 found or the user supplies; leave the rest at Blume's defaults.

| GitBook | Blume |
| --- | --- |
| Site title (`gitbook-docs.yaml` `site.title`) | `title` |
| Logo (light and dark) | `logo: { image: { light, dark } }`, files in `public/` (SKILL.md covers monochrome SVGs and wordmarks) |
| Icon (favicon) | `public/icon.svg` or `icon.png` (a dark one → `icon-dark.*`); no config field. An emoji icon has no file: make one or report it |
| Primary color | `theme.accent` |
| Default mode, fonts, code theme | `theme.mode`, `theme.fonts.{body,display,mono}`, `markdown.code.theme` (nearest Shiki themes) |
| Theme style, tint and semantic colors, corner, depth, link, and sidebar styles | drop (report); a root `theme.css` if one matters |
| Header links; a button-styled one | `navigation.actions`; `navigation.cta` |
| Announcement | `banner` (`{ content, link, dismissible, id }`) |
| Footer | `footer.links`, flattened into one row; copyright → `footer.copyright`; group titles and logo drop (report) |
| Social accounts | `footer.socials` |
| Social preview image | `seo.image` on the landing page (Blume renders a card for every other page) |
| Git Sync repository and branch | `github: { owner, repo, branch }`, plus `dir` or `host` when needed; GitLab has no equivalent (report) |
| Page actions: Markdown and AI providers, MCP, PDF | defaults; `agents.mcp.enabled` plus server output (follow-up); `export` |
| GitBook Assistant | `ai.assistant` plus server output (follow-up), or drop |
| Integrations | adapters in `analytics` from `blume/analytics`; others `script()` or report |
| Custom domain | the DNS record moves to the new host; keep the URL as `deployment.site` unless the host is Vercel or Netlify |
| Custom subdirectory (`example.com/docs`) | `deployment: { base: "/docs" }` |
| Share links, authenticated access | host-level protection (the deployment docs' **Private docs**); report |
| `.gitbook/vars.yaml` | `variables` (see Variables) |

**Content root.** `root: ./docs/` is Blume's default `content.root`. With `root: ./`, `git mv` the space (pages, `SUMMARY.md`, `.gitbook/`) into `docs/` — routes are relative to the content root, so they don't change — or scope `content.include` (`references/monorepo.md` §1). Left unscoped, the repo's `README.md` and every stray `.md` publish.

## Navigation: `SUMMARY.md` → folders

### How GitBook builds a URL

- The first `SUMMARY.md` item (`structure.readme`, `README.md` by default) is served at the space root; its own slug (`/readme`) redirects there.
- Every other page: the space's prefix (see Site structure), then its `## Group`'s slug, each ancestor page's slug, and its own. A page's slug comes from its file name at import (a `README.md` → its folder's name), lowercased; a group's, from its heading (emoji dropped) or the `id` of an `<a id="…">` inside it.
- **The file's own path doesn't count.** A page filed at `configuration/post-install.md` but listed under group "Deployment" → parent `deployment/permissions/README.md` publishes at `/deployment/permissions/post-install`.

Compute every page's URL from `SUMMARY.md`, then check them against the sitemap list; the sitemap wins.

### Put every file at its old URL

One `git mv` per page keeps both the route and the sidebar:

- A page with no children → `<url>.mdx`; with children → `<url>/index.mdx`; the landing page → `index.mdx` at the content root (`.md` for a page that stays plain). Lowercase every segment: Blume keeps a file name's case, so `OCR.md` would publish at `/OCR` where GitBook served `/ocr`.
- **`README.md` isn't an index in Blume** (`guides/README.md` publishes at `/guides/README`): every README becomes `index`.
- Each `## Group` becomes a top-level folder named for its slug.
- Keep a table of old file → new file → route: links, includes, and image paths are rewritten from it.
- A file not in `SUMMARY.md` was never published. Delete it, or prefix it with `_` to keep it unpublished, and report it.
- Delete `SUMMARY.md` once the folders and `meta.ts` files carry its structure; it would publish as a page.

### Order, labels, and display → `meta.ts`

- **Order.** Each folder's `meta.ts` lists its children in `SUMMARY.md` order (`pages`); the content root's lists the loose pages, then the group folders.
- **Labels.** A page's title is its `SUMMARY.md` link text, and a link title (`[Title](page.md "Label")`) → `sidebar.label`. A group folder's `meta.ts` `title` is the heading text, and **a parent page's folder gets `title: <its SUMMARY text>` too** — otherwise the row shows the humanized folder name (`deployment-guides` → "Deployment Guides" for a page titled "Getting started").
- **Display.** GitBook shows groups as plain headings and each parent page as one expandable row. Set `navigation: { sidebar: { display: "group" } }`, `display: "flat"` in each group folder's `meta.ts`, and `sidebar: { hidden: true }` on each parent's `index`: the folder row already links to it, so without this the parent lists twice.
- **Contents pages.** A parent whose body is empty or only content-refs to its own children → delete those and set `directory: "card"` in the folder's `meta.ts`. It inherits: set `directory: "none"` on a nested folder that isn't a contents page.
- **Order Blume can't match.** Loose top-level pages always list above groups and folders. A parent page among loose pages (Overview, Editions ▸, Use Cases) drops below them, and pages after a `***` divider in `SUMMARY.md` (top-level again: `/uninstall`, not `/other/uninstall`) rise above the groups. Move such pages into a parenthesized group folder (`(more)/`, which adds no URL segment) ordered in the root `meta.ts`, or accept the order; report either.
- **External links** (`* [Website](https://…)`) → `navigation.featured` or `navigation.actions`; report the move.
- **Hidden pages.** GitBook's `hidden: true` hides a page's whole subtree; Blume's hides one page, so set it on the index and every descendant (a folder whose pages are all hidden leaves the sidebar).
- A list item that is a YAML block with `type: builtin:openapi` is a generated API reference (see OpenAPI).

### Site structure: `gitbook-docs.yaml`

`site.structure` nests `section-group`, `section`, `space`, and `external-link` entries. Every entry has a `key` (meaningless to Blume), a `title`, and maybe `localizedTitle`; most can carry `draft` or `condition`. Sections and spaces have a `path` and maybe `default: true` (a section group has no `path`); section groups, sections, and external links can have an `icon`; a space can be `hidden` and has `content.directory` (`null` when not synced) and maybe `content.language`. Skip `draft` entries, and treat a `condition` like adaptive content (report it).

- **URL prefixes.** The default section's default space is at the site root. Another space → `/<section>/<space>`; a non-default section's default space → `/<section>`. A site without sections serves its default space at the root and the rest at `/<space>`.
- **Sections** → a top-level folder each plus a `navigation.tabs` entry (`icon` → Lucide). The default section stays at the content root; add `{ label, path: "/" }` to show it as a tab.
- **Section groups** → a dropdown tab scopes the sidebar by one `path`, so give each section its own tab (the grouping is lost; report) or move them under one prefix (URLs change; pattern redirects).
- **Spaces within a section:** languages → `i18n` (Blume puts the locale first, site-wide: `/payments/fr/x` → `/fr/payments/x`); versions → `versions` (top-level `/<id>/…`, ids start with a letter); products → a folder each and a `navigation.selectors` dropdown. Redirect the old prefixes.
- A space's directory can sit inside another's (`./home/fr` in `./home`): separate them, then do the `SUMMARY.md` work per space. A `hidden: true` space is still published but left out of the space switcher: keep its pages, leave it out of `navigation.selectors`, and report it. `localizedTitle` → a per-locale tab label.
- **External links** (`external-link`, at the root or in a section group) → `navigation.actions` entries (`{ label, href }`; `localizedTitle` → a per-locale `label`, the `icon` drops).

## Content and components

### `.md` or `.mdx`

Rename to `.mdx` every page with a `{% … %}` block, `$$` math, a mermaid fence, or a component after conversion. Directives, components, math, mermaid, `package-install`, and `ts2js` are MDX-only: in `.md`, a leftover `{% hint %}` or `:::note` is literal text with a green build (each `{% … %}` tag warns `BLUME_TEMPLATE_TAG` at its line, a `:::note` `BLUME_MD_DIRECTIVE`), and in `.mdx` a leftover `{% … %}` fails it (`BLUME_MDX_SYNTAX`, which `blume validate` and `blume check` report too). Plain pages can stay `.md`; tables, footnotes, fence meta, `<include>`, `{{variables}}`, `[#id]`, and raw HTML work in both. An include is spliced as text, so it's parsed in the including page's format.

### MDX hazards

Each of these fails `blume build` in `.mdx` (`blume check` and `validate` name the ones MDX can't parse as `BLUME_MDX_SYNTAX`, at their line):

- **Unclosed `<img …>` and `<br>`** (`BLUME_MDX_UNCLOSED_ELEMENT` names each). Close them — better, convert images to Markdown.
- **HTML comments** → `{/* */}`.
- **A `{` outside code.** GitBook's `\{{x\}}` isn't enough; write `` `{{x}}` `` or `\{\{x\}\}`. Braces inside raw HTML (`<code>CN={{DeviceId}}</code>`, `<td>${EMAIL}</td>`) compile, then fail the render: `blume build` names each as `BLUME_MDX_UNDEFINED_NAME` at its line. Turn `<code>`, `<strong>`, `<a>`, `<p>`, and `<br>` inside table cells into Markdown.
- **Markdown inside JSX** (`<Tab>`, `<Step>`, `<Frame>`) needs blank lines around it.

GitBook's `\<` and entities (`&#x20;`, `&#x3C;`) are fine (an escaped `\<Name` can still warn `BLUME_UNKNOWN_COMPONENT`; the page renders correctly). Strip the U+200B/U+200C characters GitBook leaves at the start of some code lines.

### Blocks

| GitBook | Blume |
| --- | --- |
| `# Title` (the first line) | frontmatter `title`; delete the line |
| `{% hint style="info" %}` (`success`, `warning`, `danger`) | `:::info` (`:::success`, `:::warning`, `:::danger`); legacy plugin `tip` → `:::tip`, `working` → `:::note`. A directive takes no `icon`: keep one that matters as `<Callout type="<type>" icon="<lucide>">`, else drop it; inside another directive, give the outer one a longer fence (`::::`) |
| `{% tabs %}` + `{% tab title="X" icon="y" %}` | `<Tabs>` + `<Tab title="X" icon="<lucide>">`; `fullWidth` drops. Blume switches same-titled tabs together page-wide (`sync={false}` opts a group out) |
| `{% code title="a.js" lineNumbers="true" overflow="wrap" expandable="true" %}` | fence meta: ` ```js title="a.js" lineNumbers wrap expandable `; `fullWidth` drops. **A fence with no language takes `text`** (` ```text lineNumbers `), or the first option becomes the language (`BLUME_UNKNOWN_CODE_LANGUAGE`) |
| `<pre class="language-x" data-title="…" data-line-numbers data-overflow="wrap"><code>` | a fence built from those attributes (others drop), entities decoded, `<strong>`/`<em>` stripped |
| `{% stepper %}` + `{% step %}` | `<Steps>` + `<Step>`. **A step that opens with a heading keeps it as the first line inside `<Step>`**: GitBook publishes it as an anchored heading in the outline, and `title` renders a plain paragraph with no anchor. A bold-line opener → `title` |
| `{% columns %}` + `{% column %}` | `<Columns cols={n}>` + `<Column>`; widths drop |
| `<details><summary>T</summary>` (`open`) | `<Expandable title="T">` (`defaultOpen`); a run → `<Accordion>` + `<AccordionItem title="T">`. A title renders inline Markdown, so write a summary's `<code>`, `<strong>`, and `<a>` as Markdown in it: raw HTML there shows as text |
| `{% content-ref url="x.md" %}`; legacy `{% page-ref page="x.md" %}` | `<Card title="<x's title>" href="<x's route>" />` (the link text is a file name, so look the title up); a run → `<CardGroup>`; links to a parent's own children → `directory: "card"` |
| `[text](x.md#h "mention")` | a plain link without `"mention"`, its text replaced by the target's title |
| `{% embed url="…" %}`, often with no `{% endembed %}` | YouTube → `<YouTube url="…" />` (`?t=122` → `start={122}`; `url` ignores `t`); anything else → `<Card title="…" href="…" />`. A caption → `<Frame caption="…">` around it (YouTube's `title` only reaches screen readers) |
| `{% file src="…" %}caption{% endfile %}` | `[caption](../assets/x.pdf)`, relative to the page: Blume publishes a file a relative link names with the page. For a URL that never changes, put the file in `public/files/` and link `/files/x.pdf` |
| `<figure><img src alt><figcaption>` | `![alt](relative/path.png)` (optimized); a caption → `<Frame caption="…">` around it; `<div data-with-frame="true">` → `<Frame>`. A raw `<img>` with a relative `src` works too, but unoptimized |
| `<img class="gitbook-drawing">` | a Markdown image |
| inline `<img data-size="line">` | a Markdown image (renders at its own size), or `<img src="/<public path>" alt="" height="20" />` to stay text-height (report) |
| `<picture>` with a dark-mode source | the light image (report) |
| `<table data-view="cards">` | `<CardGroup cols={3}>` (`data-card-size="large"` → `cols={2}`), a `<Card>` per row: first text cell → `title`, other text → body, the `data-card-target` link → `href`, the `data-card-cover` file → `img`, relative to the page like a Markdown image (`img="../assets/cover.png"`), an `<i class="fa-…">` cell → `icon` |
| other `<table>` (`data-header-hidden`, `data-search`, cells with `<p>`/`<br>`) | a GFM table (a hidden header's first row becomes the header); a cell's `<ul><li>` can stay inline in `.mdx` |
| `$$…$$`, a ` ```mermaid ` fence | unchanged, in `.mdx` |
| Emoji: `:rocket:`, escaped `:ballot\_box\_with\_check:`, `<span data-gb-custom-inline data-tag="emoji">☑️</span>` | the character itself: Blume renders no shortcodes |
| `<i class="fa-x">:x:</i>` | `<Icon icon="<lucide>" />`, or delete it |
| `<a class="button primary">`, `<button data-action="…">` | a link or a `<Card>` with `cta`; search and ask buttons drop |
| `<mark style="color:…">` | `<mark>` or bold; report colors that carried meaning |
| `## Heading <a href="#x" id="x"></a>` | works as written: the heading takes `x` as its id. `## Heading [#x]` is the tidier spelling |
| `[^1]` annotations | unchanged: footnotes at the page's end, not hover popups |
| `{% updates %}` + `{% update date="…" %}` | `type: changelog` pages (SKILL.md "Changelogs"), or dated `##` sections |
| `{% prompt description="…" %}` | `<Prompt description="…">` |
| `{% if visitor… %}` | keep what the public saw, drop the tags (report) |

### Links

- Every moved file breaks the relative links into and out of it. Rewrite internal links from your table as root-absolute routes (`/deployment/permissions#roles`): Markdown links, content-ref URLs, card `href`s, and `href`s in HTML. A `README.md` target → its folder's route; absolute links to the old domain → routes.
- Cross-space links `https://app.gitbook.com/s/<spaceId>/<path>` (or `…/o/<orgId>/s/…`) → the target space's prefix plus `<path>`; `GET https://api.gitbook.com/v1/spaces/{spaceId}` gives its `urls.published`. Links into `…/~/changes/…` or to `/broken/pages/<id>` were already broken: fix or report them.

### Images and assets

- Move `.gitbook/assets/` to `assets/` at the space root and replace the string `.gitbook/assets/` with `assets/`, then recompute the paths in every moved page.
- File names have spaces and parentheses. `![](<../assets/image (1).png>)` and `../assets/image%20(1).png` both work, in a page and in an `_includes/` partial alike: a partial's images are rebased onto the including page in any form.
- GitBook keeps every upload, so many files in `assets/` may be referenced by nothing. Report them and offer to prune.

### Variables and expressions

- `.gitbook/vars.yaml` → `variables`; `<code class="expression">space.vars.NAME</code>` → `{{NAME}}`.
- `page.vars.NAME` (from `vars:` frontmatter) has no page scope: write the value inline. Read inside an include, it becomes a prop: `<include name="Computer">/_includes/x.md</include>` with `{{name}}` in the partial (prop names are lowercase).
- An expression with logic (`a ? "x" : "y"`) → evaluate it and write the result.
- Once `variables` is set, an undefined `{{name}}` in prose fails the build: placeholders that are content (`{{DeviceId}}`) go in inline code.

### Includes (reusable content)

- `.gitbook/includes/x.md` → `_includes/x.md` at the content root, and `{% include "../../.gitbook/includes/x.md" %}` → `<include>/_includes/x.md</include>` on its own line (a leading `/` resolves from the content root).
- **Demote every heading in an include one level:** GitBook renders an include's `#` at a page's `##`.
- Delete includes nothing references. One referenced by ID (`{% include "/reusable-content/…" %}`) isn't in the repo: copy it from the app.

### OpenAPI

GitBook has five forms: a `SUMMARY.md` YAML item `type: builtin:openapi` naming an organization spec (`dependencies.spec.ref.spec: <slug>`); `{% openapi src="…" path method %}`; `{% openapi-operation spec="<slug>" path method %}` and `{% openapi-schemas %}`; the older `{% swagger src="…" path method %}`; and hand-written `{% swagger method path baseUrl %}` blocks with `swagger-parameter` and `swagger-response` (oldest: `{% api-method %}`).

- **Specs.** Vendor each one into the repo — a `<slug>`'s file comes from the app's OpenAPI panel or `GET https://api.gitbook.com/v1/orgs/{organizationId}/openapi/{specSlug}/versions/latest/content/raw` — and add `openapi({ spec })` from `blume/reference` with a `navigation.tabs` entry (SKILL.md "OpenAPI").
- **`builtin:openapi`** → set `route` to the old reference's path and keep its parent page's prose under it. Operation URLs change, so redirect each old one in the sitemap (SKILL.md "OpenAPI" covers generating them).
- **Inline operations** → a link or `<Card>` to the generated page. `{% openapi-schemas %}` has no counterpart (report).
- **Hand-written blocks** → a `<ParamField query|path|header|body="…">` per parameter (a `cookie` has no slot), the responses as titled fences in `<ResponseExample>`, and `api: "GET /path"` frontmatter when it's the page's only endpoint (`baseUrl` → `api.server`).
- `x-codeSamples` carries over; GitBook's other `x-*` extensions are ignored (report).

## Frontmatter

| GitBook | Blume |
| --- | --- |
| `# Title` / `SUMMARY.md` link text | `title`; where they differ, GitBook published the `SUMMARY.md` text |
| `SUMMARY.md` link title | `sidebar.label` |
| `description` (often folded `>-`) | `description` (quote a plain value containing `: `) |
| `icon` (Font Awesome) | `icon`, in Lucide (see Icons) |
| `hidden: true` | `hidden: true`, on the page and every descendant |
| `noIndex: true` | `search.exclude: true` + `noindex: true`, on the page and every descendant |
| `noRobotsIndex: true` | `noindex: true`, on the page and every descendant |
| `cover`, `coverY`, `coverHeight`, `tags`, `if` | drop (report); a cover worth keeping → an image at the top of the body |
| `vars` | inline the values, then drop |
| keys left by older tooling (`category`, `order`) | drop: GitBook ignored them |

`layout`:

| GitBook `layout` | Blume |
| --- | --- |
| every part visible, `width: default` | delete the block |
| `tableOfContents.visible: false` | `mode: center`; with `title.visible: false` too, `mode: custom` |
| `outline.visible: false`, or `width: wide` | `mode: wide` |
| `title.visible: false`, sidebar shown | `mode: frame` |
| `pagination.visible: false` | `pagination: false` |
| other parts hidden; a preset (`layout: landing`) | drop (report); for a preset, match the published page |

A Blume mode hides more than one part: `center` and `wide` also hide the outline, and `frame` hides it and the page-end links and footer. Report it where GitBook kept those.

Blume's frontmatter is strict: remove every key the tables drop.

## Icons

GitBook uses Font Awesome names in frontmatter `icon`, `<i class="fa-…">`, tab, hint, and button icons, and section icons. Blume is Lucide-only.

- **Frontmatter:** `node <skill>/scripts/mintlify-codemod.mjs <content-dir>`, then `--write`. Its icon pass is the same Font Awesome → Lucide map, and GitBook frontmatter has none of the keys its other rules touch.
- **Everything else by hand,** with the table in `references/mintlify.md`. Common GitBook names: `circle-info` → `info`, `clock-rotate-left` → `history`, `sliders` → `sliders-horizontal`, `handshake-angle` → `handshake`, `angles-up` → `chevrons-up`, `puzzle-piece` → `puzzle`, `life-ring` → `life-buoy`, `shield-halved` → `shield`, `file-contract` → `file-text`.
- **Check every name** against the set Blume bundles; an unknown name renders nothing:

  ```bash
  node -e 'const b=require.resolve("blume/package.json");const s=require(require.resolve("@iconify-json/lucide/icons.json",{paths:[b]}));for(const n of process.argv.slice(1))console.log(n,!!(s.icons[n]||s.aliases?.[n]))' zap history sliders-horizontal
  ```

## URLs and redirects

With every file at its old URL, pages need no redirects. The rest are below. GitBook answers all of them with a 307, except a permanent site redirect (308). Blume's default `status` is 301: keep it for a settled move (`.gitbook.yaml` redirects, recovered automatic redirects), and set `status: 307` where the target may change (group paths, dropped translations).

- **`.gitbook.yaml` `redirects`** (`old/path: new/file.md`, relative to the space) → `{ from: "/<space prefix>/old/path", to: "<new/file.md's route>" }`.
- **Site redirects** (`source`, `destination`, `permanent`, `captureWildcard`, `draft`) → `{ from: source, to, status: permanent ? 308 : 307 }`. `destination` is an object, not a URL: `kind: "external"` carries `url`; `site-page` (`siteSpaceId`, `pageId`), `site-space`, and `site-section` name ids. Resolve those to the old URL — `GET …/sites/{siteId}/site-spaces` gives each site space's `urls.published` and `space.id`, `…/sites/{siteId}/sections` each section's `urls.published`, and `GET /v1/spaces/{spaceId}/content` each page's `path` within its space — then to the Blume route at that URL. A trailing `*` with `captureWildcard` → `{ from: "/old/:path*", to: "/new/:path*" }`; without it, every match goes to the one `to`. Skip drafts (the list leaves them out by default), and write `from` without the site base.
- **Automatic redirects.** GitBook quietly 307s every former URL of a moved or renamed page, and lists them nowhere. Recover them: run every historical `SUMMARY.md` (`git log --format=%h -- SUMMARY.md`, then `git show <sha>:SUMMARY.md`) through the URL rule above, add the route each file's path implies, and request each candidate from the live site (`curl -s -o /dev/null -w '%{http_code} %{redirect_url}'`). Each 307 to a page you kept becomes a redirect.
- **Group paths and the landing slug.** GitBook redirects a group's own path to its first page, and `/readme` to `/`. Add both (`status: 307` for the group paths).
- **Dropped translations.** GitBook translates group slugs (`/de/zahlungen/…` for group "Payments"), so `/de/:path*` → `/:path*` sends most translated URLs to 404s. Diff each language's `sitemap-pages.xml` against the default one, add a pattern per translated group (`{ from: "/de/zahlungen/:path*", to: "/payments/:path*", status: 307 }`), then each language's catch-all last: patterns are tried in order.
- **Case.** GitBook matched URLs case-insensitively; Blume doesn't. Lowercased files cover the canonical URLs; report mixed-case inbound links.
- **Markdown URLs.** GitBook serves `<url>.md`, and so does Blume; redirects move the `.md` URL with its page.
- Rewrite internal links **before** adding redirects: `blume validate` accepts a redirect's `from` as a link target.

### Heading anchors

GitBook makes heading ids its own way: colons, slashes, and a spaced dash become one hyphen each, dots stay, an id that would start with a digit gets `id-`, and ids stop at 100 characters (`AppConfig:OCSP:UseAuthorizedResponder` → `appconfig-ocsp-useauthorizedresponder`, where Blume writes `appconfigocspuseauthorizedresponder`). Every `#anchor` link GitBook wrote to such a heading fails `blume validate`, and links from other sites land at the top of the page. A rule predicted only 890 of 934 ids on a real site, so read them instead. After `blume build`, from the project:

```bash
node <skill>/scripts/pin-heading-ids.mjs --old https://docs.example.com          # report
node <skill>/scripts/pin-heading-ids.mjs --old https://docs.example.com --write  # pin
```

It fetches each old page once (one request at a time, cached in `.pin-heading-ids-cache/`; delete it after), pairs its headings with the build's by text, and appends the old id to each differing source heading — `[#id]` in `.mdx`, `{#id}` in `.md`, `\{#id\}` in a partial. Rebuild and rerun until it reports 0. A `NOTE … no source line` is a heading the source doesn't spell out (a component renders it, or it was reworded): pin it by hand. `--only-linked` pins only ids that content links to. A page whose URL changed (a space under a new prefix) is looked up on the old site through `--map`, a JSON list of exact `{ from, to }` entries (patterns are skipped): `dist/blume-redirects.json` works as it is, but a build writes it only when no host adapter is set. Any `BLUME_BROKEN_ANCHOR` left after that was already dead on GitBook: retarget the obvious ones, drop the fragment from the rest, and report them.

### Final check

Request each old URL from `blume dev` or `blume preview` (both apply pattern redirects) with `curl -sL`, or check it against `dist/` and `dist/blume-redirects.json` (written only when no host adapter is set), then run `blume audit --only redirects` after the build.

## Legacy GitBook CLI (`book.json`)

The old `gitbook-cli` toolchain and its fork HonKit:

- **`book.json`:** `root`, `structure`, `title`, `description`, `variables`, `plugins`. Map `title` and `description`; `root` → `content.root`; plugins → whatever Blume has built in, else report.
- **URLs are file paths:** `a/b.md` → `/a/b.html`, a `README.md` → its folder's `index.html`. Keep the files where they are, rename READMEs to `index`, and add an exact redirect from each `.html` URL (a pattern can't strip the extension).
- **`SUMMARY.md`** nests the same way, but `### Part` headings and `---` lines add no URL segment → `(part)/` group folders. Entries pointing at anchors (`page.md#x`) aren't pages.
- **Still applies:** `{% hint %}` → directives; `{% include "./x.md" %}` → `<include>`; `{{ book.name }}` → `variables` and `{{name}}`; other Nunjucks logic → evaluate and inline; `LANGS.md` → `i18n`, with the default language at the content root; `GLOSSARY.md` → no equivalent (report).

## Teardown

- **Turn off Git Sync** for every mapped space before the converted content reaches the synced branch: GitBook imports each push to it and commits its own edits back. Keep the GitBook site published until the domain moves.
- Delete `SUMMARY.md`, `.gitbook.yaml`/`.gitbook.yml`, `gitbook-docs.yaml`, and the emptied `.gitbook/`.
- Check CI and scripts that read `.md` files or `.gitbook/assets/`: a Markdown link checker breaks on root-absolute routes and skips `.mdx` (replace it with `blume validate --strict`), and an image de-duplication script that greps `*.md` would now delete images in use. Remove GitBook agent instructions (an `AGENTS.md` block, a vendored GitBook skill).
- A synced repo usually has no `package.json`: scaffold one (SKILL.md step 6).

## Dropped — report these

Site themes and styles beyond accent, fonts, and mode; footer group titles and logo; page covers; page and update tags; adaptive content and visitor authentication; GitBook Assistant unless the user adds `ai.assistant`; hint icons you didn't keep; button styles and search/ask buttons; `<mark>` colors; `fullWidth` and column widths; non-YouTube embeds as players; dark card covers and theme-aware images; inline image sizing; `{% openapi-schemas %}` and GitBook `x-*` spec extensions; automatic redirects you couldn't recover; case-insensitive URLs; page-group icons; sidebar positions Blume can't match (parent pages among loose pages, `***` dividers, external links); section groups flattened into tabs; spaces and translations not in the repo; integrations with no adapter; site redirects nobody could export; anything set only in the app that the user didn't supply.
