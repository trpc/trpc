#!/usr/bin/env node
// mkdocs-codemod.mjs — deterministic, idempotent content codemod for the
// MkDocs / Material for MkDocs / Zensical → Blume migration. Run it on the
// content root (MkDocs' `docs_dir`), from the directory that holds mkdocs.yml,
// before any hand edits. Per page it:
//
//   - converts Python-Markdown block syntax: `!!!` admonitions → `:::`
//     directives, `???`/`???+` → <Expandable>, `===` content tabs →
//     <CodeGroup> (every tab one code block) or <Tabs>/<Tab> — indentation
//     aware and recursive (tabs in admonitions in list items), with a longer
//     outer `::::` fence around nested callouts;
//   - turns `--8<--` snippets into <include>: paths resolve from the snippets
//     `base_path` (default: where MkDocs runs, taken as the directory that
//     holds mkdocs.yml), not from the page; a snippet outside the content root
//     is copied into `_snippets/`; a code block holding only a snippet line
//     becomes a code include; an include indented inside a list item makes
//     the page `.mdx`, the only format that splices it there;
//   - rewrites code fences (`hl_lines` → `{…}`, `linenums` → `lineNumbers`,
//     `{ .py title="…" }` → `py title="…"`, Pygments-only languages, options
//     without a language → `text`) and `#!lang` inline code → `{:lang}`;
//   - pins heading ids (`{ #id }`, `{: #id }`, `{#id}` → `[#id]`), drops other
//     attribute lists, and converts keys (`++ctrl+c++` → <kbd>), `==mark==`,
//     `^^ins^^`, abbreviation lines, `[TOC]`, `\(x\)` math, and Material icon
//     shortcodes (→ <Icon> with a Lucide name);
//   - moves the body H1 (ATX or setext) into frontmatter `title` (inline
//     Markdown stripped), a `nav` title that differs into `sidebar.label`, a
//     frontmatter title that differs into `seo.title`, and maps Material keys
//     (`hide`, `status`, `tags`, `icon`, …);
//   - renames a page to `.mdx` ONLY when it now uses an MDX-only feature (or
//     includes a partial that does); on those pages HTML comments become
//     `{/* … */}` on one line (Prettier mangles multi-line MDX comments),
//     `<https://…>` autolinks become links, and void tags self-close;
//   - renames `README.md` to `index.md` when the folder has no index page, and
//     rewrites relative links and `<include>`s to every renamed file (Blume
//     resolves a file link only when it names the file that exists).
//
// A `zensical.toml` with no extensions configured gets Zensical's default set.
//
// It reports — and never fakes — what needs judgment: mkdocstrings `:::`
// blocks, macros/Jinja, template overrides, hooks, plugins, snippet line
// ranges, `///` blocks, grid cards, code annotations, unknown icons, raw
// `<img>`s with relative paths, pages left without a title, snippets that are
// pages too, and every MDX hazard left in a renamed page.
//
// Design constraints (as mintlify-codemod.mjs): zero dependencies, sorted and
// deterministic, idempotent (a second run changes nothing), dry run by default.
//
// Usage:
//   node mkdocs-codemod.mjs [--config <mkdocs.yml>] <content-dir>          # dry run
//   node mkdocs-codemod.mjs --write [--config <mkdocs.yml>] <content-dir>  # apply
//   node mkdocs-codemod.mjs --json … <content-dir>                         # JSON report
//
// Without --config it looks for mkdocs.yml, mkdocs.yaml, zensical.toml,
// properdocs.yml, or properdocs.yaml in the current directory, then beside the
// content dir. With no config at all, every extension's syntax is converted
// except the ones that could misread plain Markdown (math, mark, caret, keys),
// and snippets resolve from the current directory.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

// --- Tables -------------------------------------------------------------------

// Material 9.7 styles 12 admonition types; every other name renders like
// `note`. Blume's callouts: note, tip, warning, danger, info, success.
const ADMONITION_TYPES = {
  abstract: "info",
  attention: "warning",
  bug: "danger",
  caution: "warning",
  check: "success",
  danger: "danger",
  done: "success",
  error: "danger",
  example: "note",
  fail: "danger",
  failure: "danger",
  faq: "info",
  help: "info",
  hint: "tip",
  important: "note",
  info: "info",
  missing: "danger",
  note: "note",
  question: "info",
  success: "success",
  summary: "info",
  tip: "tip",
  tldr: "info",
  todo: "note",
  warning: "warning",
};

// Pygments-only (or differently spelled) fence languages → Shiki ids.
const LANGS = {
  cfg: "ini",
  "console-session": "console",
  ps1con: "powershell",
  "pwsh-session": "powershell",
  py3: "python",
  pycon: "python",
  python3: "python",
  "sh-session": "shellsession",
  "shell-session": "shellsession",
};

// Material icon shortcodes (and frontmatter icon paths, `/` → `-`) → Lucide.
// `null` drops a purely decorative icon.
const ICONS = {
  "fontawesome-brands-github": "github",
  "fontawesome-solid-check": "check",
  "fontawesome-solid-xmark": "x",
  "material-account": "user",
  "material-account-group": "users",
  "material-alert": "triangle-alert",
  "material-alert-circle": "circle-alert",
  "material-alert-octagon": "octagon-alert",
  "material-alert-outline": "triangle-alert",
  "material-apple": "apple",
  "material-arrow-right": "arrow-right",
  "material-bell": "bell",
  "material-book": "book",
  "material-book-open-variant": "book-open",
  "material-bug": "bug",
  "material-calendar": "calendar",
  "material-check": "check",
  "material-check-all": "check-check",
  "material-check-bold": "check",
  "material-check-circle": "circle-check",
  "material-clock": "clock",
  "material-clock-outline": "clock",
  "material-close": "x",
  "material-close-circle": "circle-x",
  "material-cloud": "cloud",
  "material-code-braces": "braces",
  "material-cog": "settings",
  "material-console": "terminal",
  "material-content-copy": "copy",
  "material-database": "database",
  "material-delete": "trash-2",
  "material-download": "download",
  "material-earth": "earth",
  "material-email": "mail",
  "material-eye": "eye",
  "material-file-document": "file-text",
  "material-file-document-outline": "file-text",
  "material-flask": "flask-conical",
  "material-folder": "folder",
  "material-format-list-bulleted": "list",
  "material-github": "github",
  "material-hammer": "hammer",
  "material-heart": "heart",
  "material-help-circle": "circle-help",
  "material-image": "image",
  "material-information": "info",
  "material-information-outline": "info",
  "material-key": "key",
  "material-lightbulb": "lightbulb",
  "material-lightning-bolt": "zap",
  "material-link": "link",
  "material-lock": "lock",
  "material-magnify": "search",
  "material-minus": "minus",
  "material-open-in-new": null,
  "material-package-variant": "package",
  "material-pencil": "pencil",
  "material-play": "play",
  "material-plus": "plus",
  "material-puzzle": "puzzle",
  "material-refresh": "refresh-cw",
  "material-rocket-launch": "rocket",
  "material-server": "server",
  "material-shield": "shield",
  "material-star": "star",
  "material-tag": "tag",
  "material-tag-outline": "tag",
  "material-timer": "timer",
  "material-timer-sand": "hourglass",
  "material-web": "globe",
  "material-wrench": "wrench",
  "octicons-copy-16": "copy",
  "octicons-link-external-16": null,
  "octicons-link-external-24": null,
};

// pymdownx.keys names → labels; anything else is title-cased.
const KEY_LABELS = {
  alt: "Alt",
  backspace: "Backspace",
  cmd: "Cmd",
  command: "Cmd",
  ctrl: "Ctrl",
  del: "Del",
  delete: "Delete",
  down: "↓",
  enter: "Enter",
  esc: "Esc",
  escape: "Esc",
  left: "←",
  meta: "Meta",
  option: "Option",
  return: "Return",
  right: "→",
  shift: "Shift",
  space: "Space",
  tab: "Tab",
  up: "↑",
  win: "Win",
  windows: "Win",
};

// Top-level page frontmatter keys Blume's strict schema accepts.
const BLUME_KEYS = new Set([
  "ai",
  "api",
  "authMethod",
  "authors",
  "changelog",
  "date",
  "deprecated",
  "description",
  "draft",
  "hidden",
  "icon",
  "lastModified",
  "mode",
  "narration",
  "noindex",
  "pagination",
  "playground",
  "related",
  "search",
  "seo",
  "sidebar",
  "slug",
  "title",
  "type",
]);

// Material/MkDocs page keys with no Blume counterpart: dropped and reported.
const DROP_KEYS = [
  "comments",
  "render_macros",
  "social",
  "subtitle",
  "template",
];

// Parts of Python-Markdown's `extra` (and pymdownx.extra).
const EXTRA_PARTS = new Set([
  "abbr",
  "attr_list",
  "def_list",
  "footnotes",
  "md_in_html",
  "tables",
]);

// What to do with each plugin; anything unlisted is reported as unknown.
const PLUGIN_HINTS = {
  "awesome-nav": "manual: convert each .nav.yml to a meta.ts",
  "awesome-pages": "manual: convert each .pages file to a meta.ts",
  blog: "manual: posts become type: blog pages (see the reference's Blog section)",
  exclude: "map to content.exclude",
  "gen-files":
    "manual: generated pages — keep the generator, point it at the content root",
  "git-authors": "drop (no equivalent)",
  "git-committers": "drop (no equivalent)",
  "git-revision-date": 'lastModified: "git"',
  "git-revision-date-localized": 'lastModified: "git"',
  glightbox: "built in (image zoom) — delete",
  i18n: "manual: i18n (see the reference)",
  "include-markdown": "manual: {% include %} → <include> (see Snippets)",
  "literate-nav": "manual: SUMMARY.md is the nav — convert to folders/meta.ts",
  llmstxt: "built in — markdown_description → agents.llmsTxt.details",
  macros:
    "manual: plain values → variables; macro calls and Jinja logic by hand",
  meta: "manual: apply each .meta.yml to its pages' frontmatter",
  mike: "manual: versioning (see the reference)",
  minify: "drop",
  "mkdocs-jupyter": "manual: notebooks have no Blume renderer",
  mkdocstrings: "manual: no Python API generator in Blume",
  offline: "drop",
  optimize: "drop (Blume optimizes relative images)",
  privacy: "drop",
  redirects: "map redirect_maps to redirects (Markdown paths → routes)",
  rss: "built in for type: blog pages at /blog/rss.xml",
  search: "built in — delete",
  "section-index": "built in (folder index pages)",
  social: "built in (Open Graph images) — delete",
  "static-i18n": "manual: i18n (see the reference)",
  tags: "tags → search.tags (the codemod moves the frontmatter); tag index pages drop",
  typeset: "drop",
};

// HTML elements MDX accepts as written; anything else lowercase is a hazard.
const KNOWN_TAGS = new Set(
  "a abbr b blockquote br center code dd del details div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i iframe img input ins kbd li mark ol p picture pre s section small source span strong sub summary sup table tbody td th thead tr u ul video".split(
    " "
  )
);

const CONFIG_NAMES = [
  "mkdocs.yml",
  "mkdocs.yaml",
  "zensical.toml",
  "properdocs.yml",
  "properdocs.yaml",
];

const SKIP_DIRS = new Set([".blume", ".git", "dist", "node_modules"]);

// --- Patterns -----------------------------------------------------------------

const FENCE_OPEN = /^(?<indent> *)(?<marker>`{3,}|~{3,})(?<info>.*)$/u;
const FENCE_CLOSE = /^ *(?<marker>`{3,}|~{3,}) *$/u;
// As Python-Markdown and pymdownx.details read them: at most one space after
// the marker (`!!!note` is valid), a type for `!!!`, a type or a title for
// `???`, and only a double-quoted title.
const ADMONITION =
  /^(?<indent> *)(?<kind>!!!|\?\?\?\+?) ?(?<words>[\w-]+(?: +[\w-]+)*?)?(?: +"(?<title>.*)")? *$/u;
const TAB = /^(?<indent> *)===(?<flags>[+!]*) +"(?<label>.*)" *$/u;
// pymdownx.snippets: nothing may follow the closing quote or the block marker.
const SNIPPET_LINE =
  /^(?<indent>[\t ]*)(?<escape>;*)-+8<-+[\t ]+(?<q>["'])(?<target>.+?)\k<q>$/u;
const SNIPPET_BLOCK = /^(?<indent>[\t ]*)-+8<-+$/u;
const SNIPPET_SUFFIX =
  /^(?<file>.*?)(?<suffix>(?::-?\d*){1,2}(?:,-?\d*(?::-?\d*)?)*|:[a-z][\w-]*)?$/iu;
const CODE_SPAN = /(?<code>`+[^`]*`+)/u;
const ATTR_TOKEN = String.raw`(?:[#.][\w-]+|[\w-]+=(?:"[^"]*"|'[^']*'|[^\s}]+))`;
const INLINE_ATTRS = new RegExp(
  String.raw`(?<target>\]\([^)]*\)|\]\[[^\]]*\]|${"`"})\{:? *(?<attrs>${ATTR_TOKEN}(?: +${ATTR_TOKEN})*) *\}`,
  "gu"
);
const TRAILING_ATTRS = / *\{:? *[#.][\w-]+(?: +[#.][\w-]+)* *\}\s*$/u;
const HEADING_ATTRS =
  /^(?<text>#{1,6} .*?) *(?<!\\)\{:? *(?<attrs>[^}]*)\}\s*$/u;
const KEYS =
  /\+\+(?<keys>(?:[a-z0-9-]+|"[^"]*")(?:\+(?:[a-z0-9-]+|"[^"]*"))*)\+\+/giu;
const ICON_SHORTCODE =
  /:(?<name>(?:material|fontawesome|octicons|simple)-[a-z0-9-]+):(?:\{[^}]*\})?/gu;
const MD_LINK =
  /(?<lead>\]\(|^ *\[[^\]]+\]: +)(?<target>(?![a-z][\w+.-]*:|#|\/)[^)\s#]+\.(?:md|markdown))(?<hash>#[^)\s]*)?/giu;
const MULTIMARKDOWN_META =
  /^(?:title|description|template|authors?|date|summary|tags|hide|icon|status): \S/iu;

// --- Small helpers ------------------------------------------------------------

const expandTabs = (line) =>
  line.replace(/^[\t ]+/u, (lead) => {
    let col = 0;
    for (const ch of lead) {
      col = ch === "\t" ? col + 4 - (col % 4) : col + 1;
    }
    return " ".repeat(col);
  });
const indentOf = (line) => /^ */u.exec(expandTabs(line))[0].length;
const isBlank = (line) => line.trim() === "";
const toPosix = (p) => p.split(path.sep).join("/");
const capitalize = (word) => word.charAt(0).toUpperCase() + word.slice(1);
const unquote = (value) =>
  value.trim().replace(/^(?<q>["'])(?<inner>.*)\k<q>$/u, "$<inner>");
const maskCode = (line) =>
  line.replaceAll(/`+[^`]*`+/gu, (span) => " ".repeat(span.length));

const isFenceClose = (line, open) => {
  const m = FENCE_CLOSE.exec(line);
  return Boolean(
    m && m.groups.marker[0] === open[0] && m.groups.marker.length >= open.length
  );
};

/** End (exclusive) of the fenced block that opens at `lines[start]`. */
const fenceEnd = (lines, start) => {
  const open = FENCE_OPEN.exec(lines[start]).groups.marker;
  for (let j = start + 1; j < lines.length; j += 1) {
    if (isFenceClose(lines[j], open)) {
      return j + 1;
    }
  }
  return lines.length;
};

/** Lines after `start` that are blank or indented ≥ `min`, dedented. */
const collectBody = (lines, start, min) => {
  let j = start;
  let last = start - 1;
  while (j < lines.length) {
    if (!isBlank(lines[j])) {
      if (indentOf(lines[j]) < min) {
        break;
      }
      last = j;
    }
    j += 1;
  }
  const body = lines
    .slice(start, last + 1)
    .map((l) => (isBlank(l) ? "" : expandTabs(l).slice(min)));
  return [body, last + 1];
};

const trimBlankEdges = (body) => {
  let a = 0;
  let b = body.length;
  while (a < b && isBlank(body[a])) {
    a += 1;
  }
  while (b > a && isBlank(body[b - 1])) {
    b -= 1;
  }
  return body.slice(a, b);
};

const prefix = (indent, lines) =>
  lines.map((l) => (l === "" ? "" : " ".repeat(indent) + l));

/** Apply `fn` to the prose of a line, leaving inline code spans alone. */
const mapProse = (line, fn) =>
  line
    .split(CODE_SPAN)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join("");

/** Apply `fn` to each line outside fenced code. */
const mapFenced = (lines, fn) => {
  let fence = null;
  return lines.map((line) => {
    if (fence) {
      if (isFenceClose(line, fence)) {
        fence = null;
      }
      return line;
    }
    const open = FENCE_OPEN.exec(line);
    if (open) {
      fence = open.groups.marker;
      return line;
    }
    return fn(line);
  });
};

/** A JSX string attribute, falling back to an expression for quotes. */
const jsxAttr = (name, value) =>
  value.includes('"')
    ? `${name}={${JSON.stringify(value)}}`
    : `${name}="${value}"`;

/** A YAML scalar, quoted when plain style would misparse. */
const yamlScalar = (value) =>
  /^[\s`'"&*!|>%@#{[\]?,-]|[:#] |: *$|^(?:true|false|null|yes|no|on|off|~)$|^[\d.+-]/iu.test(
    value
  ) || value.includes("`")
    ? JSON.stringify(value)
    : value;

/** `text` without `pattern`'s matches, removed again until none is left. */
const removeAll = (text, pattern) => {
  let out = text;
  let previous;
  do {
    previous = out;
    out = out.replaceAll(pattern, "");
  } while (out !== previous);
  return out;
};

/** Strip inline Markdown from a heading so it reads as a plain title. */
const plainTitle = (text) =>
  removeAll(
    text
      .replace(/\s*\{:?[^}]*\}\s*$/u, "")
      .replace(/\s*\[#[\w.-]+\]\s*$/u, "")
      .replaceAll(/!?\[(?<label>[^\]]*)\]\([^)]*\)/gu, "$<label>"),
    /<[^>]+>/gu
  )
    .replaceAll(/`+(?<code>[^`]*)`+/gu, "$<code>")
    .replaceAll(/(?<mark>\*\*|__)(?<inner>.+?)\k<mark>/gu, "$<inner>")
    .replaceAll(/(?<![\w*])\*(?<inner>[^*\s][^*]*?)\*(?![\w*])/gu, "$<inner>")
    .replaceAll(/(?<!\w)_(?<inner>[^_\s][^_]*?)_(?!\w)/gu, "$<inner>")
    .trim();

// --- Config: a zero-dependency reader for the keys the codemod needs ----------

/** Lines of a top-level YAML key's block (column-0 list items included). */
const yamlBlock = (text, key) => {
  const lines = text.split(/\r?\n/u);
  const start = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (start === -1) {
    return null;
  }
  const block = [];
  for (const l of lines.slice(start + 1)) {
    if (!(l.trim() === "" || /^\s|^-(?:\s|$)|^#/u.test(l))) {
      break;
    }
    block.push(l);
  }
  return block;
};

/** First-level item names of a YAML list or map block. */
const yamlNames = (block) => {
  const content = block.filter((l) => l.trim() !== "" && !/^\s*#/u.test(l));
  if (content.length === 0) {
    return [];
  }
  const level = indentOf(content[0]);
  return content
    .filter((l) => indentOf(l) === level)
    .map((l) => /^ *(?:- +)?["']?(?<name>[\w./-]+)["']? *(?::|$)/u.exec(l))
    .filter(Boolean)
    .map((m) => m.groups.name);
};

/** The sub-block of one first-level item (`- pymdownx.snippets:` …). */
const yamlItemBlock = (block, name) => {
  const pattern = new RegExp(
    String.raw`^ *(?:- +)?["']?${name.replaceAll(".", String.raw`\.`)}["']? *:`,
    "u"
  );
  const start = block.findIndex((l) => pattern.test(l));
  if (start === -1) {
    return [];
  }
  const level = indentOf(block[start]);
  const out = [];
  for (const l of block.slice(start + 1)) {
    if (l.trim() !== "" && indentOf(l) <= level) {
      break;
    }
    out.push(l);
  }
  return out;
};

/** A YAML list value: `[a, b]`, `a`, or `- a` lines under `key:`. */
const yamlList = (lines, key) => {
  const keyLine = new RegExp(`^ *${key}:`, "u");
  const i = lines.findIndex((l) => keyLine.test(l));
  if (i === -1) {
    return [];
  }
  const inline = lines[i].replace(keyLine, "").trim();
  if (inline.startsWith("[")) {
    return inline
      .slice(1, inline.lastIndexOf("]"))
      .split(",")
      .map(unquote)
      .filter(Boolean);
  }
  if (inline) {
    return [unquote(inline)];
  }
  const out = [];
  for (const l of lines.slice(i + 1)) {
    const m = /^ *- +(?<value>.+)$/u.exec(l);
    if (l.trim() !== "" && (!m || indentOf(l) < indentOf(lines[i]))) {
      break;
    }
    if (m) {
      out.push(unquote(m.groups.value));
    }
  }
  return out;
};

const normalizeExtension = (name) =>
  name.replaceAll('"', "").replace(/^markdown\.extensions\./u, "");

/** The `nav` titles and files a YAML config lists. */
const readYamlNav = (block, config) => {
  for (const l of block ?? []) {
    const titled = /^\s*- +(?<title>.+?): +(?<file>\S+\.md)\s*$/u.exec(l);
    const bare = /^\s*- +(?<file>\S+\.md)\s*$/u.exec(l);
    const file = unquote((titled ?? bare)?.groups.file ?? "");
    if (file) {
      config.navFiles.push(file);
    }
    if (titled) {
      config.nav.set(file, unquote(titled.groups.title));
    }
  }
};

/** Snippet base paths, auto_append, and extend_pygments_lang from extensions. */
const readExtensionOptions = (block, config) => {
  const snippets = yamlItemBlock(block, "pymdownx.snippets");
  const bases = yamlList(snippets, "base_path");
  if (bases.length > 0) {
    config.basePaths = bases.map((b) => path.resolve(config.dir, b));
  }
  config.autoAppend = yamlList(snippets, "auto_append");
  const highlight = yamlItemBlock(block, "pymdownx.highlight").join("\n");
  const names = [...highlight.matchAll(/name: *["']?(?<n>[\w+.-]+)/gu)];
  const langs = [...highlight.matchAll(/lang: *["']?(?<l>[\w+.-]+)/gu)];
  for (const [i, n] of names.entries()) {
    if (langs[i]) {
      config.langMap[n.groups.n] = langs[i].groups.l;
    }
  }
};

const readYamlConfig = (text, config) => {
  let combined = text;
  const inherit = /^INHERIT: *["']?(?<p>[^"'\s#]+)/mu.exec(text);
  if (inherit) {
    config.inherit = inherit.groups.p;
    const parent = path.resolve(config.dir, inherit.groups.p);
    if (existsSync(parent)) {
      // Child keys come first, so the first match below is the child's.
      combined = `${text}\n${readFileSync(parent, "utf-8")}`;
    }
  }
  const extensions = yamlBlock(combined, "markdown_extensions");
  if (extensions) {
    for (const name of yamlNames(extensions)) {
      config.extensions.add(normalizeExtension(name));
    }
    readExtensionOptions(extensions, config);
  }
  config.plugins = [
    ...new Set(yamlNames(yamlBlock(combined, "plugins") ?? [])),
  ];
  readYamlNav(yamlBlock(combined, "nav"), config);
  config.docsDir =
    /^docs_dir: *["']?(?<v>[^"'\s#]+)/mu.exec(combined)?.groups.v ?? null;
  config.customDir =
    /^\s+custom_dir: *["']?(?<v>[^"'\s#]+)/mu.exec(combined)?.groups.v ?? null;
  config.useDirectoryUrls = !/^use_directory_urls: *false/mu.test(combined);
  config.extraCss = /^extra_css:/mu.test(combined);
  config.extraJs = /^extra_javascript:/mu.test(combined);
  config.hooks = /^hooks:/mu.test(combined);
  const extra = (yamlBlock(combined, "extra") ?? []).join("\n");
  config.mike = /^\s+provider: *["']?mike/mu.test(extra);
  config.alternate = /^\s+alternate:/mu.test(extra);
};

// Zensical's extensions when a config sets none (zensical/zensical
// `python/zensical/config.py`, DEFAULT_MARKDOWN_EXTENSIONS). No snippets.
const ZENSICAL_DEFAULT_EXTENSIONS = [
  "abbr",
  "admonition",
  "attr_list",
  "def_list",
  "footnotes",
  "md_in_html",
  "toc",
  "pymdownx.arithmatex",
  "pymdownx.betterem",
  "pymdownx.caret",
  "pymdownx.details",
  "pymdownx.emoji",
  "pymdownx.highlight",
  "pymdownx.inlinehilite",
  "pymdownx.keys",
  "pymdownx.magiclink",
  "pymdownx.mark",
  "pymdownx.smartsymbols",
  "pymdownx.superfences",
  "pymdownx.tabbed",
  "pymdownx.tasklist",
  "pymdownx.tilde",
];

/** The extension a dotted TOML key names: `pymdownx.tabbed.alternate_style` → `pymdownx.tabbed`. */
const tomlExtension = (key) => {
  const parts = normalizeExtension(key.replaceAll("'", "")).split(".");
  return parts[0] === "pymdownx" ? parts.slice(0, 2).join(".") : parts[0];
};

/** Extensions from `[project.markdown_extensions.x]` headers and `x = …` keys under `[project.markdown_extensions]`. */
const readTomlExtensions = (text, config) => {
  let inTable = false;
  for (const line of text.split(/\r?\n/u)) {
    const header = /^\s*\[(?<name>[^\]]+)\]/u.exec(line);
    if (header) {
      const name = header.groups.name.replaceAll(/["'\s]/gu, "");
      inTable = name === "project.markdown_extensions";
      const sub = /^project\.markdown_extensions\.(?<ext>.+)$/u.exec(name);
      if (sub) {
        config.extensions.add(tomlExtension(sub.groups.ext));
      }
      continue;
    }
    const key = /^\s*(?<key>"[^"]+"|[\w.-]+)\s*=/u.exec(line);
    if (inTable && key) {
      config.extensions.add(tomlExtension(key.groups.key));
    }
  }
  if (config.extensions.size === 0) {
    for (const name of ZENSICAL_DEFAULT_EXTENSIONS) {
      config.extensions.add(name);
    }
  }
};

const readTomlConfig = (text, config) => {
  readTomlExtensions(text, config);
  const bases = /^\s*base_path\s*=\s*(?<v>\[[^\]]*\]|"[^"]*")/mu.exec(text);
  if (bases) {
    config.basePaths = [...bases.groups.v.matchAll(/"(?<p>[^"]*)"/gu)].map(
      (m) => path.resolve(config.dir, m.groups.p)
    );
  }
  const plugins = [
    ...text.matchAll(/^\[project\.plugins\.(?<name>[^.\]]+)/gmu),
  ].map((m) => m.groups.name.replaceAll('"', ""));
  config.plugins = [...new Set(plugins)];
  for (const m of text.matchAll(
    /\{ *"(?<title>[^"]+)" *= *"(?<file>[^"]+\.md)" *\}/gu
  )) {
    config.nav.set(m.groups.file, m.groups.title);
    config.navFiles.push(m.groups.file);
  }
  for (const m of text.matchAll(/^\s*"(?<file>[^"]+\.md)",?\s*$/gmu)) {
    config.navFiles.push(m.groups.file);
  }
  config.docsDir = /^docs_dir *= *"(?<v>[^"]+)"/mu.exec(text)?.groups.v ?? null;
  config.customDir =
    /^custom_dir *= *"(?<v>[^"]+)"/mu.exec(text)?.groups.v ?? null;
  config.useDirectoryUrls = !/^use_directory_urls *= *false/mu.test(text);
  config.extraCss = /^extra_css *=/mu.test(text);
  config.extraJs = /^extra_javascript *=/mu.test(text);
  config.hooks = /^hooks *=/mu.test(text);
};

const readConfig = (file) => {
  const dir = path.dirname(file);
  const config = {
    alternate: false,
    autoAppend: [],
    basePaths: [dir],
    customDir: null,
    dir,
    docsDir: null,
    extensions: new Set(),
    extraCss: false,
    extraJs: false,
    hooks: false,
    inherit: null,
    langMap: {},
    mike: false,
    nav: new Map(),
    navFiles: [],
    plugins: [],
    useDirectoryUrls: true,
  };
  const text = readFileSync(file, "utf-8");
  if (file.endsWith(".toml")) {
    readTomlConfig(text, config);
  } else {
    readYamlConfig(text, config);
  }
  return config;
};

const findConfig = (explicit, contentDir) => {
  if (explicit) {
    return path.resolve(explicit);
  }
  for (const dir of [process.cwd(), path.dirname(contentDir)]) {
    const name = CONFIG_NAMES.find((n) => existsSync(path.join(dir, n)));
    if (name) {
      return path.join(dir, name);
    }
  }
  return null;
};

/**
 * Which extensions' syntax to convert. With a config, only the extensions it
 * enables (`extra` expands to its parts); without one, everything except the
 * conversions that could misread plain Markdown (`risky`).
 */
const makeEnabled =
  (config) =>
  (name, risky = false) => {
    if (!config) {
      return !risky;
    }
    const ext = config.extensions;
    return (
      ext.has(name) ||
      ((ext.has("extra") || ext.has("pymdownx.extra")) && EXTRA_PARTS.has(name))
    );
  };

// --- Code fences ----------------------------------------------------------------

/** Pull `hl_lines`/`linenums` out of fence options. */
const fenceOptions = (rest, ctx) => {
  let lines = "";
  let lineNumbers = false;
  const remaining = rest
    .replace(/hl_lines=(?<q>["'])(?<v>[^"']*)\k<q>/u, (...m) => {
      lines = `{${m
        .at(-1)
        .v.trim()
        .split(/[\s,]+/u)
        .join(",")}}`;
      ctx.change("fence-hl", `hl_lines → ${lines}`);
      return "";
    })
    .replace(/linenums=(?<q>["'])(?<v>[^"']*)\k<q>/u, (...m) => {
      lineNumbers = true;
      const [start] = m.at(-1).v.trim().split(/\s+/u);
      ctx.change("fence-linenums", "linenums → lineNumbers");
      if (start !== "1") {
        ctx.report(
          "linenums-start",
          `start ${start} dropped (Blume numbers from 1)`
        );
      }
      return "";
    })
    .replaceAll(/\s+/gu, " ")
    .trim();
  return { lineNumbers, lines, remaining };
};

const rewriteFenceInfo = (indent, marker, info, ctx) => {
  let rest = info.trim();
  const attr = /^\{ *\.(?<lang>[\w+#.-]+) *(?<more>.*?) *\}$/u.exec(rest);
  if (attr) {
    rest = `${attr.groups.lang} ${attr.groups.more}`.trim();
    ctx.change("fence-attr", "{ .lang … } → lang …");
  }
  let lang = /^(?<lang>[^\s="'{]+)(?=\s|$)/u.exec(rest)?.groups.lang ?? "";
  rest = rest.slice(lang.length).trim();
  const mapped =
    ctx.langMap[lang] ?? LANGS[lang.toLowerCase()] ?? lang.toLowerCase();
  if (mapped !== lang) {
    ctx.change("fence-lang", `${lang} → ${mapped}`);
    lang = mapped;
  }
  const { lineNumbers, lines, remaining } = fenceOptions(rest, ctx);
  if (!lang && (remaining || lines || lineNumbers)) {
    lang = "text";
    ctx.change("fence-text", "options without a language → text");
  }
  const parts = [lang, remaining, lines, lineNumbers ? "lineNumbers" : ""];
  return `${" ".repeat(indent)}${marker}${parts.filter(Boolean).join(" ")}`;
};

// --- Snippets -------------------------------------------------------------------

/** Resolve a snippet path the way pymdownx.snippets does: from base_path. */
const resolveSnippet = (target, ctx) => {
  if (/^https?:/u.test(target)) {
    ctx.report(
      "snippet-url",
      `${target} — download it into _snippets/ by hand`
    );
    return null;
  }
  const { file, suffix } = SNIPPET_SUFFIX.exec(target).groups;
  if (suffix) {
    ctx.report(
      "snippet-range",
      `${target} — line ranges and sections have no equivalent: split the excerpt into its own file`
    );
    return null;
  }
  for (const base of ctx.basePaths) {
    const abs = path.resolve(base, file);
    if (existsSync(abs) && statSync(abs).isFile()) {
      return abs;
    }
  }
  ctx.report(
    "snippet-missing",
    `${target} — not found under the snippets base_path (MkDocs dropped it silently)`
  );
  return null;
};

/** The `<include>` path for a resolved snippet, copying it in when outside. */
const includePath = (abs, ctx) => {
  const rel = toPosix(path.relative(ctx.root, abs));
  if (!rel.startsWith("../") && !path.isAbsolute(rel)) {
    return `/${rel}`;
  }
  const fromConfig = toPosix(path.relative(ctx.configDir, abs));
  const copyRel = `_snippets/${fromConfig.startsWith("../") ? path.basename(abs) : fromConfig}`;
  ctx.copies.set(copyRel, abs);
  ctx.report(
    "snippet-copied",
    `${fromConfig} is outside the content root → copied to ${copyRel} (keep it in sync with a predev/prebuild script)`
  );
  return `/${copyRel}`;
};

/**
 * An include indented like code (4+ columns, inside a list item) splices only
 * in `.mdx`: Blume's `.md` include matcher skips it and the page ships a bare
 * tag with a green build.
 */
const markIndentedInclude = (line, ctx) => {
  if (indentOf(line) >= 4) {
    ctx.mdx = true;
  }
};

/** A fence holding only one snippet line → a code include; else null. */
const fencedSnippet = (lines, i, end, ctx) => {
  const only = lines.slice(i + 1, end - 1).filter((l) => !isBlank(l));
  const snip = only.length === 1 ? SNIPPET_LINE.exec(only[0]) : null;
  if (!snip || snip.groups.escape) {
    if (only.some((l) => SNIPPET_LINE.test(l))) {
      ctx.report(
        "snippet-in-code",
        "a code block mixes snippet lines with code — split it by hand"
      );
    }
    return null;
  }
  const abs = resolveSnippet(snip.groups.target, ctx);
  if (!abs) {
    return null;
  }
  const { indent, info } = FENCE_OPEN.exec(lines[i]).groups;
  const [lang, ...meta] = rewriteFenceInfo(0, "", info, ctx).trim().split(" ");
  const langAttr = lang ? ` lang="${lang}"` : "";
  const metaAttr = meta.length > 0 ? ` meta='${meta.join(" ")}'` : "";
  ctx.change(
    "snippet-code",
    `code block → code include of ${snip.groups.target}`
  );
  markIndentedInclude(lines[i], ctx);
  return `${indent}<include${langAttr}${metaAttr}>${includePath(abs, ctx)}</include>`;
};

/** `--8<-- "file"` → an include line; null when it can't be converted. */
const lineSnippet = (snip, i, ctx) => {
  if (snip.groups.escape) {
    ctx.report(
      "snippet-escaped",
      "an escaped ;--8<-- line (documents the syntax) — left as is"
    );
    return null;
  }
  const abs = resolveSnippet(snip.groups.target, ctx);
  if (!abs) {
    return null;
  }
  ctx.change("snippet", `--8<-- ${snip.groups.target} → <include>`);
  markIndentedInclude(snip.input, ctx);
  return {
    lines: [`${snip.groups.indent}<include>${includePath(abs, ctx)}</include>`],
    next: i + 1,
  };
};

/** A `--8<--` block of file lines → include lines; null when it can't be converted. */
const blockSnippet = (lines, i, ctx) => {
  const block = SNIPPET_BLOCK.exec(lines[i]);
  const close = block
    ? lines.findIndex((l, k) => k > i && SNIPPET_BLOCK.test(l))
    : -1;
  if (close === -1) {
    return null;
  }
  const targets = lines
    .slice(i + 1, close)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith(";"));
  const resolved = targets.map((t) => resolveSnippet(t, ctx));
  if (resolved.some((abs) => !abs)) {
    return null;
  }
  ctx.change("snippet", `--8<-- block → ${targets.length} <include>`);
  markIndentedInclude(lines[i], ctx);
  return {
    lines: resolved.map(
      (abs) =>
        `${block.groups.indent}<include>${includePath(abs, ctx)}</include>`
    ),
    next: close + 1,
  };
};

// --- Block conversion: admonitions, details, tabs ---------------------------------

/** Do a title's unescaped brackets nest and close? */
const bracketsBalanced = (text) => {
  let depth = 0;
  for (const m of text.matchAll(/\\.|[[\]]/gu)) {
    if (m[0] === "[") {
      depth += 1;
    } else if (m[0] === "]") {
      depth -= 1;
    }
    if (depth < 0) {
      return false;
    }
  }
  return depth === 0;
};

/**
 * A callout's `[label]`. Blume renders the label's inline Markdown, and
 * balanced brackets (code spans included) parse as written; an unbalanced
 * title is flattened and every bracket escaped, since an escape inside a code
 * span would end the label early and drop the title.
 */
const directiveLabel = (title) => {
  if (!title) {
    return "";
  }
  const text = bracketsBalanced(title)
    ? title
    : plainTitle(title).replaceAll(/(?<b>[[\]])/gu, String.raw`\$<b>`);
  return `[${text}]`;
};

const renderCallout = (type, title, body, ctx) => {
  const mapped = ADMONITION_TYPES[type] ?? "note";
  if (!ADMONITION_TYPES[type]) {
    ctx.report("admonition-unknown", `'${type}' → note`);
  } else if (mapped !== type) {
    ctx.change("admonition-type", `${type} → ${mapped}`);
  }
  const inner = Math.max(
    0,
    ...body.map((l) => /^ *(?<c>:{3,})/u.exec(l)?.groups.c.length ?? 0)
  );
  const colons = ":".repeat(Math.max(3, inner + 1));
  const label = directiveLabel(title);
  ctx.change("admonition", `!!! ${type} → ${colons}${mapped}`);
  return [`${colons}${mapped}${label}`, ...body, colons];
};

const renderAdmonition = (adm, body, ctx) => {
  const [first = "note", ...modifiers] = (adm.words ?? "note").split(/ +/u);
  const type = first.toLowerCase();
  if (modifiers.some((w) => w === "inline" || w === "end")) {
    ctx.report("admonition-inline", "inline/inline end placement dropped");
  }
  if (adm.kind.startsWith("???")) {
    const open = adm.kind === "???+" ? " defaultOpen" : "";
    // Expandable titles render their inline Markdown, but raw HTML as text.
    const label = adm.title
      ? removeAll(adm.title, /<[^>]+>/gu).trim()
      : capitalize(type);
    ctx.change("details", `${adm.kind} ${type} → <Expandable>`);
    return [
      `<Expandable ${jsxAttr("title", label)}${open}>`,
      "",
      ...body,
      "",
      "</Expandable>",
    ];
  }
  if (type === "quote" || type === "cite") {
    ctx.change("admonition", "quote → blockquote");
    return body.map((l) => (l === "" ? ">" : `> ${l}`));
  }
  return renderCallout(type, adm.title, body, ctx);
};

const isLoneFence = (body) =>
  body.length >= 2 &&
  FENCE_OPEN.test(body[0]) &&
  indentOf(body[0]) === 0 &&
  fenceEnd(body, 0) === body.length;

/** Is `line` a tab of the group at `indent` (and not the start of a new one)? */
const continuesGroup = (line, indent) => {
  const t = line === undefined ? null : TAB.exec(line);
  return Boolean(
    t && t.groups.indent.length === indent && !t.groups.flags.includes("!")
  );
};

const renderCodeGroup = (tabs, ctx) => {
  const block = ["<CodeGroup>", ""];
  for (const t of tabs) {
    const { info, marker } = FENCE_OPEN.exec(t.body[0]).groups;
    const existing = /title=(?<q>["'])(?<v>.*?)\k<q>/u.exec(info);
    if (existing && existing.groups.v !== t.label) {
      ctx.report(
        "tab-title",
        `tab '${t.label}' wraps a block titled '${existing.groups.v}': kept the tab label`
      );
    }
    const kept =
      info.replace(/\s*title=(?<q>["']).*?\k<q>/u, "").trim() || "text";
    const quote = t.label.includes('"') ? "'" : '"';
    block.push(
      `${marker}${kept} title=${quote}${t.label}${quote}`,
      ...t.body.slice(1),
      ""
    );
  }
  block.push("</CodeGroup>");
  ctx.change("tabs", `=== → <CodeGroup> (${tabs.length} tabs)`);
  return block;
};

const renderTabs = (tabs, ctx) => {
  const selected = tabs.findIndex((t) => t.selected);
  const block = [
    selected > 0 ? `<Tabs defaultTabIndex={${selected}}>` : "<Tabs>",
  ];
  for (const t of tabs) {
    block.push(
      `<Tab ${jsxAttr("title", t.label)}>`,
      "",
      ...t.body,
      "",
      "</Tab>"
    );
  }
  block.push("</Tabs>");
  ctx.change("tabs", `=== → <Tabs> (${tabs.length} tabs)`);
  return block;
};

/**
 * Convert one block level of lines (recursive for admonition and tab
 * bodies). Each handler converts the construct at `lines[i]` or returns null.
 */
const convertBlock = (lines, ctx) => {
  const handleFence = (i) => {
    const fence = FENCE_OPEN.exec(lines[i]);
    if (!fence) {
      return null;
    }
    const end = fenceEnd(lines, i);
    const include = ctx.enabled("pymdownx.snippets")
      ? fencedSnippet(lines, i, end, ctx)
      : null;
    if (include) {
      return { lines: [include], next: end };
    }
    const { indent, info, marker } = fence.groups;
    return {
      lines: [
        rewriteFenceInfo(indent.length, marker, info, ctx),
        ...lines.slice(i + 1, end),
      ],
      next: end,
    };
  };

  const handleAdmonition = (i) => {
    const m = ADMONITION.exec(lines[i]);
    const ext = m?.groups.kind === "!!!" ? "admonition" : "pymdownx.details";
    const named =
      m &&
      (m.groups.words ||
        (ext === "pymdownx.details" && m.groups.title !== undefined));
    if (!(named && ctx.enabled(ext))) {
      return null;
    }
    const indent = m.groups.indent.length;
    const [rawBody, next] = collectBody(lines, i + 1, indent + 4);
    const body = trimBlankEdges(convertBlock(rawBody, ctx));
    ctx.mdx = true;
    return {
      lines: prefix(indent, renderAdmonition(m.groups, body, ctx)),
      next,
    };
  };

  const handleTabs = (i) => {
    const m = TAB.exec(lines[i]);
    if (!(m && ctx.enabled("pymdownx.tabbed"))) {
      return null;
    }
    const indent = m.groups.indent.length;
    const tabs = [];
    let j = i;
    let more = true;
    while (more) {
      const t = TAB.exec(lines[j]);
      const [rawBody, next] = collectBody(lines, j + 1, indent + 4);
      tabs.push({
        body: trimBlankEdges(convertBlock(rawBody, ctx)),
        label: t.groups.label,
        selected: t.groups.flags.includes("+"),
      });
      let k = next;
      while (k < lines.length && isBlank(lines[k])) {
        k += 1;
      }
      more = continuesGroup(lines[k], indent);
      j = more ? k : next;
    }
    ctx.mdx = true;
    const block = tabs.every((t) => isLoneFence(t.body))
      ? renderCodeGroup(tabs, ctx)
      : renderTabs(tabs, ctx);
    return { lines: prefix(indent, block), next: j };
  };

  const handleSnippet = (i) => {
    if (!ctx.enabled("pymdownx.snippets")) {
      return null;
    }
    const snip = SNIPPET_LINE.exec(lines[i]);
    return snip ? lineSnippet(snip, i, ctx) : blockSnippet(lines, i, ctx);
  };

  const handlers = [handleFence, handleAdmonition, handleTabs, handleSnippet];
  const out = [];
  let i = 0;
  while (i < lines.length) {
    let handled = null;
    for (const handler of handlers) {
      handled ??= handler(i);
    }
    if (handled) {
      out.push(...handled.lines);
      i = handled.next;
    } else {
      if (/^ *\/{3,} *[\w-]+/u.test(lines[i])) {
        ctx.report(
          "blocks",
          `pymdownx.blocks syntax '${lines[i].trim()}' — convert by hand`
        );
      }
      out.push(lines[i]);
      i += 1;
    }
  }
  return out;
};

// --- Line rewrites ------------------------------------------------------------------

/** `## Title { #id .class }` → `## Title [#id]`; drops a redundant self-link. */
const pinHeading = (line, ctx) => {
  const heading = HEADING_ATTRS.exec(line);
  const isAttrList =
    heading &&
    ctx.enabled("attr_list") &&
    /(?:^|\s)[#.]|=/u.test(heading.groups.attrs);
  if (!isAttrList) {
    return line;
  }
  let { text } = heading.groups;
  const id = /(?:^|\s)#(?<id>[\w.:-]+)/u.exec(heading.groups.attrs)?.groups.id;
  const self =
    /^(?<hashes>#{1,6} +)\[(?<label>.+)\]\(#(?<target>[\w.:-]+)\) *$/u.exec(
      text
    );
  if (self && self.groups.target === id) {
    text = `${self.groups.hashes}${self.groups.label}`;
    ctx.change(
      "heading-self-link",
      "self-link dropped (Blume links headings itself)"
    );
  }
  const rest = heading.groups.attrs.replace(/(?:^|\s)#[\w.:-]+/u, "").trim();
  if (rest) {
    ctx.report("attr-dropped", `heading attributes '${rest}' dropped`);
  }
  ctx.change(
    "heading-id",
    id ? `{ #${id} } → [#${id}]` : "heading attribute list dropped"
  );
  return id ? `${text} [#${id}]` : text;
};

const attrKind = (attrs) => {
  if (attrs.includes("md-button")) {
    return "button";
  }
  return attrs.includes("target=") ? "new-tab" : "attributes";
};

const dropAttrLists = (p, ctx) =>
  p
    .replace(INLINE_ATTRS, (...m) => {
      const { attrs, target } = m.at(-1);
      const kind = attrKind(attrs);
      const hint =
        kind === "new-tab" ? " (markdown.externalLinks: true covers it)" : "";
      ctx.report("attr-dropped", `${kind} '{ ${attrs} }' dropped${hint}`);
      ctx.change("attr-list", "attribute list dropped");
      return target;
    })
    .replace(TRAILING_ATTRS, (m) => {
      ctx.report("attr-dropped", `block attributes '${m.trim()}' dropped`);
      ctx.change("attr-list", "attribute list dropped");
      return "";
    });

const keyLabel = (key) => {
  const word = unquote(key);
  const known = KEY_LABELS[word.toLowerCase()];
  if (known) {
    return known;
  }
  return word.length === 1
    ? word.toUpperCase()
    : word.split("-").map(capitalize).join(" ");
};

const convertKeys = (p, ctx) =>
  p.replace(KEYS, (...m) => {
    ctx.change("keys", `${m[0]} → <kbd>`);
    return m
      .at(-1)
      .keys.split("+")
      .map((k) => `<kbd>${keyLabel(k)}</kbd>`)
      .join("+");
  });

const convertMark = (p, ctx) =>
  p.replaceAll(/(?<![=\w])==(?<t>\S(?:[^=\n]*?\S)?)==(?![=\w])/gu, (...m) => {
    ctx.change("mark", "==mark== → <mark>");
    return `<mark>${m.at(-1).t}</mark>`;
  });

const convertIns = (p, ctx) =>
  p.replaceAll(/(?<!\^)\^\^(?<t>\S(?:[^^\n]*?\S)?)\^\^(?!\^)/gu, (...m) => {
    ctx.change("ins", "^^ins^^ → <ins>");
    return `<ins>${m.at(-1).t}</ins>`;
  });

const convertIcons = (p, ctx) =>
  p.replace(ICON_SHORTCODE, (...m) => {
    const { name } = m.at(-1);
    if (!(name in ICONS)) {
      ctx.report(
        "icon-unknown",
        `:${name}: — no mapping; pick a Lucide name or drop it`
      );
      return m[0];
    }
    const lucide = ICONS[name];
    if (lucide === null) {
      ctx.change("icon", `:${name}: dropped (decorative)`);
      return "";
    }
    ctx.mdx = true;
    ctx.change("icon", `:${name}: → <Icon icon="${lucide}" />`);
    return `<Icon icon="${lucide}" />`;
  });

const convertMathInline = (p, ctx) => {
  const out = p.replaceAll(/\\\((?<m>.+?)\\\)/gu, (...m) => {
    ctx.mdx = true;
    ctx.change("math", String.raw`\(…\) → $$…$$`);
    return `$$${m.at(-1).m}$$`;
  });
  if (/(?<![$\\])\$(?!\$)[^$\s][^$]*\$(?!\$)/u.test(out)) {
    ctx.counts.dollar += 1;
  }
  return out;
};

/** Prose-level rewrites, each only when its extension is on: [extension, risky, step]. */
const PROSE_STEPS = [
  ["attr_list", false, dropAttrLists],
  ["pymdownx.keys", true, convertKeys],
  ["pymdownx.mark", true, convertMark],
  ["pymdownx.caret", true, convertIns],
  ["pymdownx.emoji", false, convertIcons],
  ["pymdownx.arithmatex", true, convertMathInline],
];

const countProse = (p, ctx) => {
  const emoji = /(?<![\w:]):[a-z0-9_+-]+:(?![\w:])/u.test(
    p.replaceAll(ICON_SHORTCODE, "")
  );
  if (ctx.enabled("pymdownx.emoji") && emoji && !/https?:/u.test(p)) {
    ctx.counts.emoji += 1;
  }
  if (/\{\{|\{%/u.test(p)) {
    ctx.counts.jinja += 1;
  }
  if (/\{(?:\+\+|--|~~|==|>>)/u.test(p)) {
    ctx.report(
      "critic",
      "critic markup — apply the edit or use <ins>/<del>/<mark>"
    );
  }
};

const rewriteProse = (p, ctx) => {
  let out = p;
  for (const [ext, risky, step] of PROSE_STEPS) {
    if (ctx.enabled(ext, risky)) {
      out = step(out, ctx);
    }
  }
  countProse(out, ctx);
  return out;
};

const inlineHilite = (line, ctx) =>
  line.replaceAll(
    /`(?:#!|:::)(?<lang>[\w+#.-]+) +(?<code>[^`]+?)`/gu,
    (...m) => {
      const { code, lang } = m.at(-1);
      const mapped = LANGS[lang.toLowerCase()] ?? lang.toLowerCase();
      ctx.change("inline-code", `#!${lang} → {:${mapped}}`);
      return `\`${code}{:${mapped}}\``;
    }
  );

const mathBlockLine = (line, ctx) => {
  if (/^ *\\\[ *$/u.test(line)) {
    ctx.change("math", String.raw`\[ → $$`);
    return line.replace("\\[", "$$$$");
  }
  return /^ *\\\] *$/u.test(line) ? line.replace("\\]", "$$$$") : line;
};

const stripMarkdownAttr = (line, ctx) => {
  if (/class="[^"]*\bgrid\b/u.test(line)) {
    ctx.report(
      "grid-cards",
      "Material grid cards — rebuild as <CardGroup>/<Card>"
    );
  }
  ctx.mdx = true;
  ctx.change(
    "md-in-html",
    "markdown attribute removed (Markdown inside HTML renders in .mdx)"
  );
  return line.replace(/\smarkdown(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/u, "");
};

/** Whole-line checks: returns null to drop the line. */
const filterLine = (line, ctx) => {
  if (ctx.enabled("abbr") && /^\*\[[^\]]+\]: /u.test(line)) {
    ctx.report(
      "abbr",
      `abbreviation '${line.slice(2, line.indexOf("]"))}' removed — use <Tooltip> where it matters`
    );
    ctx.change("abbr", "abbreviation definition removed");
    return null;
  }
  if (/^ *\[TOC\] *$/u.test(line)) {
    ctx.change("toc", "[TOC] removed (the TOC is automatic)");
    return null;
  }
  if (ctx.enabled("def_list") && /^: {3}\S/u.test(line)) {
    ctx.counts.deflist += 1;
  }
  if (/^::: +[\w.]+ *$/u.test(line)) {
    ctx.report(
      "mkdocstrings",
      `'${line.trim()}' — mkdocstrings has no Blume equivalent`
    );
  }
  if (
    /<img\b[^>]*\ssrc=["']?(?![a-z][\w+.-]*:|\/|#)[^"'\s>]/iu.test(
      maskCode(line)
    )
  ) {
    ctx.report(
      "raw-img",
      "a raw <img> with a relative src — Blume reads it from the page's folder (MkDocs read it from the page's URL, a level deeper) and doesn't optimize it: make it a Markdown image"
    );
  }
  return line;
};

/** Line-level rewrites outside fences; returns null to drop the line. */
const rewriteLine = (raw, ctx) => {
  let line = mapProse(pinHeading(raw, ctx), (p) => rewriteProse(p, ctx));
  if (ctx.enabled("pymdownx.inlinehilite")) {
    line = inlineHilite(line, ctx);
  }
  if (ctx.enabled("pymdownx.arithmatex", true)) {
    line = mathBlockLine(line, ctx);
    ctx.mdx ||= /^ *\$\$/u.test(line);
  }
  const markdownInHtml =
    /^ *<(?:div|section|figure|details|span|p)\b[^>]*\smarkdown(?:=(?:"[^"]*"|'[^']*'|\S+))?/u;
  if (ctx.enabled("md_in_html") && markdownInHtml.test(line)) {
    line = stripMarkdownAttr(line, ctx);
  }
  return filterLine(line, ctx);
};

const rewriteLines = (lines, ctx) => {
  const out = [];
  let fence = null;
  for (const line of lines) {
    if (fence) {
      out.push(line);
      fence = isFenceClose(line, fence) ? null : fence;
      if (/(?:#|\/\/) \(\d+\)!?\s*$/u.test(line)) {
        ctx.counts.annotations += 1;
      }
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    if (open) {
      fence = open.groups.marker;
      ctx.mdx ||= /^ *(?:`{3,}|~{3,}) *mermaid\b/u.test(line);
      out.push(line);
      continue;
    }
    const next = rewriteLine(line, ctx);
    if (next !== null) {
      out.push(next);
    }
  }
  return out;
};

/**
 * Percent-encode angle-bracket link destinations. Blume reads both forms, in
 * a page and in a partial it splices into one, so this only tidies.
 */
const unwrapAngleDestinations = (lines, ctx) =>
  mapFenced(lines, (line) =>
    mapProse(line, (p) =>
      p.replaceAll(
        /\]\(<(?<url>[^>\s]+(?: [^>]*)?)>(?<title> +"[^"]*")?\)/gu,
        (...m) => {
          const { title, url } = m.at(-1);
          ctx.change(
            "link-destination",
            "<…> link destination → percent-encoded"
          );
          const encoded = url
            .replaceAll(" ", "%20")
            .replaceAll("(", "%28")
            .replaceAll(")", "%29");
          return `](${encoded}${title ?? ""})`;
        }
      )
    )
  );

// --- MDX-only rewrites ------------------------------------------------------------

const commentText = (text) =>
  text.replace(/^-+/u, "").replace(/-+$/u, "").trim().replaceAll("*/", "* /");

/** Close single-line comments in place; `start` is an open comment's index, or -1. */
const closeComments = (line, ctx) => {
  let out = line;
  let start = maskCode(out).indexOf("<!--");
  while (start !== -1) {
    const close = out.indexOf("-->", start + 4);
    if (close === -1) {
      return { line: out, start };
    }
    out = `${out.slice(0, start)}{/* ${commentText(out.slice(start + 4, close))} */}${out.slice(close + 3)}`;
    ctx.change("comment", "HTML comment → {/* */}");
    start = maskCode(out).indexOf("<!--");
  }
  return { line: out, start };
};

const mdxProse = (line, ctx) =>
  mapProse(line, (p) =>
    p
      .replaceAll(/(?<pre>^|[^(])<(?<url>https?:\/\/[^>\s]+)>/gu, (...m) => {
        const { pre, url } = m.at(-1);
        ctx.change("autolink", "<https://…> → [url](url)");
        return `${pre}[${url}](${url})`;
      })
      .replaceAll(
        /<(?<tag>br|hr|img|input)(?<attrs>\s[^>]*?)?\s*(?<!\/)>/gu,
        (...m) => {
          const { attrs, tag } = m.at(-1);
          ctx.change("void-tag", `<${tag}> self-closed`);
          return `<${tag}${attrs ?? ""} />`;
        }
      )
  );

/**
 * MDX-only rewrites: HTML comments (always on one line — Prettier rewrites a
 * multi-line `{/* … *\/}` into `{/_ … _/}`), autolinks, and void tags.
 */
const rewriteForMdx = (lines, ctx) => {
  const out = [];
  let fence = null;
  let comment = null;
  for (const raw of lines) {
    let line = raw;
    if (comment) {
      const end = line.indexOf("-->");
      if (end === -1) {
        comment.parts.push(line.trim());
        continue;
      }
      comment.parts.push(line.slice(0, end).trim());
      line = `${comment.before}{/* ${commentText(comment.parts.filter(Boolean).join(" "))} */}${line.slice(end + 3)}`;
      comment = null;
      ctx.change("comment", "multi-line HTML comment → one-line {/* */}");
    } else if (fence) {
      out.push(line);
      fence = isFenceClose(line, fence) ? null : fence;
      continue;
    } else if (FENCE_OPEN.test(line)) {
      fence = FENCE_OPEN.exec(line).groups.marker;
      out.push(line);
      continue;
    }
    const closed = closeComments(line, ctx);
    if (closed.start === -1) {
      out.push(mdxProse(closed.line, ctx));
    } else {
      comment = {
        before: closed.line.slice(0, closed.start),
        parts: [closed.line.slice(closed.start + 4)],
      };
    }
  }
  if (comment) {
    ctx.report("comment", "unclosed HTML comment — fix by hand");
    out.push(`${comment.before}<!--${comment.parts.join("\n")}`);
  }
  return out;
};

/** Hazards MDX would reject in one prose line. */
const lineHazards = (line) => {
  const prose = maskCode(line).replaceAll(/\$\$.*?\$\$/gu, "");
  const hits = [];
  for (const m of prose.matchAll(/<\/?(?<tag>[A-Za-z][\w.-]*)/gu)) {
    const { tag } = m.groups;
    const fine =
      KNOWN_TAGS.has(tag.toLowerCase()) ||
      /^[A-Z]/u.test(tag) ||
      tag === "include";
    if (!fine) {
      hits.push(`<${tag}>`);
    }
  }
  const braces = prose
    .replaceAll(/\{\/\*.*?\*\/\}/gu, "")
    .replaceAll(/[=]\{[^}]*\}/gu, "")
    .replaceAll(/\{[\d,-]+\}/gu, "")
    .replaceAll(/\\[{}]/gu, "");
  if (/[{}]/u.test(braces)) {
    hits.push("{…}");
  }
  for (const token of ["<!--", "--8<--"]) {
    if (prose.includes(token)) {
      hits.push(token);
    }
  }
  return [...new Set(hits)];
};

/** Report MDX hazards left in prose (outside fences, code, and math). */
const scanHazards = (lines, ctx) => {
  let fence = null;
  let math = false;
  for (const [n, line] of lines.entries()) {
    if (fence) {
      fence = isFenceClose(line, fence) ? null : fence;
    } else if (FENCE_OPEN.test(line)) {
      fence = FENCE_OPEN.exec(line).groups.marker;
    } else if (/^ *\$\$ *$/u.test(line)) {
      math = !math;
    } else if (!math) {
      const hits = lineHazards(line);
      if (hits.length > 0) {
        ctx.report(
          "mdx-hazard",
          `line ${n + 1}: ${hits.join(" ")} — ${line.trim().slice(0, 80)}`
        );
      }
    }
  }
};

// --- Frontmatter ----------------------------------------------------------------

/** Split frontmatter into top-level entries `{ key, lines, value }`, keeping raw lines. */
const parseFrontmatter = (fmLines) => {
  const entries = [];
  for (const line of fmLines) {
    const m = /^(?<q>["']?)(?<key>[\w-]+)\k<q> *:(?<rest>.*)$/u.exec(line);
    if (m) {
      entries.push({
        key: m.groups.key,
        lines: [line],
        value: m.groups.rest.trim(),
      });
    } else if (entries.length > 0) {
      entries.at(-1).lines.push(line);
    } else {
      entries.push({ key: null, lines: [line], value: "" });
    }
  }
  return entries;
};

const entryList = (entry) => {
  if (entry.value.startsWith("[")) {
    return entry.value
      .slice(1, entry.value.lastIndexOf("]"))
      .split(",")
      .map(unquote)
      .filter(Boolean);
  }
  if (entry.value) {
    return [unquote(entry.value)];
  }
  return entry.lines
    .slice(1)
    .map((l) => /^\s*- +(?<v>.+)$/u.exec(l)?.groups.v)
    .filter(Boolean)
    .map(unquote);
};

/** A small editable model over the frontmatter entries. */
const frontmatterModel = (entries, ctx) => ({
  add: (key, value) =>
    entries.push({ key, lines: [`${key}: ${value}`], value }),
  entries,
  get: (key) => entries.find((e) => e.key === key),
  remove: (key) => {
    const i = entries.findIndex((e) => e.key === key);
    if (i !== -1) {
      entries.splice(i, 1);
    }
  },
  /** Set `parent.child: value` (block style), unless a child already exists. */
  setChild: (parent, child, value) => {
    let entry = entries.find((e) => e.key === parent);
    if (!entry) {
      entry = { key: parent, lines: [`${parent}:`], value: "" };
      entries.push(entry);
    }
    if (entry.value !== "") {
      ctx.report(
        "frontmatter-conflict",
        `${parent} is written inline; add ${parent}.${child} by hand`
      );
      return false;
    }
    const childLine = new RegExp(String.raw`^\s+${child}:`, "u");
    if (entry.lines.some((l) => childLine.test(l))) {
      return false;
    }
    entry.lines.push(`  ${child}: ${value}`);
    return true;
  },
});

/** Remove the body H1 (the first content line) and return its text. */
const takeH1 = (body, ctx) => {
  for (const [i, line] of body.entries()) {
    const skip =
      isBlank(line) || /^\s*(?:<!--[\s\S]*-->|\{\/\*.*\*\/\})\s*$/u.test(line);
    if (!skip) {
      const m = /^# +(?<text>.+?)(?: +#+)? *$/u.exec(line);
      // A setext H1: the text line, then a `===` underline.
      const setext =
        !m &&
        /^ {0,3}(?![-*+] |\d+[.)] |[#>|<]|`{3}|~{3})\S/u.test(line) &&
        /^ {0,3}=+ *$/u.test(body[i + 1] ?? "");
      if (!(m || setext)) {
        break;
      }
      const taken = setext ? 2 : 1;
      body.splice(i, isBlank(body[i + taken] ?? "x") ? taken + 1 : taken);
      return m ? m.groups.text : line.trim();
    }
  }
  const marked = mapFenced(body, (l) => (l.startsWith("# ") ? "\0h1" : ""));
  if (marked.includes("\0h1")) {
    ctx.report("h1-later", "an H1 below other content was left in place");
  }
  return null;
};

const setTitle = (fm, existing, title) => {
  const line = `title: ${yamlScalar(title)}`;
  if (existing) {
    existing.lines = [line];
    existing.value = title;
  } else {
    fm.entries.unshift({ key: "title", lines: [line], value: title });
  }
};

/** title ← H1 (or nav title); sidebar.label ← nav title; seo.title ← a differing frontmatter title. */
const applyTitles = (fm, h1, ctx) => {
  const existing = fm.get("title");
  const fmTitle = existing ? unquote(existing.value) : null;
  let title = fmTitle;
  if (h1) {
    title = plainTitle(h1);
    if (title !== h1.trim()) {
      ctx.report(
        "title-markup",
        `inline Markdown stripped from the title: ${h1.trim()}`
      );
    }
    ctx.change("title", `body H1 → title: ${title}`);
  } else if (!fmTitle && ctx.navTitle) {
    title = ctx.navTitle;
    ctx.change("title", `nav title → title: ${title}`);
  }
  if (title !== null && title !== fmTitle) {
    setTitle(fm, existing, title);
  }
  const differs = Boolean(h1 && fmTitle && fmTitle !== title);
  if (differs && fm.setChild("seo", "title", yamlScalar(fmTitle))) {
    ctx.change("seo-title", `frontmatter title → seo.title: ${fmTitle}`);
  }
  const label = ctx.navTitle ?? (differs ? fmTitle : null);
  const labelSet =
    label &&
    label !== title &&
    fm.setChild("sidebar", "label", yamlScalar(label));
  if (labelSet) {
    ctx.change("sidebar-label", `nav title → sidebar.label: ${label}`);
  }
};

const mapHide = (fm, ctx) => {
  const hide = fm.get("hide");
  if (!hide) {
    return;
  }
  const values = entryList(hide);
  fm.remove("hide");
  const nav = values.includes("navigation");
  if (nav || values.includes("toc")) {
    const mode = nav ? "center" : "wide";
    if (!fm.get("mode")) {
      fm.add("mode", mode);
    }
    ctx.change("hide", `hide ${values.join(", ")} → mode: ${mode}`);
  }
  if (values.includes("footer") && !fm.get("pagination")) {
    fm.add("pagination", "false");
    ctx.change("hide", "hide footer → pagination: false");
  }
  const dropped = values.filter(
    (v) => !["navigation", "toc", "footer"].includes(v)
  );
  if (dropped.length > 0) {
    ctx.report(
      "hide",
      `hide ${dropped.join(", ")} has no equivalent — dropped`
    );
  }
};

const mapStatus = (fm, ctx) => {
  const status = fm.get("status");
  if (!status) {
    return;
  }
  const value = unquote(status.value);
  fm.remove("status");
  if (value === "deprecated") {
    fm.add("deprecated", "true");
    ctx.change("status", "status: deprecated → deprecated: true");
    return;
  }
  fm.setChild("sidebar", "badge", yamlScalar(capitalize(value)));
  ctx.change("status", `status: ${value} → sidebar.badge`);
};

const mapTags = (fm, ctx) => {
  const tags = fm.get("tags");
  if (!tags) {
    return;
  }
  const values = entryList(tags);
  fm.remove("tags");
  if (fm.setChild("search", "tags", `[${values.map(yamlScalar).join(", ")}]`)) {
    ctx.change("tags", "tags → search.tags");
  }
};

const mapIcon = (fm, ctx) => {
  const icon = fm.get("icon");
  const raw = icon ? unquote(icon.value) : "";
  if (!raw.includes("/")) {
    return;
  }
  const lucide = ICONS[raw.replaceAll("/", "-")];
  if (lucide) {
    icon.lines = [`icon: ${lucide}`];
    ctx.change("icon", `icon ${raw} → ${lucide}`);
    return;
  }
  fm.remove("icon");
  ctx.report("icon-unknown", `icon ${raw} dropped — set a Lucide name by hand`);
  ctx.change("icon", `icon ${raw} dropped`);
};

const reportKeys = (fm, ctx) => {
  for (const key of DROP_KEYS) {
    if (fm.get(key)) {
      fm.remove(key);
      ctx.report("dropped-key", `${key} has no equivalent — dropped`);
      ctx.change("dropped-key", key);
    }
  }
  for (const entry of fm.entries) {
    if (entry.key && !BLUME_KEYS.has(entry.key)) {
      ctx.report(
        "unknown-key",
        `frontmatter '${entry.key}' isn't in Blume's schema — map or remove it (blog posts: see the reference)`
      );
    }
  }
  if (fm.get("date")?.value === "") {
    ctx.report(
      "blog-date",
      "date is an object (created/updated) — flatten to date + lastModified"
    );
  }
};

const convertFrontmatter = (fmLines, bodyLines, ctx) => {
  const fm = frontmatterModel(parseFrontmatter(fmLines), ctx);
  const body = [...bodyLines];
  applyTitles(fm, takeH1(body, ctx), ctx);
  if (!fm.get("title")) {
    ctx.report(
      "no-title",
      "no H1, nav title, or frontmatter title — set `title` (an H1 that only an included partial brings would render twice)"
    );
  }
  mapHide(fm, ctx);
  mapStatus(fm, ctx);
  mapTags(fm, ctx);
  mapIcon(fm, ctx);
  reportKeys(fm, ctx);
  return { body, fm: fm.entries.flatMap((e) => e.lines) };
};

// --- Files and links ---------------------------------------------------------------

/** Every file under `root` that `keep` accepts, in sorted order. */
const walkFiles = (root, keep) => {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).toSorted()) {
      const abs = path.join(dir, name);
      if (statSync(abs).isDirectory()) {
        if (!SKIP_DIRS.has(name)) {
          walk(abs);
        }
      } else if (keep(name)) {
        out.push(abs);
      }
    }
  };
  walk(root);
  return out;
};

const isPartial = (rel) =>
  rel.split("/").some((s) => s.startsWith("_") || s.startsWith("."));

const safeDecode = (target) => {
  try {
    return decodeURI(target);
  } catch {
    // A malformed escape: resolve the path as written.
    return target;
  }
};

/** Rewrite relative links to renamed files, as seen from `fromDir`. */
const rewriteLinks = (lines, fromDir, renamed, ctx) =>
  mapFenced(lines, (line) =>
    mapProse(line, (p) =>
      p.replace(MD_LINK, (...m) => {
        const { hash, lead, target } = m.at(-1);
        const next = renamed.get(path.resolve(fromDir, safeDecode(target)));
        if (!next) {
          return m[0];
        }
        let rel = toPosix(path.relative(fromDir, next));
        if (target.startsWith("./") && !rel.startsWith(".")) {
          rel = `./${rel}`;
        }
        ctx.change("link", `${target} → ${rel}`);
        return `${lead}${rel}${hash ?? ""}`;
      })
    )
  );

// --- Pages ---------------------------------------------------------------------------

const COUNT_REPORTS = [
  [
    "annotations",
    "annotations",
    (n) => `${n} code annotation marker(s) — move the notes into prose`,
  ],
  [
    "emoji",
    "emoji",
    (n) => `${n} line(s) with emoji shortcodes — paste the emoji`,
  ],
  [
    "dollar",
    "math",
    (n) => `${n} line(s) with single-$ math — write $$…$$ where it is math`,
  ],
  [
    "jinja",
    "macros",
    (n) => `${n} line(s) with {{ }} / {% %} — variables or by hand`,
  ],
  [
    "deflist",
    "deflist",
    (n) => `${n} definition list item(s) — <dl> or a list`,
  ],
];

/** Split a file into frontmatter lines (or null) and body lines. */
const splitSource = (source) => {
  const lines = source.split(/\r?\n/u);
  const end = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  return end === -1
    ? { body: lines, fm: null }
    : { body: lines.slice(end + 1), fm: lines.slice(1, end) };
};

const reportCounts = (ctx) => {
  for (const [key, kind, message] of COUNT_REPORTS) {
    if (ctx.counts[key] > 0) {
      ctx.report(kind, message(ctx.counts[key]));
    }
  }
};

/** Convert one file's text; renames and links are decided across files later. */
const convertPage = (abs, source, run) => {
  const rel = toPosix(path.relative(run.root, abs));
  const ctx = run.makeCtx(abs);
  const split = splitSource(source);
  const partial = isPartial(rel);
  if (!(split.fm || partial) && MULTIMARKDOWN_META.test(split.body[0] ?? "")) {
    ctx.report(
      "multimarkdown-meta",
      "MultiMarkdown meta lines at the top — turn them into YAML frontmatter"
    );
  }
  let body = unwrapAngleDestinations(
    rewriteLines(convertBlock(split.body, ctx), ctx),
    ctx
  );
  let { fm } = split;
  if (partial && (body.find((l) => !isBlank(l)) ?? "").startsWith("# ")) {
    ctx.report(
      "partial-h1",
      "starts with an H1 — the including page's title already renders one; drop it"
    );
  } else if (!partial) {
    const converted = convertFrontmatter(fm ?? [], body, ctx);
    fm = fm !== null || converted.fm.length > 0 ? converted.fm : null;
    ({ body } = converted);
  }
  reportCounts(ctx);
  const includes = [
    ...body.join("\n").matchAll(/<include[^>]*>(?<t>[^<]+)<\/include>/gu),
  ].map((m) => m.groups.t.trim());
  return {
    body,
    ctx,
    eol: source.includes("\r\n") ? "\r\n" : "\n",
    fm,
    hadFrontmatter: split.fm !== null,
    includes,
    rel,
  };
};

const resolveInclude = (run, fromAbs, target) =>
  target.startsWith("/")
    ? path.join(run.root, target)
    : path.resolve(path.dirname(fromAbs), target);

/** Does a page use an MDX-only feature, itself or through a partial it includes? */
const needsMdx = (run, abs, seen = new Set()) => {
  const page = run.pages.get(abs);
  if (!page || seen.has(abs)) {
    return false;
  }
  seen.add(abs);
  return (
    page.ctx.mdx ||
    page.includes.some((t) => needsMdx(run, resolveInclude(run, abs, t), seen))
  );
};

/** README.md → index.md (when the folder has none). */
const readmeTarget = (abs, page) => {
  const dir = path.dirname(abs);
  if (["index.md", "index.mdx"].some((n) => existsSync(path.join(dir, n)))) {
    page.ctx.report(
      "readme",
      "README.md beside an index page — MkDocs didn't publish it; delete it or keep it as /…/README"
    );
    return abs;
  }
  page.ctx.change(
    "rename",
    "README.md → index.md (Blume routes README at /…/README)"
  );
  return path.join(dir, "index.md");
};

/** README.md → index.md, and .md → .mdx where the page needs it. */
const planRename = (abs, page) => {
  if (isPartial(page.rel)) {
    return abs;
  }
  let next = /^readme\.md$/iu.test(path.basename(abs))
    ? readmeTarget(abs, page)
    : abs;
  if (page.mdx && /\.(?:md|markdown)$/u.test(next)) {
    next = next.replace(/\.(?:md|markdown)$/u, ".mdx");
    page.ctx.change("rename", "→ .mdx (uses MDX-only features)");
  }
  return next;
};

/** The directory a page's relative links resolve from (a partial's includer). */
const linkBase = (run, abs, page) => {
  if (!isPartial(page.rel)) {
    return path.dirname(abs);
  }
  const dirs = [
    ...new Set((run.includers.get(abs) ?? []).map((i) => path.dirname(i))),
  ];
  if (dirs.length === 1) {
    return dirs[0];
  }
  const relativeMdLink = /\]\((?![a-z][\w+.-]*:|#|\/)[^)]+\.md/iu;
  if (page.body.some((l) => relativeMdLink.test(l))) {
    page.ctx.report(
      "partial-links",
      "relative links in a partial resolve from each including page — check them by hand"
    );
  }
  return null;
};

const decideMdx = (run) => {
  for (const [abs, page] of run.pages) {
    for (const t of page.includes) {
      const target = resolveInclude(run, abs, t);
      run.includers.set(target, [...(run.includers.get(target) ?? []), abs]);
    }
  }
  for (const [abs, page] of run.pages) {
    const viaIncluder =
      isPartial(page.rel) &&
      (run.includers.get(abs) ?? []).some(
        (i) => i.endsWith(".mdx") || needsMdx(run, i)
      );
    page.mdx = abs.endsWith(".mdx") || needsMdx(run, abs) || viaIncluder;
  }
  for (const [abs, page] of run.pages) {
    const next = planRename(abs, page);
    if (next !== abs) {
      run.renamed.set(abs, next);
    }
  }
};

/**
 * Point `<include>`s at files this run renamed. A snippet that is itself a
 * page (not under `_`/`.`) publishes on its own too, as it did in MkDocs:
 * report it, since a partial usually belongs in `_snippets/`.
 */
const rewriteIncludes = (run, abs, page) => {
  page.body = mapFenced(page.body, (line) =>
    line.replace(
      /(?<open><include[^>]*>)(?<target>[^<]+)(?<close><\/include>)/u,
      (...m) => {
        const { close, open, target } = m.at(-1);
        const resolved = resolveInclude(run, abs, target.trim());
        const included = run.pages.get(resolved);
        if (included && !isPartial(included.rel)) {
          page.ctx.report(
            "include-page",
            `${target.trim()} is a page too (it publishes on its own) — move it under _snippets/ unless it should`
          );
        }
        const next = run.renamed.get(resolved);
        if (!next) {
          return m[0];
        }
        const rel = toPosix(path.relative(run.root, next));
        const local = toPosix(path.relative(path.dirname(abs), next));
        let out = local.startsWith(".") ? local : `./${local}`;
        if (target.startsWith("/")) {
          out = `/${rel}`;
        }
        page.ctx.change("include", `${target.trim()} → ${out}`);
        return `${open}${out}${close}`;
      }
    )
  );
};

const finishPages = (run) => {
  for (const [abs, page] of run.pages) {
    rewriteIncludes(run, abs, page);
    if (page.mdx) {
      page.body = rewriteForMdx(page.body, page.ctx);
      scanHazards(page.body, page.ctx);
    }
    const base = linkBase(run, abs, page);
    if (base) {
      page.body = rewriteLinks(page.body, base, run.renamed, page.ctx);
    }
  }
};

const pageText = (page) => {
  const fmBlock = page.fm === null ? [] : ["---", ...page.fm, "---"];
  const needsGap =
    fmBlock.length > 0 && !page.hadFrontmatter && page.body[0] !== "";
  return [...fmBlock, ...(needsGap ? [""] : []), ...page.body].join(page.eol);
};

const uniqueChanges = (changes) =>
  changes.filter(
    (c, i, all) =>
      all.findIndex((o) => o.kind === c.kind && o.detail === c.detail) === i
  );

const relToCwd = (p) => toPosix(path.relative(process.cwd(), p));

const writePage = (abs, target, text) => {
  mkdirSync(path.dirname(target), { recursive: true });
  if (target !== abs && existsSync(abs)) {
    renameSync(abs, target);
  }
  writeFileSync(target, text, "utf-8");
};

const writePages = (run) => {
  const report = [];
  let changed = 0;
  const sorted = [...run.pages].toSorted(([a], [b]) => a.localeCompare(b));
  for (const [abs, page] of sorted) {
    const text = pageText(page);
    const target = run.renamed.get(abs) ?? abs;
    const original = existsSync(abs) ? readFileSync(abs, "utf-8") : null;
    const isChanged = text !== original || target !== abs;
    if (isChanged) {
      changed += 1;
      if (run.write) {
        writePage(abs, target, text);
      }
    }
    if (page.ctx.changes.length > 0 || isChanged) {
      report.push({
        changes: uniqueChanges(page.ctx.changes),
        copiedFrom: page.copiedFrom ? relToCwd(page.copiedFrom) : undefined,
        file: relToCwd(abs),
        renamedTo: target === abs ? undefined : relToCwd(target),
      });
    }
  }
  return { changed, report };
};

// --- Site-level findings ---------------------------------------------------------

const configFindings = (config, missingNav) => {
  const out = config.plugins.map(
    (plugin) =>
      `plugin ${plugin}: ${PLUGIN_HINTS[plugin.replace(/^material\//u, "")] ?? "unknown — read what it does and report it"}`
  );
  const flags = [
    [
      config.inherit,
      `INHERIT: ${config.inherit} — merge it by hand; the codemod read both files for extensions, plugins, and nav`,
    ],
    [
      config.customDir,
      `theme.custom_dir ${config.customDir} — template overrides: read each one (banner, metatags, analytics, layout slots)`,
    ],
    [config.hooks, "hooks — read each hook and report what it did"],
    [
      config.extraCss,
      "extra_css — port what still applies to a project-root theme.css",
    ],
    [
      config.extraJs,
      "extra_javascript — delete math/mermaid loaders; script() the rest (a root-relative src loads under deployment.base)",
    ],
    [
      config.autoAppend.length > 0,
      `snippets auto_append ${config.autoAppend.join(", ")} — abbreviations: delete; link definitions: <include> the file at the end of each page that uses them (an included file's definitions resolve in the page)`,
    ],
    [
      !config.useDirectoryUrls,
      "use_directory_urls: false — every /x.html URL needs a redirect to /x",
    ],
    [
      config.mike,
      "extra.version provider mike — versioning (see the reference)",
    ],
    [
      config.alternate,
      "extra.alternate — a language selector: i18n (see the reference)",
    ],
  ];
  out.push(
    ...flags.filter(([on]) => on).map(([, text]) => text),
    ...missingNav.map(
      (f) =>
        `nav entry ${f} has no file — generated at build time? find the generator`
    )
  );
  return out;
};

const siteFindings = (run) => {
  const out = run.config ? configFindings(run.config, run.missingNav) : [];
  for (const name of [".pages", ".nav.yml", "SUMMARY.md", ".meta.yml"]) {
    const found = walkFiles(run.root, (n) => n === name);
    if (found.length > 0) {
      out.push(
        `${found.length} ${name} file(s) — convert to meta.ts / frontmatter, then delete`
      );
    }
  }
  return out;
};

// --- Driver -----------------------------------------------------------------------

const parseArgs = (argv) => {
  const configIndex = argv.indexOf("--config");
  const target = argv.find(
    (a, i) => !a.startsWith("--") && argv[i - 1] !== "--config"
  );
  return {
    asJson: argv.includes("--json"),
    explicit: configIndex === -1 ? null : argv[configIndex + 1],
    root: path.resolve(target),
    write: argv.includes("--write"),
  };
};

/**
 * The spellings a `nav` file can have on disk after an earlier run renamed
 * it: `page.md` as `page.mdx`, `README.md` as `index.md(x)`.
 */
const navSpellings = (file) => {
  const mdx = file.replace(/\.md$/u, ".mdx");
  const index = /(?:^|\/)readme\.md$/iu.test(file)
    ? ["index.md", "index.mdx"].map((n) =>
        path.posix.join(path.posix.dirname(file), n)
      )
    : [];
  return [file, mdx, ...index];
};

/** The `nav` title of a page, under any of its spellings. */
const navTitleFor = (config, rel) => {
  const md = rel.replace(/\.mdx$/u, ".md");
  const readme = /(?:^|\/)index\.mdx?$/u.test(rel)
    ? path.posix.join(path.posix.dirname(rel), "README.md")
    : null;
  return (
    config.nav.get(rel) ??
    config.nav.get(md) ??
    (readme ? config.nav.get(readme) : undefined) ??
    null
  );
};

const createRun = (argv) => {
  const args = parseArgs(argv);
  const configFile = findConfig(args.explicit, args.root);
  const config = configFile ? readConfig(configFile) : null;
  const configDir = config ? config.dir : process.cwd();
  const docsDir = path.resolve(configDir, config?.docsDir ?? "docs");
  const enabled = makeEnabled(config);
  const copies = new Map();
  const makeCtx = (abs) => {
    const changes = [];
    return {
      basePaths: config ? config.basePaths : [process.cwd()],
      change: (kind, detail) => changes.push({ detail, kind, mutating: true }),
      changes,
      configDir,
      copies,
      counts: { annotations: 0, deflist: 0, dollar: 0, emoji: 0, jinja: 0 },
      enabled,
      langMap: config?.langMap ?? {},
      mdx: false,
      navTitle: config
        ? navTitleFor(config, toPosix(path.relative(docsDir, abs)))
        : null,
      report: (kind, detail) => changes.push({ detail, kind, mutating: false }),
      root: args.root,
    };
  };
  // Before anything is renamed: nav entries whose file doesn't exist.
  const missingNav = config
    ? [...new Set(config.navFiles)]
        .toSorted()
        .filter(
          (f) => !navSpellings(f).some((s) => existsSync(path.join(docsDir, s)))
        )
    : [];
  return {
    ...args,
    config,
    configFile,
    copies,
    includers: new Map(),
    makeCtx,
    missingNav,
    pages: new Map(),
    renamed: new Map(),
  };
};

const pendingCopies = (run) =>
  [...run.copies]
    .filter(([rel]) => !run.pages.has(path.join(run.root, rel)))
    .toSorted(([a], [b]) => a.localeCompare(b));

const isPage = (name) => /\.(?:md|mdx|markdown)$/u.test(name);

const loadPages = (run) => {
  for (const abs of walkFiles(run.root, isPage)) {
    run.pages.set(abs, convertPage(abs, readFileSync(abs, "utf-8"), run));
  }
  // Snippets copied in from outside the root are partials too (and may copy more).
  for (let pending = pendingCopies(run); pending.length > 0;) {
    for (const [rel, source] of pending) {
      const abs = path.join(run.root, rel);
      const page = convertPage(abs, readFileSync(source, "utf-8"), run);
      page.copiedFrom = source;
      run.pages.set(abs, page);
    }
    pending = pendingCopies(run);
  }
};

const printEntry = (entry) => {
  const head = entry.renamedTo
    ? `${entry.file} → ${entry.renamedTo}`
    : entry.file;
  const copied = entry.copiedFrom ? ` (copied from ${entry.copiedFrom})` : "";
  process.stdout.write(`\n${head}${copied}\n`);
  const tally = new Map();
  for (const c of entry.changes.filter((x) => x.mutating)) {
    tally.set(c.kind, (tally.get(c.kind) ?? 0) + 1);
  }
  for (const [kind, n] of tally) {
    process.stdout.write(`  ${kind}: ${n}\n`);
  }
  for (const c of entry.changes.filter((x) => !x.mutating)) {
    process.stdout.write(`  ! ${c.kind}: ${c.detail}\n`);
  }
};

const printReport = (run, { changed, report }, site) => {
  const configName = run.configFile ? relToCwd(run.configFile) : null;
  if (run.asJson) {
    const json = { config: configName, files: report, site, wrote: run.write };
    process.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    `config: ${configName ?? "none found (converting every extension's syntax)"}\n`
  );
  for (const entry of report) {
    printEntry(entry);
  }
  if (site.length > 0) {
    const lines = site.map((s) => `  - ${s}\n`).join("");
    process.stdout.write(`\nNeeds a human (site-level):\n${lines}`);
  }
  const verb = run.write ? "changed" : "would change";
  const hint = run.write ? "" : " Re-run with --write to apply.";
  process.stdout.write(
    `\n${report.length} file(s) with findings, ${changed} ${verb}.${hint}\n`
  );
};

const HELP = [
  "mkdocs-codemod — MkDocs / Material for MkDocs content pass for Blume",
  "",
  "  node mkdocs-codemod.mjs [--config mkdocs.yml] <content-dir>          dry run (report only)",
  "  node mkdocs-codemod.mjs --write [--config mkdocs.yml] <content-dir>  apply in place",
  "  node mkdocs-codemod.mjs --json … <content-dir>                       JSON report",
  "",
].join("\n");

const main = () => {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  const run = createRun(argv);
  loadPages(run);
  decideMdx(run);
  finishPages(run);
  const result = writePages(run);
  printReport(run, result, siteFindings(run));
};

main();
