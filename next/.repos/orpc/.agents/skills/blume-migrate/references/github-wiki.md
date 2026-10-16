# GitHub Wiki → Blume

A GitHub wiki is a git repository beside the main one (`https://github.com/<owner>/<repo>.wiki.git`) that GitHub renders at `https://github.com/<owner>/<repo>/wiki`. It has no config file and no build: every file in a markup format GitHub renders is a page, `_Sidebar.md` and `_Footer.md` add the chrome, and pages link each other with `[[Page Name]]`. Five things set this migration apart:

- **Folders don't count.** A page's URL is its file name, wherever the file sits (`codebase/compiler/Codebase-Compiler-Binder.md` is `/wiki/Codebase-Compiler-Binder`), and relative links and images resolve from `/<owner>/<repo>/wiki/`, never from the file's folder.
- **`[[Link text|Page Name]]` puts the text first** in Markdown pages. GitHub's docs show the reverse, which is right only in `.mediawiki` pages, and Obsidian's `[[Page|text]]` is the reverse too, so don't point the `obsidian()` source at a wiki.
- **Blume renders `[[…]]` as literal text.** It warns `BLUME_WIKILINK_UNSUPPORTED` only for a wiki link that names one of the site's pages or has a `|`, so `[[Page that doesn't exist]]` ships with a green build. Every wiki link has to be converted.
- **The old URLs live on github.com,** which you can't redirect. What you can do there is in URLs and the old wiki below. Never tell the user the old links will redirect, and add no `redirects` for them.
- **Nothing pins the routes,** so the new site gets clean ones: one flat lowercase route per page, as the wiki had one flat namespace, with the sidebar groups as `(group)/` folders.

Scope: Markdown pages fully. Pages in the other formats GitHub renders get converted to Markdown first (Other markup formats). Checked against GitHub's wiki docs, the live rendering of public wikis (microsoft/TypeScript, microsoft/vscode, koreader, ruTorrent, qBittorrent, mpv, gollum, fzf, AdGuardHome) in October 2026, and an end-to-end migration of the microsoft/TypeScript wiki (77 pages). GitHub Enterprise Server wikis use the same files but weren't checked.

## Detect

`blume migrate` can't detect a wiki: name it, `npx blume migrate github-wiki`. A wiki clone has:

- a remote ending in `.wiki.git` (`git remote -v`);
- `Home.md` (or `Home` in another format) at the root, often `_Sidebar.md` and `_Footer.md`;
- page files named like URLs (`Getting-Started.md`, `Standalone-Server-(tsserver).md`, sometimes `Roadmap‐2021‐2022.md` with U+2010 hyphens), `[[Page Name]]` links, no config, and usually no `package.json`.

**Not this format:** Docsify keeps a lowercase `_sidebar.md` beside an `index.html` that sets `window.$docsify` (`references/docsify.md`). On macOS and Windows the file system ignores case, so `_Sidebar.md` and `_sidebar.md` are the same name to `ls`, `test -e`, and Node's `existsSync`: check the real case with `git ls-files`.

**Get the pages from the default branch.** `git clone https://github.com/<owner>/<repo>.wiki.git`, then `git remote show origin` names the HEAD branch. GitHub publishes only that branch, so other branches never showed. If the wiki is mirrored from a normal repository (a sync workflow, or a footer saying "fork it and send a pull request"), the wiki clone is still what readers saw.

## Where the Blume project goes

The wiki repository can't host the new site: GitHub runs no Actions in it, serves no Pages from it, and accepts no pull requests. Ask the user where the docs will live:

- **A folder in the main repository** (the usual choice: the docs then change in the same pull requests as the code). Follow `references/monorepo.md` for a code repo's root `package.json`, `dist/`, and workspace.
- **A new repository**, for docs with their own maintainers.

Without an answer, convert a copy of the wiki clone in place: `blume.config.ts` and `package.json` at its root, the pages moved into `docs/`, so the user can move the folder as one unit. **Before you start, run `git remote remove origin` in the copy.** Pushing the migrated tree to the wiki would publish `blume.config.ts`, every moved page, and the stubs you prepare later as wiki pages.

Wiki history doesn't come along with a plain copy. To keep it for `git log --follow` and blame, bring the wiki in with `git subtree add --prefix=<folder> https://github.com/<owner>/<repo>.wiki.git <branch>` and say so in the report. Every page gets moved and edited either way, so `lastModified: "git"` would date every page to the migration commit until it's edited again (Blume follows a rename only when the file didn't change).

## Run the codemod

From the copy of the wiki clone (when the docs go into another folder, copy the wiki's files there first and run it from there), before any hand edits:

```bash
node <skill>/scripts/github-wiki-codemod.mjs routes --repo <owner>/<repo>            # report
node <skill>/scripts/github-wiki-codemod.mjs routes --repo <owner>/<repo> --write    # write the route table
# classify the pages in wiki-routes.json (next section)
node <skill>/scripts/github-wiki-codemod.mjs convert --repo <owner>/<repo>           # dry run
node <skill>/scripts/github-wiki-codemod.mjs convert --repo <owner>/<repo> --write   # apply
```

It's zero-dependency, deterministic, and idempotent (a second `convert` skips the pages it already moved). Add `--mirror <owner>/<repo>-wiki` when a repository mirrors the wiki, and `--emoji emojis.json` (from `curl -s https://api.github.com/emojis`) when pages use `:shortcodes:`.

- **`routes`** lists the pages the way GitHub serves them and writes `wiki-routes.json` (page name → new route) and `wiki-files.json` (page name → file) beside `blume.config.ts`. It prints the files GitHub never served, routes that clash, digit-led routes, non-Markdown pages, and its guesses at moved notices and non-content pages. It never overwrites an existing table: it lists what differs instead.
- **`convert`** does everything in the Navigation, Content, and Images sections below that the table and `_Sidebar.md` decide: moves each kept Markdown page to `docs/(group)/<route>.md` (`.mdx` when it needs MDX) with its frontmatter, converts wiki links, wiki URLs, alerts, fences, headings, named anchors, and duplicate link definitions, moves the wiki's images beside the pages, and writes every `meta.ts`. It prints the `navigation.featured` entries for `blume.config.ts`, the footer's text, and a `REVIEW` line for everything that needs judgment. **Every `REVIEW` line is a to-do**; the sections below say what to do with each.
- **`check`** (after `blume build`) and **`stubs`** (for the old wiki) are in URLs and the old wiki.

The sections below are the rules the codemod applies, for checking its output and for anything you do by hand.

## The page list and the route table

**Which files are pages.** Every file whose extension GitHub renders: `.md`, `.markdown`, `.mdown`, `.mkdn`, `.mediawiki`, `.wiki`, `.textile`, `.rst`, `.rest`, `.org`, `.creole`, `.asciidoc`, `.adoc`, `.asc`, `.pod`, `.rdoc`. The page name is the file name without its last extension (`README.html.md.md` is the page `README.html.md`), with spaces read as `-`. Matching is case-insensitive, `-` and space are the same, and U+2010 is not `-`.

- **Not pages:** `_Sidebar.*` and `_Footer.*`, in any folder (GitHub even took `_Sidebar.html.md` as a sidebar). Every other `_`-prefixed file is a page (`_ [obsolete] Config.rest`), and Blume skips `_` files by default, so the rename matters.
- **Two files with the same name** in different folders share one URL, and GitHub serves one of them (the root one, on the wiki checked). The other was never reachable: leave it out and report it.
- **Every other file** (images, PDFs, `LICENSE`) is served raw at `/wiki/<path>`, which redirects to `https://raw.githubusercontent.com/wiki/<owner>/<repo>/<path>`.
- **GitHub's own list** is `https://github.com/<owner>/<repo>/wiki/_pages` (every page, each linked at its URL). Compare the table with it.

**Old URLs.** `Home` is `https://github.com/<owner>/<repo>/wiki` (`/wiki/Home` 301s there); every other page is `https://github.com/<owner>/<repo>/wiki/<Page-Name>`, percent-encoded.

**New routes.** Each page's route is its name, lowercased, with apostrophes dropped and every other run of characters that aren't letters or digits turned into one `-` (`Standalone-Server-(tsserver)` → `/standalone-server-tsserver`, `What's-new-in-TypeScript` → `/whats-new-in-typescript`, `tsconfig.json` → `/tsconfig-json`); non-Latin letters stay. `Home` becomes `/`. Give one of two clashing pages another route by hand. A route that starts with digits and a separator (`/5-0-release-notes`) would lose them as an ordering prefix, so `convert` pins it with `slug`.

**Classify every page** by editing its entry in `wiki-routes.json`:

- **Content:** keep the route.
- **A moved notice** (the whole page says it moved: "This page has moved to <URL>"): set its entry to that URL, or to the target page's route (with its `#anchor`) when the URL is another page of this wiki. It becomes no page; links to it go straight to the target. A short page that points elsewhere without saying it moved ("An introduction can be found in the handbook") is content: keep it.
- **Not content:** a mirror repository's `README.md`, `SECURITY.md`, or `CONTRIBUTING.md`, test pages, script fixtures, and pages that only say "deprecated" with nowhere to point. Set the entry to `null` and list it in the report (SKILL.md step 2).

`routes` prints its guesses for the moved notices and the non-content pages; confirm each one.

## Config

Wikis have no config: map what the repository and the special pages say.

| GitHub wiki | Blume |
| --- | --- |
| Repository name | `title` (the project's name, or "`<Project>` wiki") |
| Repository description (About) | `description` |
| The repository | `navigation.repo: "https://github.com/<owner>/<repo>"` for the footer link. Set `github: { owner, repo, branch, dir }` only once the pages live in a repository, so **Edit on GitHub** opens the new file. Leave it unset while the home is unknown, and report it |
| An image at the top of `_Sidebar.md` | `logo`, with the file in `public/` |
| External links in `_Sidebar.md` | `navigation.featured`: `convert` prints the array |
| `_Footer.md` links | `footer.links` |
| `_Footer.md` text | a copyright or license line → `footer.copyright`, as plain text (Markdown stripped); other text → drop (report), or a `PageFooter` layout slot (`defineComponents`). A "contribute to this wiki" footer drops with its link: edit links replace it |
| "edited this page … · N revisions" under each title | drop (report). `lastModified: "git"` would show the migration date on every converted page |
| Wiki search, the Pages list, the per-page outline, the clone URL box | built in, or drop |
| Site URL | none existed. Ask where the site deploys and set `deployment` (SKILL.md). GitHub Pages: https://useblume.dev/guides/markdown-docs-github-pages, with `deployment: { site: "https://<owner>.github.io", base: "/<repo>" }` for a project site |

## Navigation: `_Sidebar.md` → `(group)/` folders

GitHub showed two things in the right rail: the **Pages** list (every page, alphabetical) and, under it, `_Sidebar.md` rendered as Markdown. The sidebar becomes folders, and every page from the Pages list stays reachable.

- **Each sidebar group becomes a `(group)/` folder** (SKILL.md): it adds the sidebar group and no URL segment, so every route stays the flat one from the table. Its `meta.ts` has `title` (the label as written) and `pages` (every child in sidebar order). The content root's `meta.ts` lists the groups in sidebar order.
- **Group labels** are whatever heads a list: a bold line (`**News**`), a heading (`## Contributing`), or an unlinked list item with children (`* Testing`, a nested `(group)/` folder with `display: "group"`). A heading that links a page (`# [Tips and Tricks](…/wiki/Tips-and-Tricks)`) makes that page the group's own: a real folder with the page as its `index.md`. A heading that links outside (`## [User documentation](https://…)`) is a `navigation.featured` link.
- **A page with nested pages under it** becomes a real folder named for its route, holding the page as `index.md`, its children, and a `meta.ts` with `pages` and `display: "group"`. Each child gets `slug: <its route without the slash>` so its route stays flat. Without `display: "group"`, a nested folder lists after every loose page of its parent group, not where the sidebar had it. Blume shows the parent both as the group header and as its first row; that's expected, so don't hide it.
- **External links** can't sit inside a generated group, so they move to `navigation.featured` (above the sidebar, on every page); report the move. A link to a heading (`[Installation](…/User-patches#installation)`) has no row in Blume: drop it (the page's outline lists it) and report it.
- **A page listed twice** stays in its first group; report the other entry. `[[Home]]` in the sidebar drops: the home page is `docs/index.md`, listed first, outside every group.
- **Pages the sidebar doesn't list** were still in the Pages list: they go in a last group, `(more)/` with `title: "More pages"`, `display: "group"`, `collapsed: true`, and a `pages` list sorted by title (Blume's own order goes by file name, which differs for names like `'this' in TypeScript`). Pages that shared a wiki folder can get their own collapsed group instead (`(codebase)/`); report the groups you made.
- **No `_Sidebar.md`:** GitHub showed only the Pages list, so the pages sit at the content root (Blume sorts them by title), or in groups by the wiki's folders if it had any; report the choice.
- **A `_Sidebar.md` inside a folder** replaced the root one for that folder's pages. Usually it's a translation (`ru/_Sidebar.md` beside `ru/Home.ru.md`): map the folder to `i18n` when the pages pair up, else to a `navigation.tabs` entry, and report it.
- Prose, images, and HTML lists in the sidebar have no place in Blume's sidebar: move a logo to `logo`, put useful prose on the home page, and report the rest.

## Content

### Page files and titles

- **Each kept page** lands at `docs/(group)/<route>.md`, `Home` at `docs/index.md`. It stays `.md` unless it needs MDX (GitHub alerts, mermaid, math), then it's `.mdx` (MDX hazards below).
- **`title`** is the page name as GitHub showed it above the page: `-` → space, U+2010 → `-` (`Standalone-Server-(tsserver)` → `Standalone Server (tsserver)`, `'this'-in-TypeScript` → `'this' in TypeScript`), quoted in YAML where needed.
- **Body H1s.** GitHub drew the name as the title and every `#` in the body below it, so a page's H1s are sections, not its title (`# TypeScript 5.3` on a page named "API Breaking Changes"). A leading H1 that repeats the page name (ignoring case and punctuation) is deleted. If the page still has an H1, every heading is demoted one level (`#` → `##`, `##` → `###`, …; `######` stays), and a one-line setext heading becomes ATX one level down (`===` → `##`, `---` → `###`). A setext heading over several lines has no ATX form: `convert` reports it, so rewrite it as one `###` line by hand. Heading ids come from text, so demoting changes none.
- **`sidebar.label`** is the sidebar's text for the page, when it differs from `title` by more than case and `-` versus space.

### Wiki links

Every `[[…]]` outside code converts. GitHub leaves `[[ … ]]` in fenced code alone (bash tests), and so does `convert`: it skips fenced (in a quote too) and indented code, inline code spans, `<code>` and `<tt>` elements, and HTML comments. An indented block that holds `[[` gets a `REVIEW` line, since list continuation and code look alike there. A code span that runs across lines isn't seen as code, so check any `REVIEW` line that quotes shell syntax (`[[ -f x ]]`).

- **Inside an HTML block** (a line opening with `<div>`, `<p>`, `<table>`, `<details>`, and the like, up to the next blank line), Markdown shows as text, but gollum, the engine behind GitHub's wikis, resolves `[[…]]` before the Markdown is parsed, so it made a link there: `convert` writes `<a href="/page-name">text</a>` there, and a bare wiki URL too. An image tag there gets a `REVIEW` line: write it as `<img src="…" />` with the relative path the line gives (Blume publishes the file with the page), or move it out of the block. A `#` line inside the block is text, not a heading, so it isn't demoted.
- **`'[[Page]]`** (an apostrophe right before, none right after) is gollum's escape for literal brackets: `convert` leaves it and reports it. Check the live page, and drop the apostrophe if it showed the brackets.
- **`\[\[Page\]\]`** converts as a wiki link, because pandoc writes them that way (Other markup formats), with a `REVIEW` line: on a page that was always Markdown, GitHub showed those brackets, so restore them there.

| GitHub (`.md` pages) | Blume |
| --- | --- |
| `[[Page Name]]` | `[Page Name](/page-name)`: the text as written, the route from the table |
| `[[Link text\|Page Name]]` | `[Link text](/page-name)` |
| `[[Page Name#anchor]]`, `[[text\|Page Name#anchor]]` | `[…](/page-name#anchor)`, the anchor as written |
| `[[text\|https://…]]` | `[text](https://…)` |
| `[[Home]]` | `[Home](/)` |
| a page the wiki doesn't have (GitHub drew it as a link to create the page), or one set to `null` | plain text; reported |
| a moved notice | a link to its target |
| `[[image.png]]`, `[[/images/x.png\|alt=Text]]`, `[[x.png\|align=center,frame,alt=Text]]`, `[[https://…/x.png\|alt=Text]]` | an image: `![Text](…)` (Images and files). Any first part with an image extension is an image, whatever follows; options are separated by `,` or `\|`. A leading `/` is the wiki root. A path the root doesn't have but the page's own folder does resolves there, reported. Options other than `alt=` (`width=`, `align=`, `frame`, stray text) drop; reported |
| `[[text\|docs/spec.pdf]]` (a file stored in the wiki) | left as is and reported: copy the file into `public/` and link its root path |
| `[[_TOC_]]` | deleted: GitHub lists a table of contents among unsupported syntax, and Blume's outline shows the headings |

(In this table `\|` is the table's escape for a single pipe.) GitHub trims spaces around the pipe (`[[Mailing list | https://…]]`), and inside a Markdown table cell the pipe may be written `\|`. Pages are looked up the way GitHub did: by name, ignoring case, with `-` and space interchangeable and folders ignored. **Anchors are case-sensitive in Blume** and weren't on GitHub, wherever they appear: when `blume validate` reports one (`#TSDeclFiles` for a heading pinned `[#TsDeclFiles]`), match the id's case.

### Markdown links

| Link | Blume |
| --- | --- |
| `https://github.com/<owner>/<repo>/wiki/Page-Name` (any case of owner and repo, `http`, `www.`), `/<owner>/<repo>/wiki/Page-Name`, or bare `Page-Name` / `./Page-Name` | the page's route through the table, keeping `#anchor`, percent-decoded (`%28` is `(`) |
| `…/wiki`, `…/wiki/`, `…/wiki/Home` | `/` |
| a mirror repository's copy of a page (`https://github.com/<owner>/<repo>-wiki/blob/<branch>/Page.md`) | the page's route (`--mirror`): the mirror goes stale with the wiki |
| a bare wiki URL in prose, or `<https://…/wiki/Page>` | `[Page title](/route)` |
| a page's file by its path (`dir/Page.md`, `…/wiki/dir/Page.md`), which GitHub served raw | the page's route; reported |
| `#user-content-x` | `#x` (GitHub's ids carry that prefix, so both forms worked there) |
| relative links that leave the wiki (`../issues/12`, `../blob/main/src/x.ts`, `../../other-repo`) | the absolute URL each resolved to from `https://github.com/<owner>/<repo>/wiki/<page>` (`../issues/12` → `https://github.com/<owner>/<repo>/issues/12`) |
| a link to a page that doesn't exist (`./formatter.md`, `GLOSSARY.md#x`: GitHub served nothing there) | left as is and reported: it was broken on GitHub too, so retarget it (often the page moved to another repository) or unlink it |
| `…/wiki/_pages`, `…/wiki/<Page>/_history`, revision URLs | left and reported: they point at the wiki's UI and stop working with it |
| another repository's wiki | unchanged |

`#123` and `@user` are plain text in wikis (GitHub doesn't autolink them there), so they stay. Bare URLs autolink in both. A raw HTML `<a href>` to a wiki page gets the route too (and a wiki link in an HTML block becomes one); Blume adds `deployment.base` to its root path like a Markdown link's.

### Link definitions

`blume validate` checks every link reference definition the page uses, including ones nothing cites; when a label is defined twice it checks only the first, which CommonMark uses. Wikis kept by scripts collect definitions that never rendered:

- **A later definition of a label** never rendered: `convert` deletes it.
- **A Foam or VS Code block** of autogenerated definitions (`[//begin]: # "Autogenerated link references…"` … `[//end]: #`) goes too: once the wiki links are converted, nothing uses it.
- **A line like `[1]: <src/file.ts - function x(`** with no closing `>` isn't a definition at all: it shows as text, on GitHub and in Blume alike. Leave it, or delete it if it's leftover tooling syntax, and report it.

### GitHub Markdown

| GitHub | Blume |
| --- | --- |
| `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]` at the start of a line | `:::note`, `:::tip`, `:::note`, `:::warning`, `:::danger`, in `.mdx`. Blume renders an alert itself as the same callout in `.mdx`, so `convert` leaves one indented in a list, or with lazy lines, as written and makes the page `.mdx`. One with text after its marker, or no body, is reported: convert it by hand. In a `.md` page an alert renders as a quote with a literal `[!NOTE]` and warns `BLUME_MD_GITHUB_ALERT`: rename the page to `.mdx`. The older `> **Note**` form is a plain quote on GitHub today: leave it |
| ` ```mermaid ` | the same fence, in `.mdx` |
| ` ```math ` | a `$$` block, in `.mdx` |
| `$…$`, ``$`…`$``, `$$…$$` | by hand: `$$…$$` in `.mdx` (inline ones stay in their sentence; SKILL.md "Math") |
| ` ```geojson `, `topojson`, `stl` | a code block: maps and 3D models drop; reported |
| Fence languages | lowercased (`TypeScript` → `typescript`), which only tidies: Blume reads them in any case, as GitHub did. `posh` → `powershell`. Any other name Shiki lacks renders as plain text and warns `BLUME_UNKNOWN_CODE_LANGUAGE`: change it to a Shiki language, or `text` |
| `:emoji:` shortcodes | the character, with `--emoji`. GitHub slugged a heading's shortcode name, so a heading with one is reported: convert it and pin the old id (`## ⚠️ Known issues [#warning-known-issues]`) |
| `<a name="x"></a>` in a heading | deleted, with `[#x]` pinned on the heading (Blume would give the heading the id `x` anyway). Elsewhere it stays: links to `#x` work, and `blume validate` resolves them |
| task lists, tables, footnotes, strikethrough, autolinks, `<details>` | unchanged |
| `style=`, `<script>`, `<iframe>`, `<form>`, `<input>` | by hand: GitHub's sanitizer removed them, so readers never saw them, while Blume renders raw HTML as written. Delete them, or keep one deliberately and report it |

Heading ids need no pinning beyond the rows above: GitHub and Blume both slug with `github-slugger` (identical ids for all 710 headings on the wiki pages checked). The exception is a heading that ends in an emoji or symbol after a space: GitHub keeps the trailing dash (`## Features ✨` → `#features-`), Blume drops it (`#features`); `blume validate` reports the links to fix. Deleting a leading H1 can shift the `-1` suffix of a later heading with the same text; `blume validate` reports the links that break. `pin-heading-ids.mjs` can't read a wiki anyway: GitHub puts each id on a link beside the heading, not on the heading.

### MDX hazards

MDX rejects things GitHub's Markdown accepts, and a page renamed to `.mdx` fails `blume build` on them. In prose (outside code), `convert` fixes the mechanical ones in the pages it renames: a `<` that doesn't start a tag (`TypeScript >=1.6, <7` → `&lt;7`), bare `{` and `}` (escaped `\{`), HTML comments (`{/* */}` on one line), unclosed void tags (`<br>` → `<br />`), `<https://…>` autolinks, and indented code (MDX has none, so a top-level indented block gets a fence; a backslash-escaped backtick doesn't start inline code, so braces after it get escaped too). It reports the rest:

- **A tag-like word** (`Array<string>` outside code, `<placeholder>`): MDX reads it as an unclosed JSX element. Put it in backticks.
- **Raw HTML blocks** (`<details>`, `<div>`, `<table>`) with Markdown inside: MDX parses that Markdown only with blank lines around it, and fails on tags interleaved with list items. Add the blank lines, or turn the block into Markdown.
- **Indented code inside a list:** fence it by hand, at the list item's indentation.

### Other markup formats

Convert each non-Markdown page to Markdown before `convert` (which skips and lists them): `pandoc -f <format> -t gfm-raw_html --wrap=preserve page.<ext> -o page.md` (`mediawiki`, `textile`, `rst`, `org`, `creole`, `asciidoc`, `pod`). `.rdoc` has no pandoc reader: convert it by hand. Delete the original, point the page's entry in `wiki-files.json` at the new `.md` file, and rerun `convert`.

- **MediaWiki pages put the target first,** `[[Page Name|text]]`, as MediaWiki does. Pandoc turns them into `[text](Page_Name "text")`, with `_` for spaces, and `convert` maps those to routes.
- **In the other formats** pandoc escapes `[[…]]` to `\[\[…\]\]`, and `convert` reads those as Markdown wiki links (text first).
- Heading ids differ in these formats. Compare each converted page with the live one, and list every conversion in the report.

## Frontmatter

GitHub reads no frontmatter, so wiki pages have none. Each page gets `title`, plus `sidebar.label` and `slug` where the sections above say so. If a page opens with a `---` block anyway, check the live page for what readers saw, keep that as content or drop it, and report it.

## Images and files

- **Files stored in the wiki** (`https://raw.githubusercontent.com/wiki/<owner>/<repo>/<path>`, `https://github.com/<owner>/<repo>/wiki/<path>`, or a relative `<path>`, which resolves from the wiki root whatever the page's folder) go away with the wiki. `convert` moves each referenced one into `docs/` at the same path (`docs/images/x.png`) and points the page at it relatively (`../images/x.png` from a `(group)/` page): Blume optimizes and validates relative Markdown images.
- **A relative image that pointed at nothing** (it climbs out of the wiki root, like `../../screenshots/x.png`, or names a file the wiki doesn't have) was broken on GitHub too, and fails `blume build`: `convert` drops it and reports it.
- **Uploaded attachments** (`user-images.githubusercontent.com`, `github.com/user-attachments/assets/…`, `private-user-images.githubusercontent.com`) are served outside the wiki and keep working for a public repository. `convert` reports each one: download and vendor it next to the pages (one request at a time) unless the user objects. From a private or internal repository they need a GitHub login, so vendoring is required.
- **`https://github.com/<owner>/<repo>/blob/<ref>/<path>`** shown as an image is an HTML page anywhere but GitHub: `convert` uses `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>`.
- **Raw `<img>` alone on its line** becomes a Markdown image; its `width`/`height`/`align` drop and are reported. A raw `<img>` of a wiki file inside other HTML (a table cell, a `<p>`) is reported: its `src` still reads from the wiki root, which isn't the page's new folder. Copy the file into `docs/` at the same path, as `convert` does for the others, and point `src` at it relative to the page (`../images/x.png`), which Blume publishes with the page, unoptimized; or make it a Markdown image.
- **Linked files** (PDFs, archives, an image opened as a link) are reported: copy each into `docs/` at the same path and link it relative to the page, which publishes it with the page, or into `public/` and link its root path for a URL that never changes.
- `#gh-dark-mode-only` / `#gh-light-mode-only` pairs: keep the light image (report).
- Files nothing references stay in the wiki (other sites may hotlink them): report them, don't copy them.

## URLs and the old wiki

Every old URL is on github.com. GitHub has no redirect setting for wiki pages, and it sanitizes their HTML (no `<script>`, no `<meta>` refresh), so nothing on the old wiki can forward a reader. Don't add Blume `redirects` for them either: they would only match paths on the new site. The route table is the record instead: each old page name maps to its new route, a target URL, or `null`.

**Check the table against the build** after `blume build`: `node <skill>/scripts/github-wiki-codemod.mjs check` confirms every route in the table exists in `dist/` (`dist/client/` on a server build), anchors included. Given the old URLs instead (every line of a saved `_pages` list, for one), it prints each one's new route: `ok`, `moved` for a moved notice's outside target, `DROPPED` for a page set to `null`, or `MISSING` for a page the table lacks.

**What the user can do on the old wiki** (prepare it, but never commit or push it, even with push access: `stubs` only writes files, and whether and when anything goes to `<repo>.wiki.git` is the user's decision, after the new site is live):

1. **Restrict editing** (Settings → Features, under Wikis: **Restrict editing to collaborators only**) as soon as the migration starts, so the content stops drifting.
2. **Stop anything that syncs the wiki, before pushing anything to it.** Otherwise it reverts the stubs or copies them on. Look for a workflow triggered `on: gollum` (wiki edits) in the main repository, a mirror repository (`<repo>-wiki`) whose workflow pushes to `<repo>.wiki.git` on push or on a schedule, a copy of that workflow inside the wiki itself, and wiki-publishing actions. List every one you find.
3. **Point readers at the new site:** a notice at the top of `Home` and `_Sidebar.md` (the sidebar shows on every page). In a fresh clone of the wiki (not the Blume project: `stubs` refuses to run beside `blume.config.ts`), with `wiki-routes.json` and `wiki-files.json` copied in (don't commit them there): `node <skill>/scripts/github-wiki-codemod.mjs stubs --site https://docs.example.com --notice-only --write`.
4. **Or replace every page with a link stub,** so deep links from issues, search results, and bookmarks land one click from the new page: the same command without `--notice-only`. Each page keeps its file name, so its URL keeps working; `_Footer` files go, `_Sidebar.md` becomes the notice, images stay for sites that hotlink them, and pages set to `null` are listed for the user to decide. `--site` is the new site's URL with its base path, so regenerate the stubs once the real URL is known.
5. **Disable the wiki** (Settings → Features → Wikis), once the repository's own links point at the new site. GitHub hides every page, stubs included, without erasing them. It's the user's call; it's never required.

Whether search engines matter: `curl -sI https://github.com/<owner>/<repo>/wiki | grep -i x-robots-tag` prints `none` for a wiki GitHub keeps out of search results (GitHub indexes only wikis with 500+ stars and editing restricted to collaborators). Without it, search results keep sending readers to the old pages for a while, and the stubs are what they find.

**Inbound links in the main repository.** Search its clone with `git grep -n -i -E 'github\.com/<owner>/<repo>/wiki'`: README, CONTRIBUTING, `docs/`, `.github/ISSUE_TEMPLATE/`, `SECURITY.md`, code comments and test fixtures, `package.json` `homepage`. A large repository doesn't need a full clone: `git clone --depth 1 --filter=blob:none --sparse <url>`, then `git sparse-checkout set --no-cone '/*' '!/tests/baselines/'` (excluding its biggest generated folders). Map each URL through the table with `check`, which also verifies its anchor against the build and suggests ids for one that's gone:

```bash
node <skill>/scripts/github-wiki-codemod.mjs check https://github.com/<owner>/<repo>/wiki/FAQ#common-bugs
# MISSING ANCHOR  …/wiki/FAQ#common-bugs → /faq#common-bugs (ids like: common-bugs-that-arent-bugs)
```

An old link can carry an anchor that was already dead on GitHub: fix it to a real id, don't copy it. Rewrite each link with the new site's origin (or ask first, when the user only wants a report), and set the repository's About → Website to the new site if it pointed at the wiki. Links in issues, pull requests, and other repositories can't be rewritten: the stubs catch them. List the files you changed or would change.

### Leftover check

Rerun until it prints only code samples you mean to keep:

```bash
grep -rnE '\[\[|user-content-|(^|\s):[a-z0-9_+][a-z0-9_+-]*:(\s|$)' docs
grep -rniE 'raw\.githubusercontent\.com/wiki/|github\.com/<owner>/<repo>/wiki' docs   # any case of owner and repo
```

An alert left in a `.md` page warns `BLUME_MD_GITHUB_ALERT`, and an unknown fence language `BLUME_UNKNOWN_CODE_LANGUAGE`, so `blume build` lists those.

## Teardown

- **Files left behind.** Converting in place leaves the pages you didn't keep where they were: moved notices, `null` pages, the files GitHub never served, and unreferenced images. `convert` lists them. Delete them from the project (nothing under the root publishes, but they confuse later edits): the wiki keeps them, and `wiki-files.json` records their paths for the stubs. Delete `_Sidebar.md` and `_Footer.md` once `convert` has harvested them (a later `convert` then leaves the `meta.ts` files as they are).
- **Wiki tooling** (a `package.json` for a Markdown generator, link-rewriting scripts, sync scripts and workflows) stays only if it still applies to the pages: run each script in its dry or check mode against `docs/` and see whether any page still uses the syntax it converts. If none does, it goes, with the dependencies only it used. Say which you kept.
- **Lockfiles:** a mirror repository's `.gitignore` often ignores `package-lock.json` or `yarn.lock`. Remove those lines, so the lockfile SKILL.md step 6 regenerates gets committed.
- Keep `wiki-routes.json` and `wiki-files.json` beside `blume.config.ts` until the stubs are pushed and the inbound links are rewritten.
- Scaffold `package.json` (SKILL.md step 6) if the docs' new home has none.

## Dropped — report these

The Pages list and the clone box; footer text other than a copyright line, and its link; sidebar prose, images, anchor links, and duplicate entries; external sidebar links moved to `navigation.featured`; the per-page "edited … · N revisions" line; image sizes and wiki image options; images that were broken on GitHub; maps and 3D models; theme-aware image pairs; raw HTML GitHub had stripped; links to missing pages (GitHub's create-page links) and links that were already broken; shadowed link definitions; pages left out (mirror files, tests, fixtures, deprecated stubs) and moved notices mapped to their targets; pages GitHub never served (same-name shadows); non-Markdown pages converted with pandoc; wiki-UI links (history, revisions, `_pages`); and every old URL, which stays on github.com: say what you prepared for it (notice, stubs, or neither), which sync workflows must stop first, and that nothing redirects.
