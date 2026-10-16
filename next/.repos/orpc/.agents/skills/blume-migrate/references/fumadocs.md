# Fumadocs → Blume

Fumadocs is code-first: navigation comes from the folder tree + per-folder `meta.json`. This maps cleanly to Blume — most content passes through, and `meta.json` becomes `meta.ts`. Fumadocs v16 runs on Next.js, React Router, TanStack Start, Astro, or Waku — detect by the Fumadocs files, not by Next.js files, and adjust the teardown list to whichever host framework is present.

## Detect

- Content under **`content/docs/`** (the Fumadocs convention).
- Per-folder **`meta.json`** files.
- `fumadocs-ui` / `fumadocs-core` / `fumadocs-mdx` deps, and collections declared either in a `source.config.ts` (the Config API) or, in newer scaffolds, with `defineDocs` from `fumadocs-mdx/macro` inside `lib/source.ts` (no `source.config.ts` at all).
- A `loader({ baseUrl })` call in `lib/source.ts` (or `app/source.ts`, `src/lib/source.ts`, `source.ts`). Newer scaffolds pass a constant (`baseUrl: docsRoute`) defined in `lib/shared.ts` — resolve it there.

## Config

Fumadocs declares little Blume needs — read the loader and the shared layout options:

- **Title** — the header title: `nav.title` in `baseOptions` (`lib/layout.shared.tsx`, or `app/layout.config.tsx` in older scaffolds; often the `appName` constant from `lib/shared.ts`; extract the text if it's JSX). Without one, read `package.json` `name`, prettified (drop scope, split on `-_`, Title-Case); for a generic monorepo name (`web`, `app`, `docs`…), use the repo-root directory name instead.
- **Header settings** (the same `baseOptions`): `githubUrl` → `github: { owner, repo }` (the repository and edit links; when it's built from a `gitConfig` constant in `lib/shared.ts`, `{ user, repo, branch }` → `{ owner: user, repo, branch }`); `links` entries → `navigation.actions` (`{ label: text, href: url }`), except a `type: "icon"` link to a platform `footer.socials` knows (Discord, X, …), which goes there instead. Menus, custom items, and JSX in `nav` → report.
- **Route prefix** — the `baseUrl` in the source loader (required in Fumadocs, so it's always declared). If it's a real prefix (e.g. `/docs`), set top-level **`basePath: "/docs"`** — it prefixes every route while staying invisible to the sidebar, which matches Fumadocs' behavior. (A `content.sources` `prefix` also works but adds a wrapping nav group — only use it when you _want_ the group.) If `baseUrl` is `"/"`, serve from the site root (nothing to set).

Everything else is Blume defaults.

**Also read the MDX options** — remark/rehype plugins live in `source.config.ts` `mdxOptions`, or, with the macro API, in the collection options passed to `defineDocs` (a macro project may still keep a `source.config.ts` for global options):

- `remark-math`/`rehype-katex` → nothing to configure: `$$…$$` renders in `.mdx` out of the box (there is **no** `markdown.math` field), as a block or inline within a sentence. A single `$` stays literal, so convert each inline `$…$` to `$$…$$` inside its sentence.
- A Twoslash transformer → Blume supports the `twoslash` fence meta natively; drop the plugin.
- Custom Shiki transformers/themes or other plugins → report.

## Navigation: `meta.json` → `meta.ts`

**Every `meta.json` becomes a `meta.ts` — this is the primary navigation carry-over for Fumadocs, always required, never optional.** `meta.json` is Fumadocs' canonical nav source; no filesystem-only shortcut reproduces its ordering, icons, and collapse state, so don't skip it in favor of filename inference. Move content from `content/docs/` to your chosen `content.root` (e.g. `docs/`), then convert each `meta.json` to a `meta.ts` (`defineMeta`):

| Fumadocs `meta.json` | Blume `meta.ts` |
| --- | --- |
| `title` | `title` |
| `icon` | `icon` — **convert the casing** (see Icons below) |
| `defaultOpen: false` | `collapsed: true` |
| `defaultOpen: true` | `collapsed: false` |
| `root: true` | a **`navigation.tabs` entry** (see below) — **not** a `meta.ts` field |
| `pages: [...]` slugs | `pages: [...]` (ordering) |
| `description` | **drop** (folders have no description) |
| `collapsible: false` | that folder's `display: "flat"` (a plain heading, even under a global `"group"` mode) |

`meta.ts` accepts **only** `title`, `icon`, `order`, `collapsed`, `pages`, `display`, `directory` (`"card"`/`"accordion"` lists the folder's pages below its `index` page — the replacement for a hand-written card list of the folder's children). Render mode is per-folder or global: a folder that needs collapsible rendering sets its own `meta.ts` `display: "group"` (drill-in is `"page"`); when the whole sidebar should collapse, set `navigation.sidebar.display: "group"` once in `blume.config.ts` instead of repeating it per folder.

**Numeric filename prefixes move URLs.** Fumadocs builds slugs from the file path as written, so `01-intro.mdx` serves `/docs/01-intro`; Blume reads a `01-` prefix on a file or folder as sort order and drops it from the route (`/docs/intro`). Add a `redirects` entry for every prefixed file or folder (or pin the old path with frontmatter `slug`, a full path from the content root), and write `pages` entries without the prefix (`"intro"`, not `"01-intro"`).

**`root: true` folders are Fumadocs' tab mechanism** — Fumadocs UI renders them as layout tabs and scopes the sidebar to the active one. That is exactly Blume's `navigation.tabs`: add `{ label, path, icon? }` per root folder (label/icon from its `meta.json`), pointing at the folder's route. Blume then scopes the sidebar by URL prefix the same way. Don't try to model root folders inside `meta.ts`.

Handle the `pages` array items:

- **`"..."`** (rest marker) / `""` → drop; Blume appends unlisted pages automatically. **`"z...a"`** (reversed rest) → no equivalent; list the pages explicitly in the intended order.
- **A `pages` list with no `"..."`** → Fumadocs shows **only** the listed items; every page and folder it leaves out is hidden from the sidebar (still served by URL). Blume appends unlisted children, so each one **resurfaces** — set `sidebar.hidden: true` in each left-out page's frontmatter (for a left-out folder, in every page under it — a folder with no visible page drops out of the sidebar).
- **`"!page"`** (exclusion from `"..."`) → the same trap: Blume _appends_ unlisted pages, so a dropped `!page` **resurfaces in the sidebar**. Set that page's frontmatter `sidebar.hidden: true` instead.
- **`"---Section---"`** (separator; also the `---[Icon]Label---` variant) → Blume has no flat separator. Turn each section into a **`(Section)/` group folder** (route-transparent — the `(…)` segment is stripped from URLs), and move the section's pages into it. If a section wraps a single existing folder, leave it in place and set that folder's `meta.ts` `title` instead.
- **`"...folder"`** (extract) → Blume can't flatten a folder inline; keep it as a normal group at that ordering position and report it.
- **`"[Text](url)"`** (link; also `[Icon][Text](url)` and `external:` variants) → a top-level/utility link belongs in **`navigation.featured`** (`{ label, href, icon? }` — pinned above the sidebar on every route). A link buried deep in one folder has no folder-meta home — drop and report (or model that one folder via an explicit `navigation.sidebar`).
- **`pagesIndex`** → make that page the folder's `index` (rename the file); report the route change and add a redirect.

## Frontmatter

Fumadocs' core frontmatter (`title`, `description`, `icon`) matches Blume — but **convert `icon` casing** (see Icons). **`full: true`** (full width, TOC folded into a popover) → `mode: wide` (full column width, no TOC — the closest match; report); **`_openapi`** marks a generated API stub — delete the whole page (see OpenAPI). Any other non-schema key is a build error, so drop and report.

## Icons: lucide-react names → kebab-case

Fumadocs icons are strings resolved by the repo's own `icon` handler in `loader()` — in practice **PascalCase lucide-react export names** (`"BookOpen"`, `"HomeIcon"`). Blume resolves **kebab-case** Lucide names and silently renders nothing on a miss, so pass-through loses every icon. Read the loader's icon handler to confirm the scheme, then convert each name: strip any `Icon` suffix, kebab-case it (`BookOpen` → `book-open`, `HomeIcon` → `home`), and verify it exists at [lucide.dev/icons](https://lucide.dev/icons).

## Components

- **Callouts:** `<Callout type="x">` → `:::` directive. Fumadocs types are `info` (the default), `warn`, `warning`, `error`, `success`, `idea`: `warn`/`warning`→`:::warning`, `error`→`:::danger`, `success`→`:::success`, `idea`→`:::tip`, `info` and **bare `<Callout>`** → `:::info`. `title` → `:::type[Title]`. An `icon` (a JSX element there) needs a `<Callout type="…" title="…" icon="cpu">` with its kebab-case Lucide name, since a directive can't set one; drop it if it only restated the type's icon.
- **Cards:** `<Cards>` → `<CardGroup>`. `<Card>` needs **prop surgery**, not pass-through: Fumadocs `icon` is a JSX element (`icon={<Cpu />}` imported from `lucide-react`) → Blume takes a string name (`icon="cpu"`); Fumadocs `description="…"` → Blume has no `description` prop — move the text into the card body.
- **Accordions (container/item inversion):** `<Accordions>` → `<Accordion>` (container); `<Accordion>` → `<AccordionItem>` (item).
- **File trees:** `<Files>` → **`<Tree>`** (the JSX container for `Tree.*` children — _not_ `<FileTree>`, which wraps a Markdown list); `<Folder>` → `<Tree.Folder>` (`defaultOpen` carries over); `<File>` → `<Tree.File>`. Or convert the whole block to a list-driven `<FileTree>`.
- **Tabs:** Fumadocs declares labels on the parent (`<Tabs items={['npm','pnpm']}>`) and selects with `<Tab value="npm">`. Blume's `<Tab>` carries its own `title`. Strip `items={[…]}` from `<Tabs>` and give each child `<Tab>` a `title` (from its `value`, or the positional `items` entry).
- **Pass through unchanged:** `<Steps>`/`<Step>`, `<TypeTable>` (Blume's was modeled on Fumadocs' — identical `type` record shape), `<GithubInfo>`.
- **`<Banner>`** (layout-mounted, not per-page) → the `banner` config field (`{ content, link: { href, text }, dismissible, id }`).
- **`<include>./partial.mdx</include>`** — Blume uses the same include syntax. **Pass through unchanged**: paths resolve relative to the including file, a leading `/` resolves from the content root, and nested includes work. Keep partials in `_`-prefixed files or folders so they stay out of routing and the sidebar.
- **No equivalent — report:** `<DynamicCodeBlock>`, `<ImageZoom>` (Blume zooms content images by default), `<InlineTOC>`.
- **Strip or convert every import** — not just `fumadocs-*`: `lucide-react` imports (icon JSX → string names), `next/image`/`next/link` (→ Markdown image/link), and local components. **Inventory the MDX components file before deleting it** — `components/mdx.tsx` (`getMDXComponents`) in newer scaffolds, `mdx-components.tsx` in older ones; components registered there are used import-free in MDX bodies; port or inline each usage first.

## Headings

Trailing heading markers — `[#custom-id]` (pinned anchor), `[!toc]` (hide from the TOC), `[toc]` (TOC-only entry) — use the same syntax in Blume. **Pass through unchanged.** One exception: Fumadocs' looser grammar accepts an id containing whitespace (`[#two words]`); Blume does not parse that as a marker, so rewrite such an id to a hyphenated one and update every link that targets it.

## Code fences

- ` ```npm ` fences (Fumadocs' remark-npm accepts both) → ` ```package-install `.
- Adjacent fences sharing `tab="…"` meta render as grouped tabs in Fumadocs → wrap them in a Blume `<CodeGroup>` and drop the `tab=` attrs.

## OpenAPI

`fumadocs-openapi` writes **generated MDX stubs into the content tree** (`generateFiles()` output: pages containing `<APIPage>`/`<OpenAPIPage>` with `_openapi` frontmatter), plus `lib/openapi.ts` (`createOpenAPI`) and a generate script. Treat these exactly like Mintlify endpoint stubs: **delete the generated pages**, add `openapi({ spec })` (from `blume/reference`) to the top-level `reference` list (vendor the spec locally), add a `navigation.tabs` entry for the reference route, and remove `fumadocs-openapi`, `lib/openapi.ts`, and the generate script. Keep hand-written conceptual pages (intro/auth) under the reference route.

## GraphQL

`@fumadocs/graphql` works differently from the OpenAPI flow: **no stub files** — pages are virtual, served through the Loader API. The artifacts to harvest and tear down: `lib/graphql.ts` (`createGraphQL()` — read its `input` for the schema and any per-source routes/labels), the `graphql.staticSource()`/`graphql.loaderPlugin()` wiring in the source config, the `GraphQLPage` component (`createGraphQLPage()`, usually `components/api-page.tsx` — read its playground `endpoint`), and the `@fumadocs/graphql/css/preset.css` import. Map to a `graphql({ spec, endpoint })` entry in the top-level `reference` list (see SKILL.md "GraphQL"): SDL files/text and introspection results carry over as `spec` (vendor a URL input locally); a programmatic `GraphQLSchema` instance must be printed to SDL and committed (report); the `createGraphQLPage` playground endpoint becomes `endpoint`. When `createGraphQL()` takes several inputs, or sources carry their own routes, labels, or endpoints, map each one to an entry in the adapter's `sources` (`{ spec, route, label, endpoint }`) instead of the single `spec` shorthand — otherwise a schema is dropped or mounted on the wrong route. Blume groups routes the same way (`<route>/queries/<field>`, `<route>/objects/<type>`), but slugs are re-derived — rewrite inbound links and let `blume validate` catch strays. Then remove `@fumadocs/graphql`, the two lib/component files, and the CSS import. Since there are no generated pages, there is nothing to delete from the content tree — but keep any hand-written conceptual pages under the reference route.

## i18n

A `loader({ i18n })` setup (locale-suffixed files or locale dirs) → Blume `i18n: { defaultLocale, locales: [{ code, label }] }`. Locale **directories** match Blume's default `dir` parser as-is; locale **file suffixes** (`page.cn.mdx` beside an unsuffixed default-locale `page.mdx`) match the `dot` parser as-is — add `parser: "dot"`, no file moves. Under `dot` a folder's `meta.ts` serves every locale, so build it from the default locale's `meta.json` and report any translated folder titles in `meta.<lang>.json`. Report whichever transform you apply.

## Package.json & teardown

Repoint scripts (`dev`→`blume dev`, `build`→`blume build`, `start`→`blume preview`), remove the `fumadocs-*`/`@fumadocs/*` deps and the host framework's deps (`next`, `react-router`, `@tanstack/*`…), add `blume`. Safe to delete after harvesting (see above for what to read first): `source.config.*`, `lib/source.ts`, `lib/shared.ts`, `lib/layout.shared.tsx` (or `app/layout.config.tsx`), `components/mdx.tsx` / `mdx-components.tsx`, the app/route dir, and host-framework config (`next.config.*`, `next-env.d.ts`, the `next` tsconfig plugin — or the React Router/TanStack equivalents).

## Dropped — report these

Folder `description` and `collapsible: false`; reversed rest (`z...a`) ordering; the extract (`...folder`) flatten semantics; deep-folder sidebar links; frontmatter `full` (approximated as `mode: wide`); header settings from `lib/layout.shared.tsx` with no Blume home; `<DynamicCodeBlock>`/`<InlineTOC>`; custom Shiki transformers; any icon with no Lucide equivalent after casing conversion.
