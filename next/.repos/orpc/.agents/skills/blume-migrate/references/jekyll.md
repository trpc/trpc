# Jekyll (Just the Docs) → Blume

Jekyll is a Ruby static site generator: a `_config.yml`, Markdown pages with front matter, Liquid templating (`{% … %}`, `{{ … }}`) in every page, and Kramdown as the Markdown engine. Docs sites get their navigation from a theme, and the common docs theme is **Just the Docs** (JTD). The work is turning JTD's front-matter navigation into folders and `meta.ts` without moving a URL, and converting the Kramdown and Liquid in every page. Watch for six traps:

- **Navigation lives in front matter** (`parent`, `nav_order`), not in folders. URLs come from the file path or `permalink`, so the nav tree and the file tree often disagree.
- **Kramdown attribute lists (`{: .note }`) and Liquid (`{% include %}`, `{{ site.x }}`) render as literal text in a Blume `.md` page, with a green build.** Each warns at its line (`BLUME_TEMPLATE_TAG` for Liquid, `BLUME_MD_ATTRIBUTE_LIST` for an IAL). In `.mdx` both fail the build, and `blume check` names each line first: `BLUME_MDX_SYNTAX` for Liquid, `BLUME_MDX_ATTRIBUTE_LIST` for an IAL. Callouts are IALs, so most pages need converting.
- **URLs end in a slash** (`permalink: pretty`, `/a/b/`) or in `.html` (the default), and relative links were written against those URLs.
- **The page heading is the body `# H1`.** Front matter `title` is the nav label and `<title>`.
- **Callout names are the site's own**, declared in `_config.yml`. An IAL whose name isn't declared, or is misspelled, rendered a plain paragraph.
- **What a page shows depends on Liquid and CSS that ran around it** (`jekyll.environment`, `{% if %}`, `_data`, rules in `_sass/custom` that hide sections or add text). The built site is the record of what readers saw.

Scope: **Jekyll 4.x with Just the Docs** (gem or `remote_theme`) is supported, and so is a JTD site that GitHub Pages builds with its own Jekyll 3 (differences flagged below). Checked against Jekyll 4.4.1, Just the Docs 0.12.0 (navigation as of 0.10: unlimited depth, `ancestor`), kramdown 2.5.2 with kramdown-parser-gfm 1.1.0, jekyll-redirect-from 0.17.0, GitHub Pages' gem set (`github-pages` 232, Jekyll 3.10.0), and an end-to-end migration of artineering-io/flair-docs (61 pages). **Plain Jekyll and other doc themes are manual** (see the end): the codemod's Kramdown, Liquid, link, and redirect passes apply to any Jekyll site; only the navigation is JTD's.

## Detect

- **`_config.yml`** at the root or in `docs/` (GitHub Pages' "deploy from `/docs`"). It's generic Jekyll.
- **Just the Docs:** `theme: just-the-docs` or `remote_theme: just-the-docs/just-the-docs` (also the old `pmarsceill/just-the-docs`, with or without `@ref`) in `_config.yml`, or `gem "just-the-docs"` in the `Gemfile`. Pages carry `nav_order`/`parent`.
- **Not Jekyll:** a `_toc.yml` beside `_config.yml` is Jupyter Book; `hexo` in `package.json` is Hexo. A `_config.yml` holding only `theme: jekyll-theme-*` publishes a repo's README with GitHub Pages: one page.
- **Which Jekyll:** a `Gemfile` with `gem "jekyll", "~> 4…"` is 4.x. `gem "github-pages"`, or no `Gemfile` with a `remote_theme`, is GitHub Pages' Jekyll 3 (3.10 today), which also forces nine plugins on (`jekyll-optional-front-matter`, `-readme-index`, `-titles-from-headings`, `-relative-links`, `-default-layout`, `-github-metadata`, `-gist`, `-paginate`, `-coffeescript`): front-matterless Markdown files are pages, `README.md` is its folder's index when there's no `index.md`, an untitled page takes its first heading as `title`, and `[x](page.md)` links work.

**Where the Blume project goes:** in the Jekyll source directory (the folder holding `_config.yml`), beside `_includes/` and the pages. Set `content.root: "."` and scope `content.include` to the page files (`["*.{md,mdx}", "docs/**/*.{md,mdx}"]`), and list Jekyll's own `exclude` Markdown (`README.md`, `CHANGELOG.md`) plus `vendor/**` and `node_modules/**` in `content.exclude`, which adds to the defaults `"**/_*"` and `"**/.*"` (`references/monorepo.md` §1). `_includes/` and `_data/` stay unpublished because of their underscore. In a code repo whose Jekyll source is `docs/`, that puts `package.json` in `docs/` and keeps `dist/` out of the repo root.

## Build the old site first

The old build is your URL list, your nav tree, your heading ids, and the record of what rendered. Build a copy in a folder outside the repo (`<old>` below, an absolute path), with a project-local bundle. CI usually sets `JEKYLL_ENV=production`, which switches analytics and any `jekyll.environment` branches in includes. From the Jekyll source directory:

```bash
rsync -a --exclude .git --exclude _site ./ <old>/src/ && cd <old>/src
bundle config set --local path vendor/bundle && bundle install
JEKYLL_ENV=production bundle exec jekyll build -d <old>/site
cd <old>/site && find . -name '*.html' -not -path './assets/*' | sed 's|^\.||; s|/index\.html$|/|' | sort > <old>/old-urls.txt
```

No `Gemfile` (a GitHub Pages `remote_theme` site): write one with `gem "github-pages", group: :jekyll_plugins`. Recent Rubies moved `csv`, `base64`, `bigdecimal`, and `logger` out of the default gems, so under Bundler an older Jekyll fails to load them: add the one it names to the copy's `Gemfile`. If no build works, use the live site (`pin-heading-ids.mjs --old <url>`) and its `sitemap.xml`, rebuild the nav by hand, and say so.

In `old-urls.txt`, a slashed entry is a page. An `.html` entry is a page on a non-`pretty` site, `404.html`, or a jekyll-redirect-from stub, which GitHub Pages serves without the `.html` (`/old` from `old.html`): `redirects.json` in the build lists those. Non-page files Jekyll copied (`LICENSE`, `.bat` scripts, a `Rakefile`) were published by accident unless a page links them: leave them out and report them. On Jekyll 4, a `.md` file with no front matter wasn't a page either: Jekyll copied it raw.

## Run the codemod

From the Jekyll source directory, dry-run the bundled codemod against the old build, then apply it once, before any hand edits:

```bash
node <skill>/scripts/jekyll-codemod.mjs --old <old>/site .          # report only
node <skill>/scripts/jekyll-codemod.mjs --old <old>/site --write .
```

It's zero-dependency and deterministic, and it runs once: `--write` always writes `jekyll-migration.json` and refuses a folder that already has one, because a second pass would take each page's next H1 as its title and convert what `{% raw %}` protected. To run it again, start from a fresh copy of the Jekyll source. It reads `_config.yml` (`callouts`, `url`, `baseurl`, `permalink`, `defaults` permalinks, `exclude`, plain values for `{{ site.x }}`) and every page and Markdown partial in `_includes/`, and converts what maps exactly:

- callout IALs → directives (Callouts below), `.label` → `<Badge>`, `.no_toc` and `{#id}` on headings → `[!toc]` and `[#id]`, and JTD's utility and button classes dropped; a malformed IAL, or one naming a class `callouts:` doesn't declare, rendered a plain block, so it goes and is reported;
- the in-page TOC (the list, its `<details>`, its heading, a partial holding only a TOC), `{::comment}`, ALDs;
- the body H1 → `title` (a different old `title` → `sidebar.label` and `seo.title`), with a variable it showed written in as its value, since Blume leaves front matter as written; an H1 inside an HTML comment or `<pre>` is skipped. The front matter keys follow the table below;
- `{% include x.md k="v" %}` and `{% include_relative %}` → `<include k="v">/_includes/x.md</include>` (nested ones too, `{{ include.k }}` → `{{k}}`); a parameter the partial reads but the tag leaves out printed nothing in Jekyll, so it's passed as `k=""`. Also `{{ site.x }}` → `{{x}}` variables, `{{ site.baseurl }}`, `relative_url`, `absolute_url`, `{% link %}`, `{% highlight %}`, `{% comment %}`, and `{% raw %}` (unwrapped, its content untouched);
- links: relative links resolved against each page's old URL, `.md`, `.html`, own-origin, and trailing-slash links → routes; relative Markdown images rebased from the page's new folder, and a relative raw HTML `src` → a root path (Jekyll resolved it against the page's old URL, which the new folders don't mirror);
- with `--old`, the sidebar the old build rendered → folders, `slug`s, and `meta.ts` files (Navigation below);
- each page that now needs MDX → `.mdx`, with void tags self-closed, comments as `{/* */}`, a bare `<` as `&lt;`, autolinks as links, and page `<script>`/`<style>` removed, inline code left as written; partials such a page includes get the same;
- `redirect_from`, `redirect_to`, `.html` URLs, and the variables → `jekyll-migration.json`, for the config:

```ts blume.config.ts
import { defineConfig } from "blume";

import migration from "./jekyll-migration.json" with { type: "json" };

export default defineConfig({
  redirects: migration.redirects,
  variables: migration.variables,
});
```

**Every `REVIEW` line is a to-do**, and the sections below say what to do with each: HTML includes, Liquid logic, unknown front matter, MDX hazards (a brace in prose, an indented code block), the CSS rules that hid or added content, and the theme files. A `{{ name }}` that `{% raw %}` kept as written collides with a variable of the same name, which Blume fills in everywhere, code included: rename the variable (its key in `jekyll-migration.json` and the `{{name}}` references the codemod wrote). A site whose `_config.yml` has no `callouts:` (before JTD 0.4 added the option, sites styled `.note`/`.warning` in `_sass/custom/custom.scss`) keeps its callout IALs, and the dry run says so: read those rules for the names, then pass `--callouts note,warning` on the write run.

After the first `blume build`, pin the old heading ids, rebuilding until it reports 0. Jekyll's GFM ids drop underscores (`f_position` → `#fposition`) where Blume keeps them, so about one id in twenty differs:

```bash
node <skill>/scripts/pin-heading-ids.mjs --old <old>/site --write
```

## Config: `_config.yml` → `blume.config.ts`

Apply `defaults:` (front matter defaults) to the pages in each `scope.path` that the codemod didn't see through: they often set `layout`, and sometimes `parent` or `nav_exclude`.

| Jekyll | Blume |
| --- | --- |
| `title` / `description` | `title` / `description` |
| `url` | `deployment.site`, unless the target is Vercel or Netlify (SKILL.md). GitHub Pages with a custom domain needs it |
| `baseurl` (`/repo`) | `deployment: { base: "/repo" }`. **The deployed URL decides:** the GitHub Pages starter workflow passes `--baseurl` from the Pages settings, so a custom domain (a `CNAME`) serves at the root whatever `_config.yml` says |
| `exclude` / `include` | `content.exclude` / `content.include` (Detect) |
| `permalink`, `defaults`, `collections` | URLs; above; Collections and posts |
| `plugins` | Plugins |
| `kramdown.syntax_highlighter_opts.block.line_numbers: true` | no site-wide switch: drop it and report it. Code without line numbers copies cleanly |
| `kramdown.toc_levels`, and pages built on H4 sections | Blume's outline shows H2–H3, where Kramdown's TOC listed every level. Count the H4s: when they carry the page (attribute references), set `toc: { maxHeadingLevel: 4 }`; else report it |
| other `markdown`, `kramdown`, `highlighter`, `sass`, `compress_html`, `liquid` keys | drop |
| `github_username`, `twitter`, `social.links`, a Discord link | `footer.socials` (bluesky, discord, facebook, github, hacker-news, instagram, linkedin, medium, podcast, reddit, slack, telegram, threads, website, x, youtube) |
| `repository` (jekyll-github-metadata) | `github: { owner, repo }` |
| `logo` | `logo`, file moved to `public/`. JTD shows the logo _instead of_ the title, so a wordmark needs `logo: { image, text: "" }`; a custom `_includes/title.html` that shows both keeps the text |
| `favicon_ico` | the file at `public/favicon.ico` (no config field) |
| `color_scheme: dark` | `theme.mode: "dark"`. `light`/unset → omit. A custom scheme (`_sass/color_schemes/<name>.scss`): its `$link-color` → `theme.accent` (`$blue-000` is `#2c84fa`; look the rest up in the theme's `_sass/support/_variables.scss`), and an `@import "./color_schemes/dark"` in it → `theme.mode: "dark"` |
| `aux_links` (`"Label": "url"` or `["url"]`) | `navigation.actions: [{ label, href }]`. `aux_links_new_tab` → drop (Blume opens `http(s)` header links in a new tab) |
| `nav_external_links` (`title`, `url`) | `navigation.featured` (above the sidebar, where JTD listed them below the pages) |
| `search_enabled: false` | `search: false`. `search.*` options → drop |
| `nav_enabled: false` | no site-wide switch: `mode: center` on the pages that showed no sidebar |
| `mermaid` | delete; ` ```mermaid ` renders natively in `.mdx` |
| `ga_tracking` | `googleAnalytics({ id })` from `blume/analytics`, one per `G-` id in the comma list. A `UA-` id no longer collects data: report it |
| `gh_edit_link` + `gh_edit_repository` + `gh_edit_branch` | `github: { owner, repo, branch }`. `gh_edit_source: docs` → `github.dir: "docs"` when `blume.config.ts` sits there |
| `last_edit_timestamp` | `lastModified: "frontmatter"` when pages set `last_modified_date` (the codemod maps it), else drop: JTD showed no date without it |
| `footer_content` / `_includes/footer_custom.html` | links → `footer.links`, social links → `footer.socials`; copyright text → `footer.copyright`, plain text: strip the tags, decode entities (`&copy;` → `©`), and turn a Liquid year (`{{ "now" \| date: "%Y" }}`) into `${new Date().getFullYear()}` in a template literal; other text → drop (report) or a `Footer` layout slot (`defineComponents`) |
| `callouts`, `heading_anchors`, `enable_copy_code_button`, `back_to_top*`, `nav_sort`, `nav_error_report`, `ga_tracking_anonymize_ip`, `gh_edit_link_text`, `gh_edit_view_mode` | drop (the codemod read `callouts`) |

## Navigation: front matter → folders and `meta.ts`

JTD builds one tree from `title`, `parent`, `grand_parent`/`ancestor`, and `nav_order`, wherever the files sit, and shows it as a collapsible tree with only the current section open: set **`navigation.sidebar.display: "group"`**. The codemod rebuilds the tree from the sidebar the old build rendered, so `nav_order` ties, `child_nav_order: reversed`, and `nav_sort` are already resolved, and keeps every URL:

- A parent at `dir/index.md` with its children in `dir/` (the layout JTD's docs recommend) moves nothing.
- A parent that's a leaf file with its children beside it (`docs/setup.md`, `docs/install.md`) becomes a `(group)` folder: `docs/(setup)/index.md` with `slug: docs/setup`, and the children inside it keep their URLs.
- A child whose file sits elsewhere moves under its parent with `slug: <old route>`. A child _section_ whose folder sits elsewhere is reported: `git mv` it into the parent's folder (into a `(group)` folder, its URLs stay; into a real one, pin each page's `slug`), or leave it. The parent's `meta.ts` already lists it by its folder name.
- **A `parent` title that names two pages** (two sections both titled "Setup", told apart by neither `grand_parent` nor `ancestor`): JTD listed the child under both. Blume lists a page once, so it stays under the first and the codemod reports it.
- Each folder gets a `meta.ts`: `pages` in the old order; `title` only where Blume's label for the folder (its name, humanized) differs from JTD's; `directory: "accordion"` where the old parent page listed its children (JTD's `has_toc`, read from the old build), and `"none"` below it where a page didn't, since `directory` inherits.
- **The duplicate index row:** Blume links a folder's `index` from the group row and lists it again as the first row, where JTD showed it once. The codemod hides that row (`sidebar.hidden: true`); a page the group row links stays in the sitemap, search, and `llms.txt`. `BLUME_NAV_INDEX_TITLE_MISMATCH`, which fails `validate --strict`, flags a hidden index whose `title` differs from its folder's `meta.ts` `title`, unless its `sidebar.label` names the folder title. An index whose H1 differed from its JTD title gets that title as `sidebar.label`, which is the section label, so it passes too. Where neither the page's `title` nor its `sidebar.label` matches the section label (JTD always labeled a section with its page's `title`, so this is rare), the codemod leaves the row visible and says so. The check accepts three ways out: match the two titles, set the page's `sidebar.label` to the folder title, or show the row (remove `sidebar.hidden`).
- Pages outside the old sidebar (`nav_exclude`, no `title`, a `parent` that matched nothing) get `sidebar.hidden: true`, which also takes them out of search, the sitemap, and `llms.txt`, where JTD still searched them: set `search: { indexing: { includeHiddenPages: true } }` if they should stay searchable. A hidden home page is the exception: the root URL serves it, so it stays listed. An external `nav_external_links` entry is listed for `navigation.featured`.

What's left for you:

- **A wrapper folder JTD never showed** (the template's `docs/`, any folder whose pages sit at the nav's top level) becomes one group around them. Blume opens a group that's the sidebar's only top-level row by itself, but one beside the home page's row or another section starts closed off its own pages, so the codemod writes `collapsed: false` in its `meta.ts`. A `navigation.tabs` entry instead lifts its pages to the sidebar's top level, but there pages list above groups, so JTD's interleaved order breaks. Keep the group unless the user asks for a tab.
- **The home page** (`index.md`, often `layout: home` and untitled) stays the content root's `index`. When the old nav never showed it, the codemod hides its row like any page outside the nav; a hidden home page stays in the sitemap, search, and `llms.txt`. Give it a `title` (Blume renders it as the H1, where JTD showed none) or `mode: frame` to keep the sidebar without one. Where the home page headed a JTD section, Blume's root index can't head a group: its children stay in their folders, and the codemod reports it.
- **Moving a page changes what its relative images resolve against.** The codemod rebases the Markdown images it converted, and turns a relative raw HTML `src` into a root path, with a REVIEW to serve that file from `public/`.

## URLs and redirects

A Jekyll page's URL, for `dir/name.md`:

| `permalink` (global) | `dir/name.md` | `dir/index.md` | Blume route |
| --- | --- | --- | --- |
| `pretty` | `/dir/name/` | `/dir/` | `/dir/name`, `/dir` |
| unset (`date`), `none`, `ordinal` | `/dir/name.html` | `/dir/` | same |
| a style ending in `/` / in `:output_ext` / neither | `/dir/name/` / `.html` / `/dir/name` (file `name.html`) | `/dir/` | same |

A page's own `permalink:` wins, then one `defaults:` sets for its folder (the most specific `scope.path`), then the global style. The codemod applies all three, and with `--old` it checks each URL against the build: a page the build doesn't have at that URL gets a REVIEW and no `.html` redirect. Blume serves `<route>/index.html`, so `/dir/name/` keeps working on static hosts, and `blume dev` and `preview` redirect it to `/dir/name`.

- **`.html` URLs** become one exact redirect each (a pattern can't strip a suffix). Never add one from `/dir/`, `/dir/index.html`, or `/index.html` (SKILL.md, Redirects).
- **`redirect_from`** values become redirects as written (`/old` and `/old/` are different `from`s), keeping case (`/w/Main_Page`); one that is the page's own URL is skipped. **`redirect_to`** becomes a redirect from the page's route, and an empty page with it is deleted.
- **Raw HTML** (`<a href>`, `<img src>`, `<video><source src>`) gains `deployment.base` on a root path, as a Markdown link does, so the root paths the codemod writes from relative links, `{{ site.baseurl }}`, `relative_url`, and `{% link %}` need nothing more. `blume validate` checks a raw `<a href>` against the routes and a media `src` against `public/`.
- **Jekyll 3's `{% link %}`** doesn't add `baseurl` (Jekyll 4's does, so `{{ site.baseurl }}{% link … %}` doubled it there). The codemod drops both: Blume adds the base itself.

## Content: what the codemod leaves

**HTML includes** (`{% include x.html … %}`) are never spliced: `<include>` embeds a non-Markdown file as code. Replace each use and delete the partial when nothing uses it:

- a figure → a Markdown image, or `<Frame caption="…">` around it;
- a YouTube iframe → `<YouTube url="…" />`, inside `<Frame caption>` when the include printed a caption; a `width` → drop (report). A playlist URL (`/embed/videoseries?list=…`) works as written;
- a row of embeds or code blocks in a flex `<div>` → `<Columns cols={2}>`;
- a jQuery UI accordion (`$(".accordion").accordion()` over alternating question lines and answer `<div>`s) → `<Accordion>` with one `<AccordionItem title>` per question, the first `defaultOpen` as jQuery UI opened it; an `<details>` with Markdown in it → `<Expandable title>` (MDX wraps a `<summary>` and the text after it in one paragraph);
- a note include (`note.html`, `callout.html`) → a directive.

**Liquid logic** (`{% if %}`, `{% for %}`, `{% assign %}`, `{% capture %}`, a dynamic `{% include {{ var }} %}`, a parameter passed as a variable) → the output the old build shows: split a partial with `{% if include.x %}` into one partial per variant, write a `_data` loop's output once as Markdown, inline `{{ page.x }}`. A `{{ site.x }}` that isn't a plain value in `_config.yml` is left too. Liquid ran inside fenced code as well, unless wrapped in `{% raw %}`, so a REVIEW in a code block means the old page showed the rendered value.

**CSS that changed content.** The codemod lists every `display: none` and `content: "…"` rule in `_sass/` and `assets/css/`. Find what each targets in the pages: content a rule hid wasn't shown, so delete it (and report the anchors that go with it); text a `::before`/`::after` added (`.label::before { content: "New: " }`) belongs in the converted element's text.

**MDX hazards** the codemod lists in `.mdx` pages: a brace in prose (escape it `\{` or put it in backticks), an indented code block (fence it), anything else the build names with a line. A partial with a hazard fails the build at the partial's own line (`blume check` warns `BLUME_MDX_SYNTAX` there first), and an unclosed `<img>` in a partial doesn't fail at all: it pulls the rest of the partial inside its parent element. The codemod self-closes the ones it sees, and `BLUME_MDX_UNCLOSED_ELEMENT` names the partial's line for any left.

**A title in a partial:** a page that's only `{% include api/x.md %}` takes its heading from the partial's H1. Move it into the page's `title` (plain text: no `<kbd>` or backticks) and out of the partial, or Blume renders two.

**Also by hand:** definition lists (`Term` + `: Definition` → a list or `<dl>`), `*[ABBR]:` abbreviations (delete), Font Awesome `<i class="fa…">` icons (`<Icon icon>` with a Lucide name, or drop), and page scripts the codemod removed (an island, a `PageFooter` slot, or static content: two images instead of a before/after slider).

### Callouts

JTD has no built-in callout names: each site declares its own under `callouts:` with a `color` and an optional `title`, which JTD printed uppercase above every callout of that name. The codemod maps by the name's meaning, then by color:

| JTD name (template color) | Blume |
| --- | --- |
| `note` (purple), `important` (blue) | `:::note`, `:::important` (an alias of note) |
| `tip`, `hint` | `:::tip` |
| `info`, `highlight` (yellow, untitled) | `:::info` |
| `warning`, `attention`; `caution` | `:::warning`; `:::caution` (an alias of warning) |
| `danger`; `error` | `:::danger`; `:::error` (an alias of danger) |
| `new`, `success` (green) | `:::success` |
| any other name | by its color: blue → `info`, green → `success`, yellow → `warning`, red → `danger`, purple or grey → `note` |

Blume shows a type's icon, not its name, so a configured `title` that only names the directive is dropped and one that says more is kept (`new` titled "New" → `:::success[New]`). `{: .note-title }` takes its title from the blockquote's first paragraph. A callout class on a list, table, or code block rendered no box in JTD (it styles only paragraphs and blockquotes), so it's dropped. The codemod applies each IAL to the block Kramdown did: a list or blockquote that follows a paragraph without a blank line is its own block, and an IAL with blank lines on both sides applies to the next block. An IAL indented under a list item sat inside the item, where Kramdown sometimes boxed the item's paragraph: those are reported, so check the old page and write the callout inside the item by hand.

## Front matter

The codemod maps these, and reports every other key Blume's strict schema rejects:

| Jekyll / JTD | Blume |
| --- | --- |
| `title` + body H1 | `title` = the H1; a different old title → `sidebar.label` and `seo.title` |
| `description`, or `summary` (JTD showed it in child lists) | `description`. JTD only put it in `<meta>`; Blume shows it under the title (report) |
| `layout: default` / `page` / `home` / `post` / `about` | removed |
| `layout: minimal`, `nav_enabled: false` | `mode: center` |
| a custom `layout` from `_layouts/` | reported: pick a `mode` or a custom `.astro` page |
| JTD nav keys, `permalink`, `redirect_from`, `redirect_to` | removed (Navigation, URLs) |
| `search_exclude: true` | `search: { exclude: true }` |
| `last_modified_date` | `lastModified` (ISO date) |
| `published: false` | `draft: true` |
| `image` (a string, or `{ path }`), `canonical_url` | `seo.image`, `seo.canonical` |
| jekyll-seo-tag's `seo:` `type`/`name`/`links` | removed |
| `sitemap: false` | reported: `seo: { noindex: true }` if it shouldn't be indexed, else delete |
| `author`, `date`, `lang`, `tags`, `categories`, `excerpt`, `toc` | reported: delete (`tags` → `search.tags` if a hosted search filters on them) |

## Theme, layouts, and assets

- **`_sass/custom/custom.scss`** → a project-root `theme.css` with only the rules whose markup still exists (figure classes, flex rows): JTD selectors (`.main-content`, `.site-nav`, `.site-title`) match nothing in Blume. Turn hard-coded colors into Blume's tokens.
- **Theme hook includes** (the codemod lists them): `head_custom.html` (favicons → `public/`, `<meta>` → `seo.metatags`, analytics → adapters, icon-font CSS → drop), `header_custom.html` (an announcement → `banner`), `footer_custom.html` (Config), `title.html` (→ `logo`), `nav_footer_custom.html`, `search_placeholder_custom.html`, `toc_heading_custom.html`, `mermaid_config.js`, `js/custom.js`, `lunr/*` → drop and report what each did.
- **`_layouts/`** and `.html` pages with front matter → `.mdx` (with `mode: custom` for a landing page) or a custom `.astro` page. `404.html`/`404.md` → delete (Blume ships one).
- **Assets:** a folder the old site served by root path (`/media/…`, `/assets/images/…`) moves whole to `public/` at the same path. Keep files no page references: other sites may link them. List them, and prune only once the user confirms. JTD's own `assets/css` and `assets/js` go.
- **Root files** (`favicon.ico`, `apple-touch-icon.png`, `site.webmanifest`, `.well-known/`) → `public/`. A `robots.txt` replaces Blume's generated one: keep it only if it says something Blume's doesn't. `CNAME` and `.nojekyll` aren't needed with a GitHub Actions deploy.

## Collections and posts

- **A JTD collection** (`collections: { docs: { output: true, permalink: "/:collection/:path/" } }` plus `just_the_docs.collections.docs.name`): rename `_docs/` → `docs/` so the URLs stay `/docs/…`, then run the codemod; give the folder a `meta.ts` `title` from `name`. `nav_fold: true` → `collapsed: true`. A collection document without `title` took its filename as one: write it in.
- **`_posts/`** → `type: blog` pages (`docs/advanced/blog.mdx`), with `slug` pinned to the old dated URL (`/:categories/:year/:month/:day/:title.html` by default, so also an `.html` redirect) or redirected; `{% post_url %}` → the post's route; jekyll-feed's `/feed.xml` → a redirect to `/blog/rss.xml`.

## Plugins

| Plugin | Blume |
| --- | --- |
| `jekyll-redirect-from` | `redirects` (the codemod) |
| `jekyll-seo-tag`, `jekyll-sitemap` | built in (the sitemap needs `deployment.site`) |
| `jekyll-relative-links` | built in: the codemod turns `.md` links into routes |
| `jekyll-include-cache` (`include_cached`) | same as `include` |
| `jekyll-remote-theme`, `jekyll-default-layout`, `jekyll-optional-front-matter`, `jekyll-titles-from-headings`, `jekyll-readme-index` | delete; the old build shows the pages and titles they made |
| `jekyll-github-metadata` (`site.github.*`) | inline the values; `repository` → `github` |
| `jekyll-last-modified-at` | `lastModified: "git"` |
| `jemoji` (`:smile:`), `jekyll-mentions` (`@user`), `jekyll-gist` | paste the emoji; write the links; a link or a fence |
| `jekyll-paginate`, `jekyll-coffeescript`, `jekyll-sass-converter`, `jekyll-compose` | drop |
| anything else (`_plugins/*.rb` included) | read what it does; report it |

## Plain Jekyll and other themes: manual

Run the codemod without `--old` (or with it, for the URLs): its content and link passes apply to any Jekyll site. The navigation source differs, and there's no tested mapping for it:

- **Plain Jekyll / minima:** `header_pages` (a list of files) or no nav. Lay out folders by topic and report the new sidebar.
- **Minimal Mistakes** (docs layout): `_data/navigation.yml` holds the sidebar (a key such as `docs:` listing `title` + `children: [{ title, url }]`), and pages opt in with `sidebar: { nav: "docs" }`. Convert it like a config-declared nav (SKILL.md). Notices `{: .notice }` and `.notice--primary`/`--info`/`--warning`/`--success`/`--danger` → pass those names with `--callouts` and map the types by hand; `toc: true` and `toc_*` → delete.
- **Documentation Theme for Jekyll:** `_data/sidebars/*.yml` (`entries` → `folders` → `folderitems`, then `subfolders` → `subfolderitems`), with `sidebar: <file>` and a flat `permalink: name.html` on every page. `{% include note.html content="…" %}` (also `tip`, `warning`, `important`, and `callout.html` with a `type`) → directives; `summary` → `description`; `keywords` → `search.keywords`; `last_updated` → `lastModified`.

## Repo integration and teardown

- **`package.json`** beside `blume.config.ts` (a Ruby site has none: scaffold it), Node 22.19+, `.gitignore` for `node_modules/`, `.blume/`, `dist/`, `.env.local`.
- **CI:** replace `bundle exec jekyll build` and the Pages starter workflow with the Blume one (https://useblume.dev/guides/markdown-docs-github-pages). Its `npm ci` needs a lockfile, so commit the `package-lock.json` from `npm install` in the same change. A branch-deployed Pages site moves its source to GitHub Actions in the repo settings, where the custom domain also stays: list both as manual steps. Dependabot's `bundler` entry → `npm`. Scripts that wrapped Jekyll (`serve.bat`, `Rakefile`) → delete or repoint.
- **Delete** `_config.yml`, `Gemfile`, `Gemfile.lock`, `_layouts/`, `_sass/`, theme hook and HTML includes, JTD's `assets/` files, `_site/`, `.jekyll-cache/`, and `vendor/bundle/`, once everything they declared is harvested. Keep `_includes/` partials pages still `<include>`, and `jekyll-migration.json`.
- **Grep the whole repo** for moved page paths and for `jekyll` (CODEOWNERS, link checkers, a README "build the docs" section).

## Leftover check

Rerun until it prints only code samples, `{{name}}` variables and include props you defined, and relative links you meant:

```bash
grep -rnE '\{:[ .#a-z:]|\{%|\{\{|^\*\[|^: |markdown="|<i class="fa|\.html[)#"]|\]\(\.\.?/[^).]*\)|\]\(/[^)]*/(#[^)]*)?\)' \
  --include='*.md' --include='*.mdx' --exclude-dir={node_modules,vendor,_site,.blume,dist} .
```

## Dropped — report these

Callout title labels that only named the type, unconfigured or malformed callout IALs left plain, the button and label styling the codemod dropped, `nav_external_links` moved above the sidebar, `back_to_top`, other `footer_content` text and links inside the copyright, theme hooks, custom color schemes beyond the accent, `_sass` rules with no Blume target, content a CSS rule hid, site-wide code line numbers, deeper TOC levels, `UA-` analytics ids, `sitemap: false`, abbreviations, definition-list styling, Liquid logic and `_data` loops now frozen as content, embed widths, page scripts and widgets (sliders, accordions) not rebuilt, icon-font icons with no Lucide match, accidentally published files (`LICENSE`, `.bat`), and every plugin removed without an equivalent.
