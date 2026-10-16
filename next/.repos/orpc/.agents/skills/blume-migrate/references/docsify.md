# Docsify → Blume

Docsify has no build step. One `index.html` sets `window.$docsify = {…}`, loads Docsify and its plugins from a CDN, and renders each page's Markdown in the browser. Watch for five traps:

- **URLs live after a `#`** (`/#/guide/setup?id=install`). A server never sees that part, so `redirects` can't match an old URL. The site needs a client-side redirect script (URLs below).
- **Links resolve from the docs root**, not the page's folder, unless `relativePath: true`. Images and includes resolve from the page's folder either way, even with a leading `/`. Raw HTML `href`/`src` resolve from the docs root, because the document URL is always the folder holding `index.html`.
- **Pages have no frontmatter.** The title is usually the first `# H1`, but not always.
- **Navigation is a Markdown list** (`_sidebar.md`), and its groups usually sit flat in one folder.
- **Heading ids differ from Blume's**, and old deep links carry them as `?id=`.

**Fingerprint the version.** It changes callouts and heading ids. `docsify@4`, or any script URL with `/lib/` (even an unversioned `…/npm/docsify/lib/docsify.min.js`), runs v4 code: the v5 package still ships the v4 build under `lib/`. `docsify@5/dist/…` or `new Docsify({…})` is v5.

## Detect

- An **`index.html`** whose inline script sets **`window.$docsify`** (v5 can also use `new Docsify({…})`), usually in `docs/`. The folder holding it is the content root.
- `_sidebar.md`, `_navbar.md`, `_coverpage.md`, and `.nojekyll` beside it, with `README.md` as the home page.
- `docsify-cli` or `docsify` in `package.json`. Without either, the source has to be named: `npx blume migrate docsify`.
- A GitHub wiki has `_Sidebar.md` and `Home.md` but no `index.html`. It isn't Docsify.

**Where the Blume project goes.** Put `blume.config.ts` beside the `package.json` that runs `docsify serve <dir>` (usually the repo root), so the default `content.root: "docs"` matches. With no manifest, scaffold one there.

Read the whole `index.html`: the `$docsify` object (it can be a function), every `<script src>` (each is a plugin), the `<head>`, and the `<body>`. Open a few routes on the live site too. **A page whose include target is missing rendered blank in Docsify 4**, so some "pages" never worked.

## Run the codemod first

On the Docsify folder, from the directory that will hold `blume.config.ts`, dry-run the bundled codemod, then apply it once, before any hand edits:

```bash
curl -s https://api.github.com/emojis > emojis.json   # only if pages use :shortcodes:
node <skill>/scripts/docsify-codemod.mjs docs
node <skill>/scripts/docsify-codemod.mjs --write --snapshot .docsify-old \
  --group-folders --emoji emojis.json --site https://docs.example.com docs
```

It's zero-dependency and idempotent, and reads `version`, `relativePath`, `routerMode`, `noEmoji`, `homepage`, `loadSidebar`, `loadNavbar`, and `coverpage` from `index.html` (override with `--version` and `--relative-path`). It converts:

- `!>` → `:::warning`, `?>` → `:::tip`, and `> [!TYPE]` alerts → directives, leaving fenced and indented code alone;
- docsify-tabs → `<Tabs>`;
- `':include'` lines → `<include>`, resolved from the page's folder as Docsify did, even with a leading `/`. A `:fragment=` is copied to its own file where Docsify cut one: code includes, plus Markdown ones in v5. Docsify 4 showed a Markdown include whole, so it stays whole;
- `:id=` → `[#id]`, `{docsify-ignore}` → `[!toc]`, and setext headings → ATX;
- links resolved the way Docsify resolved them (hash links, `?id=`, and `--site` absolute links included) → relative file links, without an anchor that named the target's title H1 (that heading becomes `title`);
- images → rebased for moved pages. Docsify read a leading-slash image from the page's folder too, where Blume would read it from `public/`;
- link and image attribute strings → dropped;
- relative raw HTML URLs and `':ignore'` links → root paths. An `':ignore'` link to a page's own file opened the raw Markdown, so it becomes a raw `<a href>` to the page's Markdown copy (`/<new route>.md`): a Markdown link naming a page's file, even root-relative, lands on the page itself;
- emoji shortcodes → Unicode;
- the H1 or sidebar label → `title`, plus `sidebar.label`, `seo.title`, and `hidden: true`, with later H1s demoted;
- `README.md` → `index.md`, and pages that need MDX → `.mdx` with MDX-safe comments, `<br>`, void tags, and autolinks.

`--group-folders` moves each page into a folder per sidebar group, writes each folder's `meta.ts` in sidebar order plus a root `meta.ts` that keeps the groups in sidebar order, and writes the old → new route table to `docsify-routes.json`. Leave the flag off to keep the files where they are. With `homepage: "intro.md"`, the table also maps `/intro` → `/`, since Docsify served that page at both.

`--snapshot` records every page's headings with the ids Docsify gave them, plus `old-routes.txt`. The pin step (URLs below) needs it, and it only works on the first run, while the pages are untouched. On Zenroom it matched Docsify 4.13.1's rendered ids on every page that rendered.

**Every `REVIEW` line is a to-do**, and the sections below say what to do with each. The codemod never invents a fix: a missing include stays as written, and a file that must move to `public/` is only listed.

## Config: `window.$docsify` → `blume.config.ts`

| Docsify | Blume |
| --- | --- |
| `name` (may hold HTML) | `title`, as plain text. The `<title>` and `<meta name="description">` in `index.html` give `title` (when `name` is unset) and `description` |
| `logo` | `logo`, with the file moved to `public/`. Docsify shows the logo instead of the name, so a wordmark needs `logo: { image, text: "" }`. Check it in dark mode |
| `nameLink` | `logo.href` |
| `repo` | `github: { owner, repo }` (with `branch` from an edit-on-github URL). A non-GitHub repo goes in `navigation.actions` |
| `themeColor` (v4), `--theme-color` in a stylesheet (v5) | `theme.accent` |
| A dark-only theme (`dark.css`, a themeable `*-dark.css`) | `theme.mode: "dark"`. Other themes map to nothing |
| Fonts in the stylesheet or `<link>`s | `theme.fonts` |
| `<link rel="icon">` | Copy the file to `public/favicon.<ext>` |
| `<meta>` verification tags | `seo.metatags`. `twitter:site` goes to `seo.x.handle`. Drop `og:*` and `twitter:` card tags, since Blume writes them |
| Custom CSS | A root `theme.css` with only the rules whose markup still exists. Docsify selectors (`.markdown-section`, `.sidebar`, `.cover`) match nothing |
| Site URL (`CNAME`, a sitemap) | `deployment.site`. GitHub Pages isn't auto-detected |
| `subMaxLevel: N` | `toc: { maxHeadingLevel: N }` when N ≥ 2 and isn't 3. Drop `maxLevel` |
| `homepage: "x.md"` | Handled by the codemod. A remote URL needs vendoring |
| `alias` | Local-to-local entries go in the route table. Remote targets: see Includes and aliases. Drop sidebar plumbing (`'/.*/_sidebar.md'`) and any alias whose target doesn't exist |
| `externalLinkTarget: '_blank'` (explicit) | `markdown: { externalLinks: true }`. Docsify opens external links in a new tab even when this is unset, so report the change |
| `notFoundPage` / `_404.md` | Blume's 404 page, or a custom `pages/404.astro` |
| `formatUpdated`, `{docsify-updated}`, a last-modified plugin | `lastModified: "git"` (and `fetch-depth: 0` in CI) |
| `collapsibleSidebarGroups` (v5) | `navigation.sidebar.display: "group"`, plus `collapsed: false` in each `meta.ts` that should start open |
| `vueComponents`, `vueMounts`, `vueGlobalOptions`, `executeScript` | An island per widget (`islands/Name.vue`, `docs/content/islands.mdx`). Report |
| `markdown` (marked options or a `renderer`) | Drop, and report what the renderer did. Common ones are mermaid (now native) and a `json` pretty-printer: minified JSON includes now render as one line, so fix that in whatever generates them. `breaks: true` has no equivalent |
| `routes` (virtual routes) | Static ones become pages. Report dynamic ones |
| `auto2top`, `topMargin`, `maxLevel`, `cornerExternalLinkTarget`, `requestHeaders`, `noCompileLinks`, `sidebarPosition`, `keyBindings`, `skipLink`, the search and pagination options, … | Drop |

**Plugins** are `<script>` tags:

- **Built in:** search, `docsify-copy-code`, `docsify-pagination`, and `zoom-image`. Delete them.
- **Converted by the codemod:** emoji, `docsify-tabs`, and flexible-alerts.
- **Prism language packs:** delete them. Shiki highlights the common languages in any case (` ```JSON ` works), and a fence in a language it doesn't know, or a misspelled one, renders as plain text and warns `BLUME_UNKNOWN_CODE_LANGUAGE`: fix the name, or write `text`.
- **Mermaid** plugins or renderers → native ` ```mermaid ` in `.mdx`.
- **KaTeX** → `$$…$$` in `.mdx`, with inline `$…$` becoming `$$…$$` inside its sentence.
- **`ga` / `gtag`** → `googleAnalytics({ id })` for a `G-` id. A `UA-` id no longer collects data, so report it. Other analytics → `script()`.
- **Comments** (Disqus, Gitalk, giscus) → nothing built in. Use a `PageFooter` slot, or report them.
- **Anything else** (bibtex, remote-markdown, demo boxes, custom inline plugins) → report.

## Navigation: `_sidebar.md` → folders and `meta.ts`

- **Groups over pages in one flat folder** (everything in `docs/` or `docs/pages/`) flatten silently. Use `--group-folders`: it moves each group's pages into a folder and writes `meta.ts` and the route table, and the hash script maps every old route. This departs from SKILL.md's `(group)/`-first rule: every Docsify URL changes form anyway (`/#/x` → `/x`), so the script runs for each old link either way, and the codemod rebases the moved pages' links and images. To keep URLs instead, move pages at the content root into `(group)/` folders, which add no URL segment; under a subfolder like `pages/`, they keep `/pages/x` but nest every group under a "Pages" group. Or keep the files and write an explicit `navigation.sidebar`.
- **Groups whose pages already sit in a folder named for the group** (`Guide` → `guide/`) stay put, and `--group-folders` writes that folder's `meta.ts`. It moves the pages of a group whose folder has another name into one named for the group, so on a site already laid out in folders, leave the flag off and write each `meta.ts` by hand, with the group label and the sidebar's order.
- **The home page** stays the root `index`. The generated sidebar lists it first, never inside a group.
- **Loose pages listed after groups** can't keep that order, because Blume lists loose pages first. Move them into a folder, or report the change.
- **External links, and links to files** like a PDF or HTML in `public/`, become `navigation.featured`. A file link there warns at build ("no page matches it"); the warning is harmless.
- **A `_sidebar.md` inside a folder** replaced the sidebar under that folder. Map the folder to a `navigation.tabs` entry.
- **Pages the sidebar doesn't list** get `hidden: true` from the codemod. They stay reachable, as before.
- **Sidebar link titles** (`[x](x.md "Tab title")`) become `seo.title`. Report any that look copy-pasted from another page: Docsify showed them as the browser tab title.

## Navbar and cover page

- **`_navbar.md`:** doc-section links become `navigation.tabs` (a nested list becomes a tab with `items`), and other links become `navigation.actions`. With `mergeNavbar: true`, put the other links in `navigation.featured` instead, not in both: featured shows on every screen size, while actions hide on phones. Language links (`/zh-cn/`) become `i18n`.
- **`_coverpage.md`** (shown above `README.md` on `/`; the whole home page with `onlyCover: true`): rebuild it as the top of `index.md`. The `# name <small>1.2</small>` heading is already the title. The tagline is prose or `description`, the logo is a Markdown image, and the buttons become links or `<Card>`s. Drop the background image or `![color](#…)`, and report it. Use `mode: center` when the cover was the whole page.

## Content: what the codemod leaves to you

**Titles.** Docsify drops only the first H1 from its sidebar headings, so pages often have several. The codemod takes a leading H1 as the title and demotes every later heading from the second H1 on. When content comes before the first H1, it takes the sidebar label as the title and demotes everything. Check every title it flags: about one page in five on Zenroom started with a section ("Key generation", "Intro"). For those, use the sidebar label as the title, put the H1 back as an `##` section, and demote every heading.

**MDX hazards** in a renamed page. The codemod lists each one, and all but the first fail the build:

- An indented code block renders as a plain paragraph: fence it.
- An HTML table whose cell tags share a line with text: give each `<tr>`/`<td>` its own line.
- A block element inside `<p>`, typical of README banners: make the `<p>` a `<div>`.
- A repeated attribute: keep one.
- A brace in prose: escape it as `\{`.

**Includes and aliases.**

- **A missing include target:** the page was blank on the old site. Repoint the include to the file's new name (a folder was usually renamed), or drop it, and report it.
- **A fragment copied from a generated file** goes stale. Have the generator write one file per fragment.
- **An included file's own H1** becomes a second `<h1>`: remove it.
- **An alias to a raw URL of a file in the same repo** (`'/CHANGELOG': 'https://raw.githubusercontent.com/<owner>/<repo>/main/CHANGELOG.md'`) becomes a page that `<include>`s the file through a symlink in `_snippets/`. Removing that file's H1 changes a file people read on GitHub, so say so.
- **Other remote aliases and includes:** vendor a copy (with a source comment), or use `mdxRemote()`.
- **iframe, video, and audio embeds** become raw HTML, with the file in `public/`.

**Files the pages link** (listed under "must be served from public/"): Docsify served every file in its folder at its path. Blume publishes a file a page links relatively with that page, but at a new URL, and the codemod writes Docsify's root-resolved links as root paths, which keep the old URLs and are served from `public/`.

- Copy each file into `public/` at the same path.
- If a generator writes the files (test fixtures, examples), symlink the folder instead: `public/_media/examples → ../docs/examples`. Astro copies the target, and `validate` checks the links.
- An HTML document saved as `.md` (generated API docs) goes to `public/` as HTML.
- `blume validate --strict` reports a missing one as `BLUME_BROKEN_ASSET`.

**Everything else:**

- **Link attributes** the codemod dropped (`:target`, `:size`, `:no-zoom`, `:class`): restore any that matter as raw HTML (`<img src="/x.png" width="200" data-no-zoom />`, with the file in `public/`).
- **Emoji shortcodes left over:** paste the emoji.
- **Page `<script>`s:** Docsify 4 ran them only with `executeScript` or Vue, so they often never ran. Move one that did into an island.
- **Vendored READMEs** keep Blume's ids (they had GitHub-style ids already), and they aren't in the snapshot.

## URLs and redirects

**Hash mode (the default).** Every page lived at `/#/<route>`, also reachable as `/#/<route>.md` and `/index.html#/<route>`, with folder indexes at `#/<folder>/` and headings at `?id=<id>`. The server only saw `/`.

**A. Blume takes over the old address** (the usual case). `docsify-routes.json` holds the page moves the codemod made. Add an entry for each alias you turned into a page. Routes that now land on a file in `public/` go in a separate `files` map that only the script reads: a redirect page would sit where the file is. Name a `public/` folder with its slash (`/api/`) or name the file itself (`/api/index.html`): static hosts, `blume dev`, and `blume preview` serve its `index.html` at `/api/` (and redirect `/api` there), where its relative links resolve.

```ts blume.config.ts
import { defineConfig } from "blume";

import moved from "./docsify-routes.json" with { type: "json" };

// Old routes that now land on a file in public/: the script sends readers
// there, but a redirect can't, so they stay out of `redirects`.
const files = {}; // e.g. { "/onepage": "/onepage.md" }

// Docsify served every page at /#/<route>; a server never sees the hash.
// Swap an old hash URL for its new route, and ?id=<heading> for #<heading>.
const base = ""; // the site's deployment.base plus basePath, if it has either
const docsifyRedirects = `(() => {
  const base = ${JSON.stringify(base)};
  const routes = ${JSON.stringify({ ...moved, ...files })};
  const go = () => {
    const hash = location.hash;
    if (!hash.startsWith("#/")) return;
    const q = hash.indexOf("?");
    let path = q === -1 ? hash.slice(1) : hash.slice(1, q);
    const id = q === -1 ? null : new URLSearchParams(hash.slice(q + 1)).get("id");
    try { path = decodeURI(new URL(path, "http://x").pathname); } catch {}
    path = path.replace(/\\.md$/i, "").replace(/(^|\\/)README$/i, "$1");
    if (path.length > 1) path = path.replace(/\\/+$/, "");
    // location.origin keeps a crafted #//other.host/ link on this site.
    location.replace(location.origin + base + (routes[path] ?? path) + (id ? "#" + id : ""));
  };
  go();
  addEventListener("hashchange", go);
})();`;

export default defineConfig({
  redirects: Object.entries(moved).map(([from, to]) => ({ from, to })),
  integrations: [
    {
      name: "docsify-hash-redirects",
      hooks: {
        "astro:config:setup": ({ injectScript }) => {
          injectScript("head-inline", docsifyRedirects);
        },
      },
    },
  ],
});
```

The script runs from every page's `<head>`, the 404 page included, before the body loads, in `blume dev` and in every build. Keep its two safeguards: `new URL(…).pathname` resolves the `./` and `../` segments Docsify left in links (`#/./guide`), and `location.origin` stops a crafted `#//other.host/` from sending readers off the site. Unmoved routes need no entry. The `redirects` also cover direct visits to a moved path and its `/old.md` Markdown twin. Don't use the `script()` analytics adapter for this: it's emitted in production builds only, and held until consent when `consent` is set.

**B. The old site keeps its own address** (an old GitHub Pages URL, while the docs move to a new domain). Replace the old `index.html` with a page running the same parsing, with the new origin in place of `location.origin`, and a `<noscript><meta http-equiv="refresh" content="0; url=https://new.example/"></noscript>` fallback.

**History mode** (`routerMode: 'history'`). URLs were real paths, so the route table and `redirects` carry moved pages. Anchors were still `?id=`, so add this after `go();`:

```js
if (!location.hash) {
  const id = new URLSearchParams(location.search).get("id");
  if (id) location.replace(location.pathname + "#" + id);
}
```

**Keep old heading anchors.** Docsify 4 leaks entity names into ids (`Foo & Bar` → `foo-amp-bar`, `Don't` → `don39t`), collapses dash runs, keeps emoji and shortcode names, and prefixes a leading digit with `_`. Docsify 5 is closer to Blume, but still differs in that prefix, in non-ASCII capitals, and where a heading has emphasis (`_When_` stays in the id) or a shortcode. After the first build, pin each old id where it differs, and rebuild until it reports 0:

```bash
node <skill>/scripts/pin-heading-ids.mjs --old .docsify-old --map docsify-routes.json --write
```

On Zenroom, one pass kept every old id except those of title H1s (58 of 968), and a link to one of those lands at the top of the page anyway. A page that never rendered on the old site (a missing include) has nothing to pin.

**Check every old route** against `blume preview`. In `.docsify-old/old-routes.txt`, a folder route is listed without its slash, but Docsify served it only with one. Both forms reach the script.

```bash
node -e '
const routes = { ...require("./docsify-routes.json") };   // add the files map too
const old = require("fs").readFileSync(".docsify-old/old-routes.txt", "utf8").split("\n").filter(Boolean);
(async () => { for (const r of old) {
  const res = await fetch("http://localhost:4321" + (routes[r] ?? r));
  if (res.status !== 200) console.log(res.status, r);
} })();'
```

Then open a few old hash URLs, with and without `?id=`, in a browser on the deployed site. A plain `curl` can't test the hash script.

**GitHub Pages**, where most Docsify sites live:

- Switch the Pages source from the branch folder to GitHub Actions, using the workflow in https://useblume.dev/guides/markdown-docs-github-pages (with `fetch-depth: 0` for `lastModified: "git"`).
- Pages has no redirect rules of its own. A static build writes each exact `redirects` entry as a page that forwards to the new URL, which is all the table holds; a pattern redirect wouldn't work there.
- A project URL (`user.github.io/repo/`) becomes `deployment: { site: "https://user.github.io", base: "/repo" }`, and that base goes in the script too. Blume adds the base to root paths in Markdown and raw HTML alike, so the codemod's root paths need nothing more.
- The custom domain stays in the Pages settings. Neither `CNAME` nor `.nojekyll` is needed.
- The workflow's `npm ci` needs a lockfile, so commit one.

## Teardown

After harvesting what they declare, delete:

- `index.html`;
- `_sidebar.md`, `_navbar.md`, `_coverpage.md`, and `_404.md` (Blume ignores `_` files meanwhile), or the files `loadSidebar`, `loadNavbar`, and `coverpage` name instead. Without the `_`, Blume publishes them as pages until they're gone;
- `.nojekyll`, the theme CSS, and generators that read the sidebar or Docsify syntax (sitemaps, one-page builds).

Swap `docsify-cli`/`docsify` for `blume` and `docsify serve` for `blume dev`/`blume build`/`blume preview`. Keep `docsify-routes.json` and `.docsify-old/` until the pins are done and old links stop mattering.

## Dropped — report these

- The cover's background and the navbar's language links (now `i18n`).
- The home page's place in a sidebar group, and loose pages after groups.
- Link and image attributes you didn't restore.
- Fragments now frozen as copies.
- Vendored or `mdxRemote()` aliases.
- Pages that were blank on the old site (missing includes) and what you did with each.
- Title H1 anchors (they land at the page top).
- Comment plugins, a `UA-` analytics id, Vue widgets, and page scripts.
- Custom `markdown` renderers (JSON pretty-printing included) and `breaks: true`.
- Dynamic virtual `routes`.
- Theme CSS with no Blume target, and copy-pasted sidebar link titles now in `seo.title`.
- New-tab external links, unless you set `markdown.externalLinks`.
