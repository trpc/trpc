# MkDocs (Material for MkDocs, Zensical) → Blume

MkDocs is a Python generator: one YAML config (`mkdocs.yml`), Markdown in `docs/`, and Python-Markdown extensions for everything beyond CommonMark. Nearly every MkDocs site uses the **Material for MkDocs** theme, so pages are full of extension syntax (`!!!` admonitions, `===` tabs, `--8<--` snippets, `{ #id }` attribute lists), and navigation is an explicit `nav` list in config (or alphabetical). The work is translating `mkdocs.yml`, rebuilding `nav` as folders and `meta.ts`, and converting the syntax — most of which becomes `.mdx`-only Blume features, and **MDX rejects several things Python-Markdown accepts**.

Scope: checked against MkDocs 1.6.1, Material for MkDocs 9.7.6–9.7.7, pymdown-extensions 11.0.1–12.1, mkdocs-redirects 1.2.3, awesome-pages 2.10.1, awesome-nav 3.3.0, literate-nav 0.6.3, mkdocs-static-i18n 1.3.1, mkdocs-macros 1.5.0, mike 2.2.0, an end-to-end migration of astral-sh/uv (84 pages), and the codemod on pdm-project/pdm (23 pages). **Zensical** and **ProperDocs** projects are the same migration. MkDocs 2.0 (a pre-release with a TOML config and no plugins) was not checked.

## Run the codemod first

From the folder that holds `mkdocs.yml` (keep the old Python setup until the end, so `mkdocs build` can still produce the old site for comparison):

```bash
node <skill>/scripts/mkdocs-codemod.mjs docs           # dry run: report only
node <skill>/scripts/mkdocs-codemod.mjs --write docs   # apply
```

It reads `mkdocs.yml` (or `zensical.toml`/`properdocs.yml`, `INHERIT` included) for the enabled extensions, the snippets `base_path`, `extend_pygments_lang`, and `nav` titles, then per page: converts admonitions, details, and tabs (indentation-aware, nested); turns snippets into `<include>` (copying ones from outside the content root into `_snippets/`); rewrites fences, `#!lang` inline code, heading ids, attribute lists, keys, `==mark==`/`^^ins^^`, icon shortcodes, `\(x\)` math, and abbreviation lines; moves the body H1 (ATX or setext) into `title` (inline Markdown stripped — Blume renders backticks in `title` literally), a differing `nav` title into `sidebar.label`, and a differing frontmatter `title` into `seo.title`; maps `hide`/`status`/`tags`/`icon`; renames to `.mdx` **only** the pages that now need MDX and fixes their comments, autolinks, and void tags; renames `README.md` to `index.md`; and rewrites links and `<include>`s to every renamed file. It is idempotent.

It **reports**, without changing, what needs judgment: mkdocstrings blocks, macros/Jinja, template overrides, hooks, every plugin (with a hint), mike and `extra.alternate`, snippet line ranges, `///` blocks, grid cards, code annotations, unknown icons, raw `<img>`s with a relative `src`, pages left with no title, snippet files that publish as pages too, `nav` entries with no file, and every MDX hazard left in a renamed page. Work through that report with the sections below. Nav, config, redirects, and repo integration stay yours.

After the first `blume build`, pin the old heading ids (MkDocs and Blume slug headings differ — see URLs). Point `--old` at the old site's built HTML (`mkdocs build -d <dir>` before you delete `mkdocs.yml`) or its live URL, and run it from the Blume project:

```bash
node <skill>/scripts/pin-heading-ids.mjs --old <old-build-dir-or-url>           # dry run
node <skill>/scripts/pin-heading-ids.mjs --old <old-build-dir-or-url> --write
```

Rebuild and rerun until it reports 0 (add `--map dist/blume-redirects.json` when pages moved).

## Detect

- **`mkdocs.yml` / `mkdocs.yaml`** — Material when `theme.name: material`; the plain `mkdocs`/`readthedocs` themes migrate the same way with fewer extensions. Sometimes in a subfolder (`docs/mkdocs.yml`), which `blume migrate` doesn't detect from the repo root: name the source, and run the codemod from that folder.
- **`zensical.toml`** — Zensical's format: MkDocs' keys in TOML, usually under `[project]` (`[project.theme]`, `nav = [ { "Title" = "page.md" } ]`); extensions as `[project.markdown_extensions]` keys (`admonition = {}`, `pymdownx.tabbed.alternate_style = true`) or `[project.markdown_extensions.<name>]` tables. With **no extensions configured**, Zensical enables a default set (admonition, details, tabbed, attr_list, md_in_html, keys, mark, caret, arithmatex, emoji, and more, but not snippets); the codemod applies it to a `zensical.toml`. Zensical also builds a plain `mkdocs.yml` and applies the same defaults when it sets no `markdown_extensions`: the codemod can't tell, so list the extensions the pages use in a copy of the config and pass it with `--config`.
- **`properdocs.yml` / `.yaml`** — ProperDocs, a continuation of MkDocs 1.x.
- Python deps, not `package.json`: `mkdocs`, `mkdocs-material`, `zensical`, `properdocs` in `requirements*.txt` or a `pyproject.toml` docs group; `mkdocs build`/`gh-deploy` in CI; `.readthedocs.yaml` with an `mkdocs:` key.

Resolve the config first: `INHERIT: base.yml` deep-merges this file over another (a repo may have several configs on one base — migrate the public one, report the rest). `!ENV [VAR, default]` reads an environment variable: use the default and report it. `!relative` and `!!python/name:` tags break JS YAML parsers — read the file as text.

**Where the Blume project goes.** `blume build` empties `<project>/dist`, and a Python or Rust repo root often uses `dist/` for wheels or builds. When `mkdocs.yml` sits at the root of a code repo, put `blume.config.ts` and `package.json` **in the docs folder** with `content.root: "."` and `content.include` scoped to the page folders (`["index.mdx", "{guides,concepts,reference}/**/*.{md,mdx}"]`), and say so. That also keeps a `package.json` out of a non-JS repo root.

**Generated pages.** A `nav` entry or link whose file isn't in the repo is generated at build time (`gen-files`, a hook, a CI step, a `.gitignore`d output — the codemod lists them). Convert today's output once so the site builds, then report that the **generator must change**: until it writes Blume syntax, CI regenerates the old one and Blume renders it as text with a green build. If conversion renames the output (`settings.md` → `settings.mdx`), update `.gitignore`, `.prettierignore`, and the generator's own check mode too.

## Config: `mkdocs.yml` → `blume.config.ts`

Map only what's set:

| MkDocs | Blume |
| --- | --- |
| `site_name` / `site_description` | `title` / `description` |
| `site_url` | Its origin → `deployment.site` (unless the target is Vercel or Netlify — see SKILL.md); **a path in it** (`https://docs.acme.com/uv/`) → `deployment.base: "/uv"`, on every host. mike adds its version segment after `site_url`, so it isn't part of the base (Versioning) |
| `docs_dir` | `content.root` (`docs` is the default) |
| `use_directory_urls` | no setting — see URLs |
| `repo_url` on GitHub | `github: { owner, repo }` |
| `edit_uri` / `edit_uri_template` | **`github.branch`** from the segment after `edit/` or `blob/`. Unset with a GitHub `repo_url` means `edit/master/docs/` → `branch: "master"` (Blume defaults to `main`). The path after the branch is `docs_dir`, which Blume adds — **not** `github.dir` (that's only for a project in a repo subfolder). `edit_uri: ""`, or Material without the `content.action.edit` feature, shows no edit button; Blume has no separate switch, so accept edit links or leave `github` unset and set `navigation.repo: "<repo_url>"` (a footer mark) — say which. Leave `github` unset if edit links would point at gitignored generated files |
| `repo_url` elsewhere (GitLab…) | no edit links; a header link → `navigation.actions` (report) |
| `repo_name`, `site_author`, `site_dir`, `dev_addr`, `remote_*`, `watch`, `strict`, `validation` | drop |
| `copyright` | `footer.copyright`, plain text: strip any HTML tags, decode entities (`&copy;` → `©`); a link inside it loses its URL (report, or add it to `footer.links`) |
| `exclude_docs` | `content.exclude` — the list adds to the default `"**/_*"` and `"**/.*"`; `"!**/_*"` publishes `_` files |
| `draft_docs` / `not_in_nav` | `draft: true` / `sidebar.hidden: true` on those pages |
| `extra_css` | a project-root **`theme.css`**: Material's `--md-*` variables and `.md-*` classes don't exist — port only rules that still mean something, and read colors out of it (Theme) |
| `extra_javascript` | delete MathJax/KaTeX/Mermaid loaders. Anything else → move into `public/` and `script({ src })` in `analytics` (from `blume/analytics`); a root-relative `src` (`"/js/x.js"`) loads under `deployment.base`. Code written against Material's `document$` or `.md-*` DOM won't run — report it |
| `extra.social` | `footer.socials` (bluesky, discord, facebook, github, hacker-news, instagram, linkedin, medium, podcast, reddit, slack, telegram, threads, website, x, youtube; `twitter`/`x-twitter` → `x`); the site's own repo is covered by `github`; other platforms drop (report) |
| `extra.analytics` (`provider: google`) | `googleAnalytics({ id: property })`. A `custom_dir` partial `partials/integrations/analytics/<name>.html` is a custom provider: use its adapter (`fathom({ site })` from `data-site`, …) or `script()`. `feedback` → Blume's page feedback is on by default |
| `extra.consent` | `consent: native()` (from `blume/consent`) |
| `extra.version` (`provider: mike`) | Versioning |
| other `extra` keys used as `{{ }}` | `variables` (Manual decisions: macros) |
| `markdown_extensions` | nothing to configure. `toc.toc_depth: N` → `toc: { maxHeadingLevel: N }` (a `"2-5"` range: its upper bound) |
| `plugins`, `hooks`, `theme.custom_dir` | Plugins; Manual decisions |

### Theme

| Material | Blume |
| --- | --- |
| `theme.palette` | one palette with `scheme: slate` → `theme.mode: "dark"`; with `default` → `"light"`; a list with toggles → system (the default) |
| `palette.primary` (link color) | `theme.accent`. Presets `red`, `pink`, `purple`, `blue`, `green`, `orange`, `teal` map by name. Other names aren't usable CSS (`deep purple` warns `BLUME_THEME_COLOR_INVALID`, CSS `indigo` isn't Material's): use Material 9.7's link color (`--md-typeset-a-color`) as `{ light, dark }` — indigo `#4051b5`/`#5488e8`, deep purple `#7e56c2`/`#a47bea`, light blue `#02a6f2`, cyan `#00bdd6`, deep orange `#ff6e42`/`#ff764d`, brown `#795649`/`#c1775c`, amber `#d19d00`/`#ffc105`, lime `#8b990a`/`#cbdc38`, light green `#72ad2e`/`#8bc34b`, yellow `#b8a500`/`#ffec3d`; grey, blue grey, black, and white all link in `#4051b5`/`#5e8bde`. `custom` or a custom `scheme:` is defined in `extra_css`: take `--md-typeset-a-color` per scheme (and `--md-default-bg-color` → `theme.background` when it isn't plain white/black) |
| `palette.accent` | drop |
| `theme.font.text` / `.code` | `theme.fonts.body` (and `display`) / `mono` as `{ name: "…" }`; `font: false` → drop |
| `theme.logo` (a file in `docs_dir`) | move into `public/`, `logo: "/logo.svg"` (SKILL.md on `currentColor` and wordmarks). `theme.icon.logo` → drop and report |
| `theme.favicon` | move to `public/favicon.<ext>` — no config field |
| `theme.icon.*`, `theme.language` (English) | drop. A non-English single-language site: the schema accepts a one-locale `i18n` block — check the UI language in `blume dev` |

`theme.features`:

| Feature | Blume |
| --- | --- |
| `navigation.tabs` | **`navigation.tabs`**, one per top-level `nav` section, each in one folder (SKILL.md "Tabs") |
| `navigation.sections` | top-level sections stay Blume's default `flat` headers; set **`display: "group"` in the `meta.ts` of every second-level section**: Material renders those as collapsible, and a `flat` group lists its pages above its subgroups, reordering a section that interleaves them |
| neither `sections` nor `tabs` | `navigation.sidebar.display: "group"` (Material's collapsible tree) |
| `navigation.expand` | `collapsed: false` in those folders' `meta.ts` |
| `navigation.indexes`, plugin `section-index` | a folder's `index` page links its group header. Blume also lists it as the group's first row, so the label shows twice. To show it once, as Material does, set `sidebar.hidden: true` on the index: that drops only the duplicate row, and the page stays in `sitemap.xml`, search, and `llms.txt`. A hidden index whose `title` differs from its folder's `meta.ts` `title` warns `BLUME_NAV_INDEX_TITLE_MISMATCH`, which fails `validate --strict`: match the two titles, set the index's `sidebar.label` to the folder title to keep its heading, or leave that index's row showing |
| `content.tabs.link` | same-titled tabs sync within a page, not across pages |
| `content.action.edit` / `.view` | `github` |
| `announce.dismiss` | `banner.dismissible`; the text is `main.html`'s `{% block announce %}` → `banner.content` |
| `content.code.annotate` | no equivalent (the codemod reports annotation markers) |
| `content.code.copy`/`.select`, `navigation.footer`/`.path`/`.top`/`.instant*`/`.tracking`/`.prune`, `toc.*`, `search.*`, `header.autohide`, `content.tooltips` | drop — built in or no equivalent. Blume's copy button copies only the commands of a `console` or `shellsession` block, without prompts or output, so a custom script that stripped them (`extra_javascript`) can go once those blocks use one of the two |

## Navigation

Blume builds the sidebar from folders (SKILL.md "Navigation is the file tree"). Translate `nav` into folders and `meta.ts` (the codemod already set each page's `title`/`sidebar.label`):

- **`- Section: [ … ]`** → a folder; a label that differs from the humanized folder name ("Getting started" vs "Getting Started") → `meta.ts` `title`. List order → `meta.ts` `pages`, every child. Root order → the content root's `meta.ts`.
- **A section holding an `index.md`** (with `navigation.indexes`) has that page as its own → nothing to do (see `navigation.indexes` above). Without the feature, Material lists the index as an ordinary row, which is what Blume does anyway.
- **Nesting that doesn't match folders** is SKILL.md's "Config-declared nesting". Decide per section and report:
  - **One flat folder split into subsections** (`Advanced:` listing `guides/webhooks.md`): a **`(group)/` folder** first, as SKILL.md says — `guides/(advanced)/webhooks.md` keeps `/guides/webhooks` and adds the sidebar group, with no redirects.
  - **A folder shown under another section** (uv's `pip/` under "Concepts"), where a group folder would change the URL segment: **move the files and pin `slug: <old route>` on each moved page**. The sidebar follows the file and the URL follows the slug, with no redirects and no explicit sidebar. Use it when the source kept URLs on purpose.
  - Otherwise, move the files and add `redirects` (the URLs change), or declare the shape in an explicit `navigation.sidebar` (it replaces the whole generated tree).
  - Either move puts a page a folder deeper: re-base its relative links and assets, and rewrite every link to it to name the file as it now is (a link to `page.md` resolves to a slugged page only when it names that exact file).
- **`- Title: https://…`** → `navigation.featured` (top level) or `navigation.actions`; a `nav` entry to a non-page file (`llms.txt`, a PDF) → a featured link.
- **Pages left out of `nav`** → `sidebar.hidden: true` (note: this also drops them from `sitemap.xml`).
- **No `nav`**: MkDocs lists each folder's pages (`index` first, then by filename) before its subfolders, labeled "Getting started"-style; Blume sorts by title. Add `meta.ts` `pages`/`title` where that differs.
- **`awesome-pages` `.pages` / `awesome-nav` `.nav.yml`** → a `meta.ts` per folder: `title` → `title`; `nav` → `pages` (drop awesome-pages' `...` and awesome-nav's glob entries like `"*"`; an awesome-pages `nav` without `...` hides everything unlisted → `sidebar.hidden: true`; `- Title: page.md` → `sidebar.label`); `hide: true` → hide its pages; sorting, `append_unmatched`, and `collapse*` options drop (report). Delete the files.
- **`literate-nav`** (`SUMMARY.md`): its nested link list is the nav — convert it like `nav` and delete it (it would publish as a page).

## URLs and redirects

Save the old URL list first — every `<loc>` in the old `site/sitemap.xml` (or the live one) plus every `redirect_maps` key — and check it at the end.

| Source file | MkDocs URL (`use_directory_urls: true`) | (`false`) | Blume route |
| --- | --- | --- | --- |
| `docs/a/b.md` | `/a/b/` | `/a/b.html` | `/a/b` |
| `docs/a/index.md` | `/a/` | `/a/index.html` | `/a` |
| `docs/a/README.md` | `/a/` | `/a/index.html` | `/a/README` until renamed `index.md` (the codemod does) |
| `docs/01-setup.md` | `/01-setup/` | `/01-setup.html` | **`/setup`** — Blume strips numeric prefixes; redirect, or pin `slug: 01-setup` |

- **Trailing slashes**: a static build writes `<route>/index.html`, so slashed URLs keep working on static hosts; `vercel()` 308s them; Cloudflare Workers needs `html_handling: "drop-trailing-slash"`. `blume dev` and `blume preview` redirect a slashed URL to the slashless page, so old URLs can be checked with or without the slash. **Write targets in any client-side script** (anchor-redirect maps) slashless: Blume's URLs have none.
- **`use_directory_urls: false`**: one exact redirect per non-index page (`{ from: "/a/b.html", to: "/a/b" }`; a pattern can't strip a suffix). Hosts that read `_redirects`/`vercel.json` answer them; GitHub Pages, which reads neither, is unverified.
- **`redirects` plugin**: each `redirect_maps` key and value is a Markdown path relative to `docs_dir` → `{ from: <route of key>, to: <route of value> }`, `#anchor` kept; an `http(s)` value stays a URL.
- **Anchor-level redirects** (a script mapping `/old/#section`): servers never see fragments. Keep the script (`script({ src })`, targets slashless) or drop it; report either way.
- **Heading ids**: MkDocs' default slugify strips accents, collapses punctuation runs (`A & B` → `a-b`), and numbers duplicates `_1`; Blume keeps accents, writes `a--b`, and numbers `-1`. Run `pin-heading-ids.mjs` (above) — don't compare by hand.
- **Links**: the codemod rewrites links to renamed files. After you move or rename anything yourself, point links at the real filenames again — a `page.md` link to a file now named `page.mdx` still lands on its page (Blume tries the other extension, `slug` included), but breaks wherever the Markdown is read as files, such as on GitHub. Links inside an included partial resolve from the **including** page, as with MkDocs snippets. A link to a file moved into `public/` becomes root-relative. A link MkDocs couldn't map to a file (`../install/`, written against MkDocs' slashed URLs) lands one level higher in Blume on any page that isn't an `index`, because Blume reads relative links from the page's folder: point it at the `.md` file. `blume validate --strict` catches the rest. The codemod percent-encodes angle-bracket destinations (`[x](<https://…(…)>)` → `…%28…%29`), which only tidies: Blume reads both forms, and rebases a partial's `<…>` image path onto the including page.
- **llms.txt plugins**: Blume writes `/llms.txt` and `/llms-full.txt`. The plugin's `/<route>/index.md` copies become `/<route>.md`: add one exact redirect each (a pattern can't map them; `blume audit --only redirects` accepts `.md` targets), and reword any URL advice carried into `agents.llmsTxt.details`.

## Which pages become `.mdx`

Directives, components, math, and Mermaid work only in `.mdx`, and so does an `<include>` indented inside a list item (a `.md` page reads it as indented code and ships the bare tag); the codemod renames exactly the pages that use them (or include a partial that does) and keeps the rest `.md`. MDX **fails the build** on Python-Markdown-valid source, and the codemod reports what's left in renamed pages: `<!-- -->` comments (→ `{/* … */}` on **one line**), `<https://…>` autolinks, unclosed `<br>`/`<img>`, `<placeholder>` text in prose (`uv run <command>` → backticks), and any `{…}` in prose — attribute lists, critic markup, Jinja, `{name}`. Most fail to compile, and `blume check` (and `validate`, `dev`, `build`) names each at its line as `BLUME_MDX_SYNTAX`; it also names an attribute list (`BLUME_MDX_ATTRIBUTE_LIST`: move the attributes onto a JSX element, or drop them) and an unclosed void tag (`BLUME_MDX_UNCLOSED_ELEMENT`: close it, `<br />`). `{ width="300" }`, `{target="_blank"}`, and `{name}` compile and then fail the render, which `blume build` reports as `BLUME_MDX_UNDEFINED_NAME` at the expression's line. In a `.md` page none of these fail and no extension syntax renders: it ships as text (`--8<--` becomes "–8<–", `*[HTML]: …` shows verbatim), and an attribute list warns `BLUME_MD_ATTRIBUTE_LIST`. Smart punctuation turns prose `--flag` outside backticks into an en dash.

## Content

What the codemod converts, for checking its output, and what it leaves for you:

| MkDocs | Blume |
| --- | --- |
| `!!! type "Title"` (body indented 4) | `:::type[Title]` … `:::` (longer `::::` outside nested ones). Material styles 12 types; others render like `note`. Mapped: `abstract`/`question` → `info`, `failure`/`bug` → `danger`, `example`/`important`/`todo` → `note`, `caution`/`attention` → `warning`, `hint` → `tip`, `quote` → a blockquote. Untitled callouts lose Material's "Note" title bar; a bracket title keeps its inline Markdown (an unbalanced `]` flattens it) |
| `??? type "Title"` / `???+` | `<Expandable title="Title">` / `defaultOpen`; the type's color drops, and the title keeps its inline Markdown (the codemod strips raw HTML, which would show as text) |
| `=== "Tab"` | every tab one code block → `<CodeGroup>` with the label as `title="…"`; otherwise `<Tabs>`/`<Tab title>` (`===+` → `defaultTabIndex`, `===!` → a new group) |
| `hl_lines="2 4-5"`, `linenums="1"`, `{ .py title="x" }`, options without a language | `{2,4-5}`, `lineNumbers` (a start other than 1 drops), `py title="x"`, `text {…}`. One left over warns `BLUME_CODE_FENCE_OPTION` (with the Blume spelling) or `BLUME_UNKNOWN_CODE_LANGUAGE` |
| `pycon`, `pwsh-session`, `extend_pygments_lang` names | `python`, `powershell`, the mapped lexer (any other name Shiki lacks warns `BLUME_UNKNOWN_CODE_LANGUAGE`: map it or write `text`) |
| `` `#!python x()` `` | `` `x(){:python}` `` |
| `{ #id }`, `{: #id }`, `{#id}` on headings, also beside classes (`{ #id .wide }`) | `[#id]`, classes dropped (a self-link like `### [x](#x) {: #x }` drops). One left over warns `BLUME_MD_CURLY_ANCHOR` in `.md` (only `{#id}` pins there), and `BLUME_MDX_CURLY_ANCHOR` in `.mdx` (`BLUME_MDX_ATTRIBUTE_LIST` beside classes): write `[#id]` |
| other attribute lists | dropped and reported (one left over warns `BLUME_MD_ATTRIBUTE_LIST` in `.md`): buttons → links or `<Card>`s (a homepage CTA → `navigation.cta`); image sizing → `<img … />` or `<Frame>`; `{target="_blank"}` → `markdown.externalLinks: true` |
| `++ctrl+c++`, `==x==`, `^^x^^` | `<kbd>Ctrl</kbd>+<kbd>C</kbd>`, `<mark>`, `<ins>` |
| `:material-check:` (mapped icons) | `<Icon icon="check" />`; `:octicons-link-external-16:` drops (see `externalLinks`) |
| `\(x\)`, `\[`…`\]` | `$$x$$`, `$$` blocks |
| `*[HTML]: …`, `[TOC]` | removed |
| `<div markdown>` | attribute dropped (Markdown inside renders in `.mdx`) |
| Body `# H1` | frontmatter `title` |
| **By hand:** single-`$` math | `$$…$$` inside the sentence, where it is math |
| definition lists | `<dl>` or a list |
| `///` blocks (pymdownx.blocks) | the same targets as `!!!`/`???`/`===`; `/// caption` → `<Frame caption>` |
| grid cards (`<div class="grid cards" markdown>`) | `<CardGroup>`/`<Card>` |
| code annotations (`# (1)!` + a list) | prose after the block |
| `![](x#only-light)` / `#only-dark` | a `theme.css` rule: `:root:not([data-theme="dark"]) img[src$="#only-dark"], :root[data-theme="dark"] img[src$="#only-light"] { display: none; }` (checked in a browser) |
| emoji `:smile:`, magiclink `#123`/`@user` | paste the emoji; write the links |
| unmapped icons | a Lucide name in `<Icon>` (verify at lucide.dev), or drop; brand icons (Python, Linux, Docker) have none |

### Snippets and includes

- Snippet paths resolve from the snippets `base_path` (default: where MkDocs runs), never the page; the codemod rewrites them to `/`-rooted `<include>`s.
- Includes must live in the content root. The codemod copies outside files (`CONTRIBUTING.md`, `examples/`) into `_snippets/`; if the source keeps changing, ship a small `predev`/`prebuild` script that re-copies it, and gitignore the copy. Drop a copied file's H1 (the codemod reports it) — the page's title already renders one.
- Line ranges (`file.py:3:10`) have no `<include>` equivalent: generate the excerpt with `<skill>/scripts/include-excerpts.mjs` (`lines`, run before every build so it keeps tracking the source). Sections (`file.md:name`, marked `--8<-- [start:name]`) aren't read by that script: split the section into its own file and report it.
- `auto_append` link-definition files: `<include>` the file at the end of each page that uses them. An included file's definitions resolve references in the including page, as if written inline (and the page's resolve in the partial).
- A partial is parsed with the page that includes it: its directives render only in an `.mdx` page. An HTML comment in a `.md` partial stays hidden in an `.mdx` page too.
- A snippet file that isn't under a `_` or `.` folder or name is a page too, and publishes on its own as it did in MkDocs; the codemod reports each one. Move it under `_snippets/` unless it should stay a page.
- `include-markdown` (`{% include "./x.md" %}`): `./` paths are page-relative like Blume's, bare ones `docs_dir`-relative (→ `/x.md`); `start`/`end` excerpts → their own file.

## Frontmatter

The codemod maps `hide: [toc]` → `mode: wide`, `hide: [navigation]` → `mode: center`, `hide: [footer]` → `pagination: false`, `status: new` → `sidebar.badge: New` (`deprecated` → `deprecated: true`), `tags` → `search.tags` (a hosted-search facet; tag pages drop), `icon: material/…` → a Lucide name, and drops `subtitle`, `template`, `social`, `comments`, `render_macros`. `search.exclude`/`boost` keep their meaning. It reports every other key Blume's strict schema rejects (`BLUME_FRONTMATTER_INVALID`) — map or remove them; `.meta.yml` defaults (the `meta` plugin) apply to every page in their folder.

## Plugins — map, don't drop

| Plugin | Blume |
| --- | --- |
| `search` | built in — delete |
| `redirects` | `redirects` (URLs) |
| `git-revision-date(-localized)` | `lastModified: "git"` (it shows a visible "Last updated" line) |
| `git-committers`, `git-authors`, `minify`, `privacy`, `offline`, `typeset`, `info` | drop |
| `social`, `glightbox`, `optimize` | built in: Open Graph images, image zoom, image optimization |
| `group` | unwrap and map its plugins |
| `exclude` | `content.exclude` |
| `meta`, `tags` | Frontmatter |
| `blog`, `rss` | Blog |
| `awesome-pages`, `awesome-nav`, `literate-nav`, `section-index` | Navigation |
| `include-markdown` | Snippets |
| `llmstxt` | built in: `markdown_description` → `agents.llmsTxt.details` (reword URL advice); `sections` drop |
| `macros`, `mkdocstrings`, `mkdocs-click`, `gen-files`, `mkdocs-jupyter` | Manual decisions |
| `i18n`/`static-i18n`, `mike` | i18n; Versioning |
| anything else | read what it does; report it |

## Manual decisions — stop and report

- **mkdocstrings** (`::: package.module`): no Python API generator in Blume. Keep that reference published elsewhere and link to it, use `openapi()` for an HTTP API, or hand-write the key pages; redirect the URLs you drop. The same for `mkdocs-click` CLI references and `gen-files` output.
- **macros**: plain values (`extra`, `include_yaml`, `{% set %}`) → `variables`, same `{{ name }}` syntax — names take letters, digits, `_`, `-` only, and `{{ config.x }}`/`{{ page.x }}` must be inlined. `{% include 'x.md' %}` (from `include_dir`, default `docs_dir`) → `<include>/x.md</include>`. Macro calls and control flow → expand into plain content (a one-off render script is fine); strip `{% raw %}` wrappers.
- **Template overrides** (`custom_dir`) and **hooks**: read each. Announcement → `banner`; `<head>` meta tags → `seo.metatags` (minus the tags Blume owns); analytics partials → adapters; `<title>`/JSON-LD tweaks → Blume's own; the rest → layout slots (`defineComponents`) or `blume eject`.
- **Notebooks** (`mkdocs-jupyter`): export to Markdown or link out.

## i18n

`static-i18n` `languages` → `i18n: { defaultLocale, locales: [{ code, label }] }` (both serve the default at the root, others under `/<locale>/`). `docs_structure: suffix` (`page.fr.md`, the default) → `parser: "dot"`; `folder` → the default `dir` parser with the **default locale's folder moved up to the content root**. `nav_translations` → per-locale `meta.ts` titles; `fallback_to_default` matches `fallbackLocale`. Pin translated headings with `[#id]`.

## Versioning (`mike`)

mike publishes built HTML per version (`/<version>/…`, aliases like `/latest/`); old versions' sources live only in git tags. Migrate the current version unless asked: serve it at the root and redirect `/<alias>/:path*` and `/<version>/:path*` to `/:path*`. Older versions stay on the old host (a `navigation.featured` link) or are converted from their tags into Blume's `versions.archived` (ids start with a letter). Report which.

## Blog (Material `blog` plugin)

Posts in `blog/posts/` → `type: blog` pages. `date: { created, updated }` → `date` + `lastModified`; `authors: [id]` → inline objects from `.authors.yml`; `categories` → `search.tags` or drop. Keep the old dated URL with a full-route `slug: blog/2024/01/31/my-post`, or redirect. Delete `<!-- more -->` in `.mdx`. Blume has no blog index, archive, category, or pagination pages: write `blog/index.mdx` (`docs/advanced/blog.mdx`), report the rest. RSS moves to `/blog/rss.xml`; with the `rss` plugin (mkdocs-rss-plugin), redirect its `/feed_rss_created.xml` and `/feed_rss_updated.xml` (and `/feed_json_*.json`) there.

## Repo integration and teardown

- **Assets**: everything non-Markdown in `docs_dir` that's served by URL — logo, favicon, downloads, `CNAME`, verification files — moves to `public/`. Images and other files that pages link relatively can stay: Blume publishes each with the page, though at a new URL, so a download whose old URL is linked from elsewhere moves to `public/` too.
- **Renamed files**: after the codemod, **grep the whole repo for the old page paths** — release tooling that bumps versions inside pages (`[tool.rooster] version_files`, `bumpversion`), Renovate/Dependabot file globs, CODEOWNERS, `.prettierignore`, CI path filters, and scripts.
- **Prettier**: `.prettierrc` and `.editorconfig` overrides keyed on `*.md` stop applying to the new `.mdx` files — extend them to `*.mdx` before reformatting. Prettier turns a multi-line `{/* … */}` into `{/_ … _/}` (keep MDX comments on one line) and rewrites a URL containing parentheses as a `<…>` destination (fine in a page; percent-encode it in a partial, see Links). If the repo uses Ultracite/oxfmt, see `references/monorepo.md` §6.
- **CI**: replace `mkdocs build`/`gh-deploy` with Node 22, an install, `blume build`, and `blume validate --strict` (GitHub Pages: the "Deploy Markdown docs to GitHub Pages" guide); a `.readthedocs.yaml` build is a hosting change to report. Add `.gitignore` entries for `node_modules/`, `.blume/`, `dist/`, and `.env.local`.
- **Teardown**: delete `mkdocs.yml` (and `INHERIT`ed bases), `overrides/`, `.pages`/`.nav.yml`/`SUMMARY.md`/`.meta.yml`, hooks, and `extra_css`/`extra_javascript` files once ported. Leave the Python docs dependencies for a follow-up: removing a `pyproject.toml` docs group needs a lock regeneration (`uv lock`), and CI running with `--locked`/`UV_LOCKED=1` fails until it's done — report it.

## Leftover check

Rerun until it prints only what you mean to keep (code samples, and `{{name}}` variables you defined):

```bash
grep -rnE '^\s*(!!!|\?\?\?\+?|===[+!]*) |^\s*/{3,} ?[a-z]|--8<--|\{ *[.#:][^}]*\}|\{\{|\{%|<!--|:(material|octicons|fontawesome|simple)-[a-z0-9-]+:|\+\+[a-z]|==[^= ][^=]*==|\{\+\+|\{--|^\*\[|`#![a-z]|hl_lines=|linenums=' docs
```

## Dropped — report these

Template overrides and hooks with no slot equivalent, links inside `copyright`, code annotations, admonition title bars and collapsible callout colors, `inline` admonition placement, `palette.accent`, unmapped and brand icons, abbreviation tooltips, definition-list styling, snippet line ranges and sections (split into files), tag index pages, blog archive/category/pagination pages, anchor-level redirects without the script, cross-page tab memory, git committers, mkdocstrings/click/gen-files/notebook output not carried over, macro functions and Jinja logic, social platforms `footer.socials` lacks, a `linenums` start offset, image sizing from attribute lists, and every plugin you removed without an equivalent.
