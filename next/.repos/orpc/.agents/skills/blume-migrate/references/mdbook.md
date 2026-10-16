# mdBook → Blume

mdBook is the Rust project's book generator: a `book.toml`, a hand-written `SUMMARY.md` that is the whole table of contents, and chapters in `src/` rendered by pulldown-cmark after preprocessors rewrite them (the built-in `links` expands `{{#include}}`; plugins like mdbook-admonish and mdbook-mermaid add the rest). Watch for five traps:

- **Every URL ends in `.html`** (`src/guide/setup.md` → `/guide/setup.html`, a `README.md` → `index.html`), so every chapter that isn't an index needs an exact redirect.
- **`SUMMARY.md` is the only navigation, and its nesting rarely exists on disk.** A parent chapter is a page _and_ a group, and its file sits beside its children's folder (`guide.md` + `guide/`) or flat next to them.
- **`{{#include}}` pulls code from anywhere in the repo, by `ANCHOR` name or line range.** Blume's `<include>` takes whole files from inside the content root only, so code the crate compiles goes through generated excerpts (Includes). Anchors that no longer exist rendered as empty blocks on the old site, with no warning, so expect several.
- **Fences carry Rust-only syntax.** Hidden `# ` lines and attributes like `rust,ignore` show up as code or kill highlighting if left alone.
- **The page heading is the body H1, but the sidebar label and `<title>` are the `SUMMARY.md` text**, and the two often differ.

Scope: mdBook 0.4.x and 0.5.x, checked against 0.4.48, 0.4.52, and 0.5.4, mdbook-admonish 1.19.0, mdbook-mermaid 0.15.0, and an end-to-end migration of the Linera manual (39 chapters, mdBook 0.4.48). The syntax of mdbook-katex, -toc, -tabs, and -alerts comes from their docs; it wasn't run.

## Detect

- **`book.toml`**, with `[book]` and usually `[output.html]` tables: only mdBook uses it. It sits at a standalone book's root or in a folder of a code repo (`docs/`, `book/`, `doc/`, `guide/`, `mdbook/`). The chapters live in `[book] src` (default `src/`), which can point outside that folder (`src = "../docs"`).
- **`SUMMARY.md`** in that `src`. GitBook and HonKit use `SUMMARY.md` too, but with `.gitbook.yaml` or `book.json`, never `book.toml`.
- CI that runs `mdbook build`/`mdbook test`, `peaceiris/actions-mdbook`, or `cargo install mdbook mdbook-<plugin>`. The workflow that deploys may live in another repo (one that checks the code repo out as a submodule).
- **Fingerprint the version** from the CI pin. 0.5 removed `curly-quotes`, `multilingual`, `google-analytics`, and `copy-fonts`, rejects unknown `book.toml` keys, and fails on plugins built for 0.4 (mdbook-admonish 1.19.0 and mdbook-mermaid 0.15.0 both do), so most books with plugins still build with 0.4.x.

**Where the Blume project goes.** Beside `book.toml`, the folder `mdbook build` ran in, with `content.root` set to the book's `src` (Blume's default is `docs`, so set it unless `src = "docs"`). That keeps `package.json`, `public/`, and `dist/` out of a Rust repo's root. mdBook has no manifest: scaffold `package.json` there (SKILL.md step 6). **A `src` outside that folder (`"../docs"`) works**, edit links included, and a `meta.ts` there imports `defineMeta` from `blume` as usual. That import needs a Blume release after 2.1.3: earlier ones resolved `blume` only from the meta file's own folder up, so it failed with `BLUME_META_LOAD_FAILED … Cannot find module 'blume'`. On those, export a plain object instead (`export default { title: "Developers", display: "flat", pages: […] };`).

## Build the old book first

Before changing anything, build the book with the version CI pins and its plugins, into a folder outside the repo. Prebuilt binaries of mdBook and most plugins are on their GitHub releases pages (mdbook-admonish has none for Apple Silicon: `cargo install --root <scratch> mdbook-admonish@<version>`); install them in a scratch folder, not globally.

```bash
mdbook build <book-root> -d /abs/path/old-book
MDBOOK_OUTPUT='{"markdown": {}}' mdbook build <book-root> -d /abs/path/old-md
(cd /abs/path/old-book && find . -name '*.html' ! -name print.html ! -name toc.html ! -name 404.html | sed 's|^\.||' | sort) > old-urls.txt
```

- `old-book` is the old site: its `.html` files are the old URLs, its headings carry the old ids, and its pages show what readers saw. With two or more `[output.*]` tables (`[output.linkcheck]` counts), the HTML lands in `old-book/html/`: use that folder wherever this file says `old-book`.
- `old-md` is each chapter as Markdown after `{{#include}}` and the other helpers ran (admonish blocks stay as written): what every include actually showed.
- Under 0.4 a missing plugin only warns, and its blocks render as code; the URLs are still right. Under 0.5 it fails unless `optional = true`.

## Config: `book.toml` → `blume.config.ts`

Map only what's set. CI can override keys with `MDBOOK_BOOK__…`/`MDBOOK_OUTPUT__…` environment variables, so read those too.

| `book.toml` | Blume |
| --- | --- |
| `[book] title` | `title`. Unset, mdBook showed no title: take the first chapter's H1, or ask |
| `description` | `description` |
| `src` | `content.root` |
| `language` (not `en`) | a one-locale `i18n` block (`i18n: { defaultLocale: "fr", locales: [{ code: "fr", label: "Français" }] }`); `text-direction = "rtl"` → that locale's `dir: "rtl"` |
| `authors`, `multilingual`, `[rust] edition`, `[build] build-dir`, `create-missing`, `extra-watch-dirs` | drop. With `create-missing` (on by default) mdBook created an empty page for a `SUMMARY.md` entry whose file was missing: check the old build |
| `use-default-preprocessors = false` | without `[preprocessor.links]`/`[preprocessor.index]`, `{{#…}}` stayed literal and `README.md` stayed `README.html`: read the old build |
| `[output.html] site-url = "/repo/"` | `deployment: { base: "/repo" }`. It's a path, not an origin |
| `cname` | `deployment: { site: "https://<cname>" }`; GitHub Pages isn't auto-detected. A project site with no domain → `{ site: "https://<owner>.github.io", base: "/<repo>" }` |
| `git-repository-url` on GitHub | `github: { owner, repo }`. Elsewhere → `navigation.actions` (report) |
| `edit-url-template` | `github.branch` from the segment after `edit/` or `blob/`. Set `github.dir` to the Blume project's path in the repo (`git rev-parse --show-prefix`), not the template's prefix: mdBook fills `{path}` with `<src>/<file>`, so a `src` outside the book root gave the old site broken edit links (`…/edit/main/../docs/x.md`) |
| `default-theme`, `preferred-dark-theme` | mdBook switches between them on the reader's system preference. Both dark (`coal`, `navy`, `ayu`) → `theme.mode: "dark"`; a light one plus a dark one → omit. A theme switcher deleted from `theme/index.hbs`, or a stylesheet that repaints the default theme, forces one look: read the CSS, not the name |
| `additional-css` | a root `theme.css` with only the rules whose markup still exists (`.content`, `.sidebar`, `.chapter`, `--links`, `--sidebar-*` match nothing). Read brand colors and fonts into `theme.accent`, `theme.background`, and `theme.fonts`; Blume already defaults to Inter and IBM Plex Mono. Delete `mdbook-admonish.css` |
| `additional-js` | delete the mermaid, admonish, and KaTeX assets. A gtag loader → `googleAnalytics({ id })` from `blume/analytics`; other scripts → `script()` or report |
| a `theme/` folder | diff it against `mdbook init --theme` from the same version first: stock files carry nothing to port, and the stock `favicon.png`/`favicon.svg` are mdBook's own logo (report, don't copy). Custom ones: `<head>` meta tags → `seo.metatags`; analytics → adapters; a favicon → `public/`; fonts → `theme.fonts`; the rest drops (report) |
| `google-analytics` (0.4) | `googleAnalytics({ id })` for a `G-` id; report a `UA-` id |
| `mathjax-support` | Math (Other syntax) |
| `smart-punctuation` / `curly-quotes` | Blume always converts quotes and dashes. Where the old site had it off (0.4's default), `--flag` in prose becomes an en dash: put flags in backticks |
| `no-section-label` | nothing. Without it, mdBook numbered the chapters (`1.`, `2.3.`) in the sidebar, and Blume can't: report it, and fix prose that cites "chapter 4" |
| `input-404`, `src/404.md` | delete the page; Blume ships a 404 (`pages/404.astro` to customize) |
| `[output.html.search]` | built in: drop. `search.chapter."<path>" = { enable = false }` → `search: { exclude: true }` on those pages |
| `[output.html.fold]` | Navigation |
| `[output.html.redirect]` | URLs and redirects |
| `[output.html.playground]`, `[output.html.code.hidelines]` | Code blocks |
| `[output.html.print]`, `hash-files`, `copy-fonts`, `sidebar-header-nav`, `git-repository-icon`, `definition-lists`, `admonitions`, `live-reload-endpoint`, `[output.markdown]` | drop |
| `[output.linkcheck]`, `[output.linkcheck2]` | `blume validate --strict` (`--external` for web links) |
| other backends (EPUB, PDF) | `export: { pdf: true }` prints one page at a time; a whole-book PDF or EPUB has no equivalent (report) |

## Preprocessors

| `[preprocessor.X]` | Blume |
| --- | --- |
| `links` (built in) | Includes |
| `index` (built in) | rename every `README.md` chapter to `index.md` |
| `admonish` | Admonitions |
| `mermaid` | ` ```mermaid ` works as written in `.mdx`; delete `mermaid.min.js` and `mermaid-init.js` (theme settings in `mermaid-init.js` drop) |
| `katex` | `$…$` → `$$…$$` inside its sentence; `$$` blocks stay; `\$` → `$`. Custom delimiters → convert from those. A `macros` file has no equivalent: expand the macros |
| `toc` | delete the `<!-- toc -->` marker (or the configured `marker`): the outline rail replaces it |
| `pagetoc`, `open-on-gh` | built in (outline rail; `github` edit links): delete |
| `alerts` | GitHub alerts (Admonitions) |
| `tabs` | `{{#tabs}}` / `{{#tab name="X"}}` … `{{#endtab}}` / `{{#endtabs}}` → `<Tabs>` / `<Tab title="X">`. `global="…"` drops: Blume syncs same-titled tabs page-wide |
| `i18n-helpers` (gettext, `po/*.po`) | i18n (Repo integration) |
| `cmdrun` (`<!-- cmdrun … -->`), `template`, custom ones (`command = "cargo run …"`) | diff `old-md/` against `src/` to see what each one wrote, then freeze that output or move the generator into a prebuild script (report) |
| `linkcheck` | `blume validate --strict` |
| other diagram plugins (graphviz, plantuml, svgbob) | render each diagram to an SVG once and commit it, or redraw it in mermaid (report) |
| anything else | read what it does; report it |

## Navigation: `SUMMARY.md` → folders and `meta.ts`

### How mdBook reads `SUMMARY.md`

- A `# Summary` first line is ignored. **Prefix chapters** are bare `[Title](file.md)` lines before the first list, and can't nest. **Part titles** are `# Title` headings (h1 only) over the numbered chapters that follow: plain headings, not links. **Numbered chapters** are list items (`-`, `*`, or `1.`) that nest by indentation. **Suffix chapters** are bare links after the last list. A **draft** is `[Title]()` (a greyed-out entry, no page). A **separator** is a `---` line; it can also split one part's list, leaving chapters after it under no visible heading.
- Only listed chapters render. Any other `.md` under `src/` isn't published, but every non-Markdown file there is copied to the site at its own path.
- A chapter's URL is its path with `.html`; a `README.md` (any case) becomes `index.html`. **The first chapter is also written to `/index.html`.** Its sidebar label and `<title>` are the `SUMMARY.md` text (plus ` - <book title>`); the page shows its own H1.

### Put every chapter in place

Keep each chapter's path, so its route is the old URL minus `.html`, and keep a table of old URL → file → route as you go: it becomes `redirects`.

- **Every `README.md` chapter → `index.md`.** Its route is the folder's, which `x/index.html` already served. Left as is, Blume publishes it at `/x/README`.
- **A parent chapter beside its children's folder** (`guide.md` + `guide/`): `git mv guide.md guide/index.md`. The route stays `/guide` and the folder row links to it; left in place, `guide.md` is a separate page beside an unlinked "Guide" group. The page moved a level deeper: rewrite its relative links, images, and include paths, and every link to `guide.md`.
- **Children flat beside their parent** (`ch03-00-concepts.md`, `ch03-01-variables.md`): a `(group)/` folder holding the parent as `index.md` with `slug: ch03-00-concepts`, plus the children. The group adds no URL segment, the `slug` keeps the parent's route, and the group row links to it. Rebase relative paths in every moved file.
- **The first chapter**, when it isn't the root `README.md`: move it to the content root's `index.md` and redirect its own URL to `/` (`{ from: "/introduction.html", to: "/" }`), since mdBook served it at both.
- **Ordering prefixes.** Blume drops a leading `\d+[-_.]` from every segment, keeping versions (`1.2.0`) and dates (`2024-01-05`, `12-05-2022`, `2024-01`) whole (`00-overview.md` → `/overview`). Every old URL is redirected anyway, so let Blume drop them (they keep ordering the sidebar) and point those redirects at the new routes, or pin `slug` on each page to keep the old path. Say which.
- **Files `SUMMARY.md` doesn't list** were never published: a contributors' `README.md` beside the chapters, notes, Markdown that `{{#include}}` pulls in. Prefix them with `_`, move them out of the content root, or add them to `content.exclude` (it adds to the defaults `"**/_*"` and `"**/.*"`). Report them.
- **A chapter whose body is a `<meta http-equiv="refresh" content="0; url=…">`** is a redirect, not a page to keep: add a redirect from its `.html` URL to the target, a `navigation.featured` link in place of its sidebar entry, and delete it (mdBook's `print.html` ran the same tag, so it sent the whole print page away too). Report it.
- Delete `SUMMARY.md` once folders and `meta.ts` carry its structure: it would publish as a page.
- **Check that git sees the new files.** A repo `.gitignore` can cover the content root (pages added before the rule stay tracked), and then every `meta.ts` and partial you create is silently left out of `git add`. Run `git check-ignore -v <content root>/meta.ts` after writing the first one; if it prints a rule, fix that rule or report that each new file needs `git add -f`.

### Parts, order, labels, and folding

- **Display:** set `navigation: { sidebar: { display: "group" } }`. Parent chapters become collapsible rows, like mdBook's tree, and a group keeps leaf chapters between its subgroups in `meta.ts` order (SKILL.md: `flat` can't interleave them).
- **Part titles** → a folder per part, with `title: "<part title>"` and `display: "flat"` in its `meta.ts`: a heading, not a row. When a part's chapters already share a folder (`developers/`), that folder is the part; otherwise use a `(part)/` folder at the content root, which changes no URL. Chapters after a separator inside a part get the folder they're already in (`appendix/` reads "Appendix"), or the part's heading.
- **Order** → a `meta.ts` `pages` array in each folder, every child in `SUMMARY.md` order. The root `meta.ts` orders the parts.
- **Prefix chapters** stay loose pages at the content root, which Blume lists first, as mdBook did.
- **What files can't express:** at the top of the sidebar, loose pages always list above folders. Suffix chapters, and leaf chapters between parent chapters in a book with no parts, rise above them. Put each in a `(group)/` folder (it adds a heading), or accept the order. When many chapters are affected, an explicit `navigation.sidebar` keeps `SUMMARY.md`'s order exactly: a route string per leaf chapter, `{ label, root: "<route>", items }` per parent chapter, `{ label, display: "flat", items }` per part. It replaces the generated tree, so it needs an entry per new page, as `SUMMARY.md` did. Report which you chose.
- **Labels:** `title` is the body H1, what the page showed. `sidebar.label` is the `SUMMARY.md` text where it differs, what the sidebar and `<title>` showed. A page with no H1 takes the `SUMMARY.md` text as `title`. Give each parent chapter's folder `title: "<its SUMMARY.md text>"` in `meta.ts`, or its row shows the humanized folder name. Strip Markdown from `SUMMARY.md` text: backticks render literally in `title`.
- A parent's `index` page also lists as its group's first row, so the label shows twice. To show it once, as mdBook did, set `sidebar.hidden: true` on the index: it stays in `sitemap.xml` and search because the group row still links to it. If its `title` differs from the folder's `meta.ts` title, set its `sidebar.label` to the folder title, or `BLUME_NAV_INDEX_TITLE_MISMATCH` fails `validate --strict`.
- **`[output.html.fold]`:** with `enable = true`, sections below `level` started closed (0 closes all), which is `group` mode's default; add `collapsed: false` to the folders mdBook opened. Without folding, mdBook showed every section open: add `collapsed: false` to every folder's `meta.ts`.
- **Drafts and separators** have no equivalent: drop them, and report the drafts as planned chapters.

## Content

### `.md` or `.mdx`

Rename a page to `.mdx` when it ends up with a callout, mermaid, math, tabs, or another component. Those are MDX-only: in `.md` they don't render, and the build stays green (a `:::` callout only warns `BLUME_MD_DIRECTIVE`). Tables, footnotes, strikethrough, task lists, `[#id]` heading ids, `<include>`, `{{variables}}`, and raw HTML work in both (`{#id}` only in `.md`). Fix what fails `.mdx` in each renamed page: HTML comments → `{/* … */}` on one line, unclosed `<br>`/`<img>`, `<https://…>` autolinks, and `{`, `<` in prose (`Vec<T>` outside backticks).

### Includes and the other `{{#…}}` helpers

mdBook expands these as text before parsing, so they work inside fences, inline code, and link URLs, and across a line break (`{{#include` at a line's end, the path on the next, as Prettier wraps it). A path resolves from the including file.

| mdBook | Blume |
| --- | --- |
| a fence holding only `{{#include path}}`, the whole file, inside the content root | the whole fence → `<include lang="rust">path</include>` on its own line (the fence's language; its attributes drop) |
| a fence holding only `{{#include path:anchor}}`, `path:N`, `path:N:M`, `path:N:`, or `path::M`, or any target outside the content root | an excerpt (below), included the same way |
| a fence mixing includes with hand-written lines | one excerpt that joins `{ "text": "…" }` parts and selections in order, so the block stays generated |
| `{{#rustdoc_include path:sel}}` | an excerpt of `path:sel`: the selected lines only. The rest of the file sat behind mdBook's expand toggle, which has no equivalent (report) |
| `{{#playground path attrs}}` | `<include lang="rust">` of the file (an excerpt when it's outside the root); no Run button (report) |
| `{{#include x.md}}` on its own line | `<include>/_snippets/x.md</include>` (a leading `/` is the content root): a partial must sit under a `_` folder or name, or it publishes as a page. Images in a partial resolve from the partial's own folder (mdBook resolved them from the including chapter), so fix their paths |
| a one-line file included inline (`{{#include ../VERSION}}` in a URL or a command) | `{{VERSION}}`, with `variables: { VERSION: readFileSync(new URL("../VERSION", import.meta.url), "utf8").trim() }` in `blume.config.ts` (`import { readFileSync } from "node:fs"`). Variables are replaced in links, code, and inline code too |
| `{{#title X}}` | `seo.title: X` (Blume appends the site title, as for every page) |
| `\{{#include x}}` (often in a fence that documents mdBook) | drop the backslash, which mdBook removed even inside code. `{{#include x}}` stays literal in code and in `.md`; in `.mdx` prose a `{` fails the build, so put it in inline code |

**Excerpts.** `<include>` fails the build on a target outside the content root (`BLUME_INCLUDE_OUTSIDE_ROOT`) and can't select lines. Pasting each excerpt into its page would freeze code that cargo still compiles and tests, so generate them before every run with the bundled `include-excerpts.mjs`:

1. Copy `<skill>/scripts/include-excerpts.mjs` beside `blume.config.ts`. Its header documents the manifest.
2. Write `excerpts.json` there: `out` (`<content root>/_excerpts`, relative to the manifest; Blume doesn't publish a `_` folder), and one entry per excerpt, keyed by its file name under `out`. An include's argument works as written once its path is relative to the manifest's folder (`"counter/abi.rs": "../examples/counter/src/lib.rs:contract_abi"`): the script selects anchors and line ranges exactly as mdBook did. A mixed fence is an array: `[{ "text": "impl Contract for Token {" }, "../src/contract.rs:transfer", { "text": "}" }]`.
3. Run `node include-excerpts.mjs`. It checks every entry first and lists **every** missing file, missing anchor, and line range past the end of its file in one pass, then writes nothing. A clean run writes the excerpts and deletes the ones it wrote earlier that the manifest dropped (never a file it didn't write).
4. Replace each include with `<include lang="rust">/_excerpts/counter/abi.rs</include>`.
5. Run it first in `package.json` (`"dev": "node include-excerpts.mjs && blume dev"`, and the same for `build` and a `validate` script), and gitignore `<content root>/_excerpts/`. A host's build command must be `npm run build`, not `blume build`. Rerun it after editing a source file: `blume dev` doesn't watch them.

**Missing anchors.** For each anchor the script reports (the old site showed an empty block, or only a mixed block's hand-written lines), find where the code went (`git log -S "ANCHOR: <name>"`, or search the crate for the item), then:

- **When the team owns the source, re-add the `// ANCHOR: <name>` and `// ANCHOR_END: <name>` comments around the code there.** The entry keeps working as written, and the excerpt follows the code as it changes.
- Otherwise, point the entry at a line range (`"…/lib.rs:14:23"`). It keeps selecting those line numbers when the file changes, without an error, so say so in the report.
- Drop the block, with its lead-in sentence, when the code is gone.

Report each one and what you chose. Code that now fills a formerly empty block may contradict the prose around it: list what you notice.

### Code blocks

| mdBook | Blume |
| --- | --- |
| ` ```rust,ignore `, `rust,no_run,noplayground`, `rust,should_panic`, `rust,compile_fail`, `rust,edition2021`, `rust,editable`, `rust,mdbook-runnable`, `rust,hidelines=…` | ` ```rust ` (a comma-glued language doesn't highlight, and warns `BLUME_UNKNOWN_CODE_LANGUAGE`; written with a space, ` ```rust ignore `, the keyword does nothing and warns `BLUME_CODE_FENCE_OPTION`) |
| ` ```ignore `, or no language: rustdoc tests an unlabeled block as Rust, so books label diagrams and shell lines `ignore` | ` ```text `, or the real language |
| **hidden lines** in a Rust block: first non-space character `#`, then a space or the end of the line | delete the line, and a blank line it leaves at the top of the block: readers saw it only through the eye toggle, which has no equivalent. `##x` shows as `#x`; `#[derive]` and `#!` lines are code. Lines with a `[output.html.code.hidelines]` prefix (`python = "~"`), or a fence's `hidelines=<prefix>`, go the same way |
| the play button, `editable` | static code (report) |
| `mdbook test` | nothing compiles Blume's code blocks. Excerpts stay tested by cargo; hand-written blocks that `mdbook test` compiled aren't any more (report; drop the CI step and whatever it built only for that) |

### Admonitions

**mdbook-admonish** writes ` ```admonish <type> ` with options (`title="…"`, `collapsible=true`, `id`, `class`), the older `admonish <type> "Title"`, or `~~~`/four-backtick outer fences around inner code. Each becomes a callout in `.mdx`, with a longer `::::` outer fence around a nested one:

| admonish type (aliases) | Blume |
| --- | --- |
| `note`, `example` | `:::note` |
| `info` (`todo`), `abstract` (`summary`, `tldr`), `question` (`help`, `faq`) | `:::info` |
| `tip` (`hint`, `important`) | `:::tip` |
| `success` (`check`, `done`) | `:::success` |
| `warning` (`caution`, `attention`) | `:::warning` |
| `danger` (`error`), `failure` (`fail`, `missing`), `bug` | `:::danger` |
| `quote` (`cite`) | a blockquote |
| **any other word** (`admonish warn`) | `:::note`: admonish rendered it as a note titled "Note". Don't keep the word: Blume reads `:::warn` as a warning. Report it, with the type the author probably meant |

- `title="T"` → `:::type[T]`; `title=""` → no title. An untitled block showed the word it was written with as its title bar (`Example`, `Hint`, `TL;DR`), and an untitled Blume callout shows none: where that word isn't the Blume type's name, keep it as the title (`:::note[Example]`).
- `collapsible=true` → `<Expandable title="T">` (the type's name when untitled); its color drops.
- Custom directives (`[[preprocessor.admonish.custom]]`) → the closest callout, with the label as title.
- Each block had an anchor (`#admonition-<title>`, `-1` for repeats). Links to one fail `blume validate --strict`: point them at the nearest heading or drop the fragment.

**GitHub alerts** (`> [!NOTE]`, built into 0.5 and the `alerts` plugin) render as callouts in `.mdx` as written: `NOTE` and `IMPORTANT` as a note, `TIP` a tip, `WARNING` a warning, `CAUTION` a danger callout. In `.md` they stay a blockquote with a literal `[!NOTE]` and warn `BLUME_MD_GITHUB_ALERT`: rename the page to `.mdx`. A 0.4 book without the plugin showed them as plain quotes: rendering them changes the page (report).

### Other syntax

| mdBook | Blume |
| --- | --- |
| `## Heading {#id}` | the same in `.md`; `[#id]` in `.mdx` |
| `## Heading { #id .class }` | `{#id}` or `[#id]`; classes drop. Left as is, the spaced form stays in the heading text and makes a garbage id; `BLUME_MD_CURLY_ANCHOR` flags it only when no class follows the id (in `.mdx` it fails the build) |
| footnotes, tables, strikethrough, task lists | unchanged |
| definition lists (`term` then `: definition`, on by default in 0.5) | a list or table, or raw `<dl>`; Blume renders them as one paragraph |
| MathJax (`mathjax-support`): `\\( … \\)`, `\\[ … \\]` | `$$…$$` inside the sentence, or on lines of its own for a block, in `.mdx`. Undo the Markdown escapes mdBook needed inside the math (`\\\\` for a LaTeX `\\`, any `\_` or `\*`): `$$` math is read verbatim |
| `<i class="fa fa-x"></i>` | `<Icon icon="<lucide>" />` in `.mdx`, or delete (the icon map in `references/mintlify.md`) |
| `class="left"`/`"right"` floats; `class="hidden"` | drop the class; delete hidden elements (report) |

### Links and images

- mdBook only rewrote `x.md` links to `x.html`. Blume resolves a relative `.md` link to the page that file publishes: keep them, and fix the ones into or out of every moved file.
- Rewrite `.html` links (`installation.html#cargo`) to their `.md` files: Blume serves no `.html` URLs, so they'd depend on the redirects. `blume validate` reports each one left (`BLUME_BROKEN_ASSET`, with the page's route).
- **A link to `README.md` was already dead:** mdBook wrote `README.html`, a page it never creates. Point it at the renamed `index.md`.
- Root-relative links (`/guide/x.md`) land on the page that file publishes, read from the content root, like relative ones.
- Images relative to the page work as written. So does a linked download (a PDF, an archive) that mdBook copied from `src/`: Blume publishes a file a relative link names with the page, at a new URL. Move it to `public/` at the same path only if its old URL is linked from elsewhere.

## URLs and redirects

| Source file | mdBook URL | Blume route |
| --- | --- | --- |
| `src/guide/setup.md` | `/guide/setup.html` | `/guide/setup` |
| `src/guide/README.md` | `/guide/index.html` | `/guide` |
| the first chapter, `src/intro.md` | `/intro.html` and `/index.html` | `/` once moved to `index.md` |
| `src/01-basics.md` | `/01-basics.html` | `/basics`, or `slug: 01-basics` |

- **One exact redirect per chapter that isn't an index**, `{ from: "/guide/setup.html", to: "/guide/setup" }`, built from `old-urls.txt` and your table: a pattern can't strip `.html`. Skip `/index.html` and `/x/index.html`: static hosts serve Blume's `x/index.html` there already.
- **`[output.html.redirect]`**: each key is a path from the site root, and its value is a URL relative to the key's folder (`"../infra/x.html"`), root-relative, or external. Resolve the value against the key's folder, then map it like a chapter (`.html` → route, `index.html` → its folder); external URLs stay. Check each target against the old build: one that already led to a 404 → the page that replaced it, or drop it, and report.
- **Fragment redirects** (`"/page.html#old" = "other.html#new"`, 0.4.52 and later): servers never see fragments. A heading renamed on the same page → pin the old id on it (`[#old]`); moved to another page → no server equivalent (report). A deleted page's own entry is its redirect.
- **No equivalent, no redirect:** `print.html` (the whole book on one page, `noindex`), `toc.html` (the sidebar frame, `noindex`), and `404.html` (Blume writes its own). Mention `export: { pdf: true }` for printing.
- **Hosts:** a static build writes each redirect as a meta-refresh page at `dist/<from>/index.html`, plus `_redirects` and `vercel.json`. On Netlify use `netlify({ output: "static" })` for real 301s (SKILL.md). GitHub Pages reads neither file and serves the meta-refresh page; how it answers `/x.html` there is unverified, so check a few old URLs after deploying.
- **Heading anchors:** mdBook 0.5 ids match Blume's for most headings; 0.4 lowercases ASCII only (`## Über` → `#Über`), and both count the H1, so `# Install` then `## Install` gives `#install-1`. After the first build, run `node <skill>/scripts/pin-heading-ids.mjs --old old-book` (add `--map dist/blume-redirects.json` when routes changed, built with no host adapter; `--write` to apply), and rebuild until it reports 0.
- **Check every old URL** after `blume build`. With no host adapter (static), from the Blume project:

  ```bash
  node -e '
  const fs = require("node:fs");
  const moved = new Map(JSON.parse(fs.readFileSync("dist/blume-redirects.json", "utf8")).map((r) => [r.from, r.to]));
  const built = (to) => /^https?:/.test(to) || fs.existsSync(`dist${to.replace(/#.*/, "").replace(/\/$/, "")}/index.html`);
  const misses = fs.readFileSync("old-urls.txt", "utf8").split("\n").filter(Boolean).filter((url) => {
    const to = url.endsWith("/index.html") ? url.slice(0, -"index.html".length) : moved.get(url);
    return !(to && built(to));
  });
  console.log(misses.length ? misses.join("\n") : "every old URL resolves");'
  ```

  Then run `blume audit --only redirects`.

## Repo integration and teardown

- **`package.json`** beside `blume.config.ts`: `blume` plus the `dev`/`build`/`preview`/`validate` scripts, with the excerpt step first. Commit the lockfile (SKILL.md step 6).
- **`.gitignore`:** replace `book/` with `dist/`, `.blume/`, `node_modules/`, `.env.local`, and `<content root>/_excerpts/`.
- **CI:** replace `mdbook build`/`mdbook test`, `peaceiris/actions-mdbook`, and the plugin installs with Node 22, an install, `npm run build`, and `npm run validate`. A deploy workflow in another repo needs the same change: list it as a follow-up. For GitHub Pages, follow https://useblume.dev/guides/markdown-docs-github-pages (Actions as the Pages source), with `npm run validate` and `npm run build` in place of its `blume` steps so the excerpts exist, run from the Blume project's folder, and that folder's `dist` uploaded. A deploy that pushes a branch must publish `.nojekyll`, or Jekyll drops Blume's `_astro/` folder; `peaceiris/actions-gh-pages` adds it by default.
- **`cargo doc` output published beside the book** (`/api/…`): keep building it in CI and copy `target/doc` into the build output, or link to docs.rs. Blume doesn't generate it.
- **Several builds of the book** (a stable tag and `main`, `MDBOOK_BOOK__LANGUAGE` per language): migrate the current one; older versions → `versions`, or stay on the old host (report). Translations in `po/*.po` (mdbook-i18n-helpers) apply at build time: render each language's Markdown with `MDBOOK_BOOK__LANGUAGE=<xx>` and the Markdown renderer into `<xx>/`, then set `i18n`. Report it.
- **Prettier** on the book: extend its `*.md` overrides to `*.mdx`, and keep `{/* */}` comments on one line. Prettier 3 skips what `.gitignore` ignores, so a `.gitignore` that covers the content root also makes a `prettier --check` CI step check nothing.
- **A hand-written `llms.txt` in `src/`:** Blume generates `/llms.txt`, so delete the file. Its intro goes to `agents.llmsTxt.details`. A per-page summary becomes that page's `description` only where it reads well as the page's lede, since Blume shows `description` under the title; report the rest, and the sections that list things other than pages.
- **Delete** `book.toml`, `SUMMARY.md`, `theme/`, the `additional-css`/`additional-js` files once ported, `mdbook-admonish.css`, `mermaid.min.js`, `mermaid-init.js`, and the `book/` folder. Grep the repo for `mdbook`, `book/`, and the old `.html` URLs (READMEs, CONTRIBUTING, examples, bots).

## Dropped — report these

Section numbers, separators, and draft chapters; suffix chapters and leaf chapters that moved above folders; the print page; the theme switcher and themes beyond one light and one dark; search options; the play button, the editor, and runnable or editable examples; hidden lines and their toggle; `mdbook test` coverage of hand-written blocks; `rustdoc_include` context; admonish title bars, colors, icons, custom directives, and anchors; fragment redirects across pages; the old site's empty blocks from missing anchors, and what you did with each; definition-list styling; Font Awesome icons with no Lucide match; `class="hidden"` content; plugin output you froze (cmdrun, templates, custom preprocessors); a hand-written `llms.txt`; whole-book PDF or EPUB output; and every plugin you removed without an equivalent.
