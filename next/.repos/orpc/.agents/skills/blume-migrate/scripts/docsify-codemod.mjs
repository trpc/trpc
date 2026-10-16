#!/usr/bin/env node
// docsify-codemod.mjs — the mechanical part of a Docsify → Blume migration.
// Point it at the folder that holds Docsify's index.html (it becomes Blume's
// `content.root`) and run it once, before any hand edits. It leaves fenced and
// indented code alone, except that MDX reads an indented block as prose, so
// a `.mdx` page gets the MDX-safe fixes there too. Per page it:
//
//   - converts `!>` / `?>` paragraphs and `> [!TYPE]` alerts (GitHub style and
//     flexible-alerts, `|label:…` included) to `:::` directives;
//   - converts docsify-tabs sets (`<!-- tabs:start -->`, bold-heading or
//     `<!-- tab:… -->` labels) to <Tabs>/<Tab>;
//   - turns `[x](path ':include …')` lines into <include>: Markdown, code with
//     its language, and mermaid, resolved from the page's folder as Docsify
//     did (a leading `/` included); a `:fragment=` is copied into its own file
//     beside the target where Docsify cut one (code includes, and Markdown
//     ones in v5); a missing target is reported (Docsify 4 rendered the whole
//     page blank when an include failed);
//   - rewrites `:id=` to a pinned `[#id]`, `{docsify-ignore}` to `[!toc]`, and
//     setext headings to ATX;
//   - rewrites page links the way Docsify resolved them (from the docs root
//     unless `relativePath: true`), including `#/route?id=x` hash links, `?id=`
//     anchors, and the old site's own absolute URLs (`--site`), to links
//     relative to the linking file, dropping an anchor that named the target's
//     title H1; rebases images (Docsify read a leading-slash one from the
//     page's folder too); strips `':target=…'`-style attribute strings from
//     links and images; makes relative raw-HTML `href`/`src` and `':ignore'`
//     links root paths (hash routing resolved them from `/`), except that an
//     `':ignore'` link to a page's own file, which opened the raw Markdown,
//     becomes a raw `<a href>` to the page's Markdown copy;
//   - converts emoji shortcodes to Unicode when given an emoji map (`--emoji`,
//     e.g. GitHub's `https://api.github.com/emojis` saved to a file);
//   - writes frontmatter: `title` from a leading H1 (deleted from the body,
//     later H1 sections demoted) or else from the sidebar label (every heading
//     demoted), `sidebar.label`, `seo.title` from a sidebar link title, and
//     `hidden: true` for pages the sidebar doesn't list;
//   - renames `README.md` to `index.md`, and a page that now needs MDX to
//     `.mdx` (HTML comments, `<br>`, void tags, and autolinks made MDX-safe);
//   - with `--group-folders`, moves each page into a folder per `_sidebar.md`
//     group, writes each folder's meta.ts and a root one that keeps the
//     groups in sidebar order, and writes the old → new route table
//     (`docsify-routes.json`) the hash redirect script reads. A
//     `homepage: "intro.md"` page also answered at `/intro`, so the table
//     maps that route too.
//
// `--snapshot <dir>` writes what the old site served: one HTML file per old
// route holding its headings with the ids Docsify gave them (v4 or v5 rules,
// checked against Docsify 4.13.1 and 5.0.0 in a browser), plus
// `old-routes.txt`. Feed the directory to pin-heading-ids.mjs as `--old`
// after the first build. Take the snapshot on the first run: it reads the
// pages as they are.
//
// It reports — and never fakes — what needs judgment: titles that may be
// section headings, media and remote includes, links it can't resolve, files
// that must move to `public/`, emoji it can't map, and MDX hazards left in a
// renamed page (indented code, table cells sharing a line with text, block
// elements in <p>, repeated attributes, braces in prose, <script>).
//
// Design constraints (as mintlify-codemod.mjs): zero dependencies, sorted and
// deterministic, idempotent (a second run changes nothing), dry run by default.
//
// Usage, from the directory that will hold blume.config.ts:
//   node docsify-codemod.mjs docs                                  # dry run
//   node docsify-codemod.mjs --write --snapshot .docsify-old docs  # apply
//   node docsify-codemod.mjs --write --group-folders docs          # also restructure
//   node docsify-codemod.mjs --json docs                           # JSON report
//
// Options:
//   --write              Apply the changes. Without it, report only.
//   --snapshot <dir>     Write the old site's heading ids and old-routes.txt.
//   --group-folders      Move pages into a folder per sidebar group, write
//                        meta.ts files and the route table.
//   --routes-out <file>  Where the route table goes (default:
//                        docsify-routes.json in the current directory).
//   --emoji <file>       A JSON or JS file mapping shortcode names to emoji
//                        image URLs or paths with `unicode/<hex>` in them.
//   --site <url>         The old site's address, to rewrite its own absolute
//                        `https://site/#/…` links.
//   --version 4|5        Docsify's major version (default: read index.html).
//   --relative-path true|false
//                        Docsify's `relativePath` (default: read index.html).
//   --sidebar <file>     The sidebar file (default: index.html's
//                        `loadSidebar`, else _sidebar.md).
//   --json               A machine-readable report.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const { posix } = path;

// --- Tables -------------------------------------------------------------------

// Alert and flexible-alerts types → Blume callouts. Docsify 5 and
// flexible-alerts both draw caution/attention/danger red.
const ALERTS = {
  attention: "danger",
  caution: "danger",
  danger: "danger",
  important: "note",
  info: "note",
  note: "note",
  tip: "tip",
  warning: "warning",
};

// Top-level frontmatter keys Blume accepts; anything else fails the build.
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

// A line the run deleted (a title H1, a setext underline).
const DELETED = "\u{0}";

// --- Patterns -----------------------------------------------------------------

const FENCE = /^\s*(?<marker>`{3,}|~{3,})/u;
const ATX = /^ {0,3}(?<hashes>#{1,6})(?:[ \t]+(?<text>.*?))?[ \t]*#*[ \t]*$/u;
const SETEXT = /^ {0,3}(?<rule>=+|-+)[ \t]*$/u;
const LIST_OR_QUOTE = /^\s*(?:[-*+]\s|\d+[.)]\s|>)/u;
const TABS_START = /^\s*<!-+\s+tabs:\s*start\s+-+>\s*$/u;
const TABS_END = /^\s*<!-+\s+tabs:\s*end\s+-+>\s*$/u;
const TAB_COMMENT = /^\s*<!-+\s+tab:\s*(?<label>.*?)\s+-+>\s*$/u;
const TAB_HEADING =
  /^\s*#{1,6}\s*(?:\*\*|__)\s*(?<label>.*?\S)\s*(?:\*\*|__)\s*$/u;
const LEADING_SPACE = /^\s*/u;
const LEGACY_CALLOUT = /^(?<indent>\s*)(?<mark>[!?])>\s?(?<body>.*)$/u;
const ALERT =
  /^(?<indent>\s*)>\s*\[!(?<kind>\w+)(?<options>(?:\|[^\]]*)?)\]\s*(?<body>.*)$/u;
const QUOTE_LINE = /^(?<indent>\s*)>\s?(?<body>.*)$/u;
const INCLUDE_LINE =
  /^(?<indent>\s*)\[[^\]]*\]\(\s*<?(?<target>[^\s)>]+)>?\s+(?<quote>["'])(?<options>(?:(?!\k<quote>).)*:include(?:(?!\k<quote>).)*)\k<quote>\s*\)\s*$/u;
const INLINE_INCLUDE = /\]\([^)]*["'][^"')]*:include/u;
const CONFIG_TOKEN = /(?:^|\s):(?<key>[\w-]+:?)=?(?<value>[\w%-]+)?/gu;
const HAS_CONFIG = /(?:^|\s):[\w-]+/u;
const IGNORE_COMMENT = /\s*<!--\s*\{docsify-ignore(?:-all)?\}\s*-->/u;
const IGNORE_BARE = /\s*\{docsify-ignore(?:-all)?\}/u;
const IGNORE_ALL = /\{docsify-ignore-all\}/u;
const HEADING_ID = /(?:^|\s):id=(?<id>[\w%-]+)/u;
const TOC_MARKER = /\s\[!toc\]/u;
const PIN_MARKER = /\s\[#[^\]\s]+\]|\s\{#[^}\s]+\}/u;
const LINK =
  /(?<!!)\[(?<text>(?:[^[\]]|\[[^\]]*\])*)\]\(\s*<?(?<href>[^\s)>]*)>?(?<title>(?:\s+(?:"[^"]*"|'[^']*'))?)\s*\)/gu;
const IMAGE =
  /!\[(?<text>[^\]]*)\]\(\s*<?(?<href>[^\s)>]*)>?(?<title>(?:\s+(?:"[^"]*"|'[^']*'))?)\s*\)/gu;
const RAW_URL_ATTR =
  /(?<start><(?:a|img|source|video|audio|iframe)\b[^>]*?\s(?:href|src)=)(?<quote>["'])(?<url>[^"']*)\k<quote>/giu;
const SHORTCODE = /:(?<name>[a-z0-9_+-]*[a-z0-9][a-z0-9_+-]*):/gu;
const URL_BEFORE = /(?:https?|ftp):\/?\/?\S*$/u;
const EMOJI_ENTRY =
  /["']?(?<name>[\w+-]+)["']?\s*:\s*["'][^"']*unicode\/(?<hex>[0-9a-f-]+)/giu;
const CODE_SPAN = /(?<ticks>`+)(?<code>[\s\S]*?[^`])\k<ticks>(?!`)/gu;
const HTML_TAG = /(?<tag><\/?[A-Za-z][^>]*>)/u;
const ANY_TAG = /<[^>]+>/gu;
const AUTOLINK = /<(?<url>(?:https?|ftp|mailto):[^\s>]+)>/gu;
const EXTERNAL = /:|\/\//u;
const SCHEME = /^[a-z][a-z0-9+.-]*:/iu;
const MD_EXT = /\.(?:md|markdown)$/iu;
const PAGE_EXT = /\.mdx?$/u;
const README = /(?:^|\/)README\.md$/iu;
const README_ROUTE = /(?<lead>^|\/)README$/iu;
const TRAILING_SLASHES = /(?<first>.)\/+$/u;
const ORDERING_PREFIX = /^\d+[-_.]/u;
const NOT_AN_ORDER = /^(?:\d+\.\d|\d{4}-\d{2}-\d{2}(?:[-_.]|$))/u;
const HTML_DOCUMENT = /^\s*(?:<!doctype html|<html)/iu;
const PUNCT =
  /[\u{2000}-\u{206F}\u{2E00}-\u{2E7F}\\'!"#$%&()*+,./:;<=>?@[\]^`{|}~]/gu;
const EMOJI_CHARS = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
const COMBINING = /[\u{0300}-\u{036F}]/gu;
const ENTITY_ESCAPE = /[<>"']|&(?!#?\w+;)/gu;
const ENTITIES = {
  '"': "&quot;",
  "&": "&amp;",
  "'": "&#39;",
  "<": "&lt;",
  ">": "&gt;",
};
const NAMED_ENTITY = /&(?<name>amp|lt|gt|quot);/gu;
const DECODE = { amp: "&", gt: ">", lt: "<", quot: '"' };
const UPPER = /[A-Z]+/gu;
const WHITESPACE = /\s/gu;
const WHITESPACE_RUN = /\s+/gu;
const DASH_RUN = /-+/gu;
const LEADING_DIGIT = /^(?<digit>\d)/u;
const MD_LINK_TEXT = /\[(?<text>[^\]]+)\]\([^)]+\)/gu;
const MD_IMAGE = /!\[[^\]]*\]\([^)]*\)/gu;
const MD_LINK_ANY = /\[(?<text>[^\]]*)\]\([^)]*\)/gu;
const MD_REF_LINK = /\[(?<text>[^\]]+)\]\[[^\]]*\]/gu;
const STRONG = /(?<mark>\*\*\*|\*\*|\*)(?=\S)(?<inner>[\s\S]*?\S)\k<mark>/gu;
const UNDERSCORE =
  /(?<lead>^|[^\p{L}\p{N}_])(?<mark>___|__|_)(?=\S)(?<inner>[\s\S]*?\S)\k<mark>(?![\p{L}\p{N}_])/gu;
const STRIKE = /~~(?=\S)(?<inner>[\s\S]*?\S)~~/gu;
const BACKSLASH = /\\(?<char>[\\`*_{}[\]()#+\-.!])/gu;
const WORD = /\p{L}{3,}/gu;
const NON_ALNUM = /[^\p{L}\p{N}]+/gu;
const EDGE_DASHES = /^-+|-+$/gu;
const SEPARATORS = /[-_]+/gu;
const FIRST_LETTER = /^\w/u;
const MDX_ONLY =
  /^\s*:::|<Tabs\b|^\s*(?:`{3,}|~{3,})\s*mermaid\b|<include lang="mermaid"/u;
const COMMENT_OPEN = /<!-+/gu;
const COMMENT_CLOSE = /-+->/gu;
const MDX_COMMENT = /\{\/\*.*?\*\/\}/gu;
const VOID_TAG =
  /<(?<tag>br|hr|img|input|source|wbr)\b(?<rest>[^>]*?)\s*\/?>/giu;
const CLOSE_BR = /<\/br\s*>/giu;
const INDENTED = /^(?: {4,}|\t)\S/u;
const CELL_WITH_TEXT =
  /<\/?(?:td|th|tr)\b[^>]*>\s*\S.*$|^\s*\S.*<(?:td|th|tr)\b/iu;
const P_WITH_BLOCK =
  /<p\b[^>]*>(?:(?!<\/p>)[\s\S])*?<(?:h[1-6]|div|ul|ol|table|p|pre|blockquote)\b/giu;
const TAG_ATTRIBUTES = /<[A-Za-z][\w-]*\s(?<attributes>[^<>]*)>/gu;
const ATTRIBUTE_NAME = /(?<name>[\w:-]+)\s*=/gu;
const BRACE = /[{}]/u;
const SCRIPT = /<script\b/iu;
const UPDATED = /\s*\{docsify-updated\}/u;
const VERSION_5 =
  /\/docsify@5|\/docsify(?:@[\w.-]+)?\/dist\/docsify(?:\.module)?(?:\.min)?\.js|new Docsify\s*\(/u;
const SIDEBAR_OPTION = /loadSidebar\s*:\s*["'](?<file>[^"']+)["']/u;
const NAVBAR_OPTION = /loadNavbar\s*:\s*["'](?<file>[^"']+)["']/u;
const COVER_OPTION = /coverpage\s*:\s*["'](?<file>[^"']+)["']/u;
const HOMEPAGE_OPTION = /homepage\s*:\s*["'](?<file>[^"']+)["']/u;
const HISTORY_OPTION = /routerMode\s*:\s*["']history["']/u;
const NO_EMOJI_OPTION = /noEmoji\s*:\s*true/u;
const RELATIVE_OPTION = /relativePath\s*:\s*true/u;
const HTML_COMMENTS = /<!--[\s\S]*?-->/gu;
const BLOCK_COMMENTS = /\/\*[\s\S]*?\*\//gu;
const LINE_COMMENTS = /^\s*\/\/.*$/gmu;
const SIDEBAR_ITEM = /^(?<indent>\s*)[-*+]\s+(?<item>.*)$/u;
const SIDEBAR_LINK =
  /^\[(?<label>[^\]]*)\]\(\s*<?(?<href>[^\s)>]+)>?(?:\s+(?<quote>["'])(?<title>.*?)\k<quote>)?\s*\)/u;
const HASH_PREFIX = /^#(?=\/)/u;
const NAV_LINK = /\]\(\s*<?(?<href>[^\s)>"']+)/gu;
const QUERY = /\?.*$/u;
const LEADING_SLASHES = /^\/+/u;
const SITE_SLASHES = /\/+$/u;
const FRONT_KEY = /^(?<key>[\w-]+):/u;
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/gu;
const ROUTE_EXT = /\.(?:md|html)$/iu;
const MMD = /\.mmd$/iu;
const HTML_EXT = /\.html?$/iu;
const VIDEO = /\.(?:mp4|ogg)$/iu;
const AUDIO = /\.mp3$/iu;
const INDEX_ROUTE = /(?<lead>^|\/)index$/u;
const QUOTES = /^["']|["']$/gu;
const LEADING_HASH = /^(?<indent>\s*)#/u;
const INDEX_STEM = /^(?:readme|index)$/iu;
const PARENTHESES = /^\((?<name>.*)\)$/u;

// --- Small helpers ------------------------------------------------------------

const yamlString = (value) => JSON.stringify(value);

const stripOrder = (name) =>
  NOT_AN_ORDER.test(name) ? name : name.replace(ORDERING_PREFIX, "");

const slugifyFolder = (label) =>
  label
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll(COMBINING, "")
    .replaceAll(NON_ALNUM, "-")
    .replaceAll(EDGE_DASHES, "") || "group";

/**
 * A path relative to a page's folder, from the docs root. Docsify fetched
 * `../x` from a root-level page as `/../x`, which the browser reads as `/x`,
 * so a path can't climb out of the root.
 */
const docsPath = (fromDir, target) => {
  let joined = posix.normalize(posix.join(fromDir, target));
  while (joined.startsWith("../")) {
    joined = joined.slice(3);
  }
  return joined === ".." ? "." : joined;
};

/** A path from one docs-root file to another, written `./x` or `../x`. */
const relativeFile = (fromFile, toFile) => {
  const relative = posix.relative(posix.dirname(fromFile), toFile);
  return relative.startsWith(".") ? relative : `./${relative}`;
};

/** The new route a page file publishes at. */
const routeOfPage = (file) =>
  `/${file.replace(PAGE_EXT, "").split("/").map(stripOrder).join("/")}`
    .replace(INDEX_ROUTE, "$<lead>")
    .replace(TRAILING_SLASHES, "$<first>") || "/";

const humanize = (stem) =>
  stem
    .replaceAll(SEPARATORS, " ")
    .replace(FIRST_LETTER, (first) => first.toUpperCase())
    .trim();

const stemOf = (file) => posix.basename(file, posix.extname(file));

/** A sidebar slug for a path segment: numeric prefix and parentheses gone. */
const childSlug = (segment) =>
  stripOrder(segment.replace(PAGE_EXT, "")).replace(PARENTHESES, "$<name>");

/** Four columns of indentation (a tab counts as four) is an indented code block. */
const isCodeIndent = (indent) => indent.replaceAll("\t", "    ").length >= 4;

/** The sidebar, navbar, cover, and 404 files Docsify loads around a page. */
const isNavFile = (name, settings) =>
  name === settings.sidebar ||
  name === settings.navbar ||
  name === settings.cover ||
  name === "_404.md";

// `match` gives null for no words, and `new Set(null)` is empty.
const words = (value) => new Set(value.toLowerCase().match(WORD));

/** Toggle the comment state across one line's `<!--` and `-->` markers. */
const commentAfter = (line, inComment) => {
  let comment = inComment;
  let cursor = 0;
  for (;;) {
    const marker = comment ? "-->" : "<!--";
    const at = line.indexOf(marker, cursor);
    if (at === -1) {
      return comment;
    }
    comment = !comment;
    cursor = at + marker.length;
  }
};

const closesFence = (line, fence) => {
  const marker = FENCE.exec(line)?.groups.marker;
  return (
    marker !== undefined &&
    marker[0] === fence[0] &&
    marker.length >= fence.length &&
    line.trim() === marker
  );
};

/**
 * The block a line sits in, from the one before it: an indented code block
 * starts after a blank line or a heading, outside a list, and runs on
 * through indented and blank lines.
 */
const nextBlock = (line, block, comment) => {
  const blank = line.trim() === "";
  const [indent] = LEADING_SPACE.exec(line);
  const starts = block.indented || (block.opens && !block.list);
  const indented = !(blank || comment) && isCodeIndent(indent) && starts;
  const list =
    blank || indented
      ? block.list
      : LIST_OR_QUOTE.test(line) || (block.list && indent !== "");
  return { indented, list, opens: blank || ATX.test(line) };
};

/** Line states: in a fenced code block, an indented one, or an HTML comment? */
const scanLines = (lines) => {
  const states = [];
  let fence = null;
  let comment = false;
  let block = { indented: false, list: false, opens: true };
  for (const line of lines) {
    if (fence) {
      states.push({ comment: false, fence: true, indented: false });
      fence = closesFence(line, fence) ? null : fence;
      block.indented = false;
      block.opens = fence === null;
      continue;
    }
    block = nextBlock(line, block, comment);
    const open = block.indented ? null : FENCE.exec(line);
    if (open && !comment) {
      fence = open.groups.marker;
      states.push({ comment: false, fence: true, indented: false });
      block.opens = false;
      continue;
    }
    const { indented } = block;
    const opensComment =
      !indented && line.trimStart().startsWith("<!--") && !line.includes("-->");
    states.push({ comment: comment || opensComment, fence: false, indented });
    comment = indented ? comment : commentAfter(line, comment);
  }
  return states;
};

/** A line Docsify showed as code: fenced or indented. */
const inCode = (state) => state.fence || state.indented;

/** Mask inline code so link and emoji rewrites skip it. */
const maskCode = (line) =>
  line.replaceAll(CODE_SPAN, (span) => DELETED.repeat(span.length));

/** Docsify's getAndRemoveConfig: `:key=value` tokens out of a title string. */
const parseConfig = (raw) => {
  const config = new Map();
  const rest = raw
    .replaceAll(QUOTES, "")
    .replaceAll(CONFIG_TOKEN, (token, key, value) => {
      if (key.includes(":")) {
        return token;
      }
      config.set(key, value ?? "");
      return "";
    })
    .trim();
  return { config, rest };
};

/** A route or href split into its path and its anchor (`?id=x` or `#x`). */
const splitAnchor = (value) => {
  let routePath = value;
  let anchor = "";
  const query = routePath.indexOf("?");
  if (query !== -1) {
    anchor = new URLSearchParams(routePath.slice(query + 1)).get("id") ?? "";
    routePath = routePath.slice(0, query);
  }
  const hash = routePath.indexOf("#");
  if (hash !== -1) {
    anchor = routePath.slice(hash + 1);
    routePath = routePath.slice(0, hash);
  }
  return { anchor, path: routePath };
};

// --- Docsify heading ids --------------------------------------------------------

/** Strip Markdown emphasis the way marked does: `_` only at word boundaries. */
const stripEmphasis = (text) =>
  text
    .replaceAll(STRONG, "$<inner>")
    .replaceAll(UNDERSCORE, "$<lead>$<inner>")
    .replaceAll(STRIKE, "$<inner>");

const escapeText = (text) =>
  text.replaceAll(ENTITY_ESCAPE, (character) => ENTITIES[character]);

/** marked's inline rendering of plain text (not code, not a tag). */
const inlineText = (text) => {
  const plain = stripEmphasis(
    text
      .replaceAll(MD_IMAGE, "")
      .replaceAll(MD_LINK_ANY, "$<text>")
      .replaceAll(MD_REF_LINK, "$<text>")
  ).replaceAll(BACKSLASH, "$<char>");
  return escapeText(plain);
};

/** Text with raw HTML tags kept and everything between them rendered. */
const renderInlineChunk = (chunk) =>
  chunk
    .split(HTML_TAG)
    .map((piece, index) => (index % 2 === 1 ? piece : inlineText(piece)))
    .join("");

/** marked 1.x's inline HTML for a heading: what Docsify 4 slugs. */
const markedInline = (source) => {
  let html = "";
  let cursor = 0;
  const text = source.replaceAll(AUTOLINK, "$<url>");
  for (const span of text.matchAll(CODE_SPAN)) {
    html += renderInlineChunk(text.slice(cursor, span.index));
    html += `<code>${escapeText(span.groups.code.trim())}</code>`;
    cursor = span.index + span[0].length;
  }
  return html + renderInlineChunk(text.slice(cursor));
};

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

/** Docsify 4.13's slugify, on marked's inline HTML. */
const slugV4 = (html) =>
  removeAll(html.trim(), ANY_TAG)
    .replaceAll(UPPER, (upper) => upper.toLowerCase())
    .replaceAll(PUNCT, "")
    .replaceAll(WHITESPACE, "-")
    .replaceAll(DASH_RUN, "-")
    .replace(LEADING_DIGIT, "_$<digit>");

/** Docsify 5's slugify, on the heading's raw text. */
const slugV5 = (text) =>
  removeAll(
    text
      .trim()
      .normalize("NFC")
      .replaceAll(MD_LINK_TEXT, "$<text>")
      .replaceAll("\u{FE0F}", "")
      .replaceAll(EMOJI_CHARS, ""),
    ANY_TAG
  )
    .replaceAll(UPPER, (upper) => upper.toLowerCase())
    .replaceAll(PUNCT, "")
    .replaceAll(WHITESPACE, "-")
    .replace(LEADING_DIGIT, "_$<digit>");

/** A heading's text with its Markdown and HTML markup gone. */
const plainText = (source) =>
  removeAll(markedInline(source), ANY_TAG)
    .replaceAll(NAMED_ENTITY, (_, name) => DECODE[name])
    .replaceAll("&#39;", "'")
    .replaceAll(WHITESPACE_RUN, " ")
    .trim();

/** The text a reader saw in the heading (emoji images had none). */
const visibleText = (source) =>
  plainText(source)
    .replaceAll(SHORTCODE, "")
    .replaceAll(WHITESPACE_RUN, " ")
    .trim();

const withoutConfig = (text) =>
  text
    .replace(IGNORE_COMMENT, "")
    .replace(IGNORE_BARE, "")
    .replaceAll(CONFIG_TOKEN, (token, key) => (key.includes(":") ? token : ""));

/** The id Docsify gave one heading, before its page's duplicate counter. */
const docsifyBaseId = (rawText, version) => {
  const custom = HEADING_ID.exec(rawText)?.groups.id;
  if (custom) {
    return slugV4(custom);
  }
  return version === 5
    ? slugV5(rawText)
    : slugV4(markedInline(withoutConfig(rawText)));
};

// --- Site discovery -------------------------------------------------------------

/** index.html with commented-out code removed (`// routerMode: 'history'`). */
const readIndexHtml = (root) => {
  const index = path.join(root, "index.html");
  return existsSync(index)
    ? removeAll(readFileSync(index, "utf-8"), HTML_COMMENTS)
        .replaceAll(BLOCK_COMMENTS, "")
        .replaceAll(LINE_COMMENTS, "")
    : "";
};

const readSettings = (root, options) => {
  const html = readIndexHtml(root);
  const homepage = HOMEPAGE_OPTION.exec(html)?.groups.file;
  const relativeOption = options.get("relative-path");
  const version = options.get("version");
  const detected = VERSION_5.test(html) ? 5 : 4;
  return {
    cover: COVER_OPTION.exec(html)?.groups.file ?? "_coverpage.md",
    history: HISTORY_OPTION.test(html),
    homepage: homepage && !EXTERNAL.test(homepage) ? homepage : "README.md",
    navbar: NAVBAR_OPTION.exec(html)?.groups.file ?? "_navbar.md",
    noEmoji: NO_EMOJI_OPTION.test(html),
    relativePath:
      relativeOption === undefined
        ? RELATIVE_OPTION.test(html)
        : relativeOption === "true",
    sidebar:
      options.get("sidebar") ??
      SIDEBAR_OPTION.exec(html)?.groups.file ??
      "_sidebar.md",
    version: version ? Number(version) : detected,
  };
};

const listFiles = (root, dir = "") => {
  const out = [];
  for (const name of readdirSync(path.join(root, dir)).toSorted()) {
    const rel = dir ? `${dir}/${name}` : name;
    const stat = statSync(path.join(root, rel), { throwIfNoEntry: false });
    if (name === "node_modules" || name.startsWith(".") || !stat) {
      continue;
    }
    out.push(...(stat.isDirectory() ? listFiles(root, rel) : [rel]));
  }
  return out;
};

const isPartialPath = (rel) =>
  rel.split("/").some((part) => part.startsWith("_"));

/** A Docsify route for a page file: no extension, README as its folder. */
const routeOfFile = (rel, settings) => {
  if (rel === settings.homepage) {
    return "/";
  }
  const route = `/${rel.replace(MD_EXT, "")}`;
  return (
    route
      .replace(README_ROUTE, "$<lead>")
      .replace(TRAILING_SLASHES, "$<first>") || "/"
  );
};

/** The file a Docsify route (after `#`) loads, relative to the docs root. */
const fileOfRoute = (route, settings) => {
  let file = route.replace(LEADING_SLASHES, "");
  if (file === "" || file === "README" || file === "README.md") {
    return settings.homepage;
  }
  if (file.endsWith("/")) {
    file += "README.md";
  } else if (!ROUTE_EXT.test(file)) {
    file += ".md";
  }
  return posix.normalize(file);
};

/** A page file as it exists now: a rerun finds `x.mdx` and `index.md`. */
const existingPage = (root, file) => {
  const candidates = [file, file.replace(MD_EXT, ".mdx")];
  if (README.test(file)) {
    const dir = posix.dirname(file);
    candidates.push(posix.join(dir, "index.md"), posix.join(dir, "index.mdx"));
  }
  return candidates.find((candidate) => existsSync(path.join(root, candidate)));
};

const sidebarItem = (text, stack) => {
  // An icon inside the label (`[![x](x.svg)Name](url)`) isn't the link.
  const link = SIDEBAR_LINK.exec(text.replaceAll(MD_IMAGE, ""));
  if (!link) {
    return null;
  }
  const { href, label, title } = link.groups;
  return {
    groups: stack.map((entry) => entry.label),
    href,
    label: label.trim(),
    title: title ? parseConfig(title).rest || undefined : undefined,
  };
};

/** Parse a sidebar into items with their group path. */
const parseSidebar = (text) => {
  const items = [];
  const stack = [];
  for (const line of text.split("\n")) {
    const match = SIDEBAR_ITEM.exec(line);
    if (!match) {
      continue;
    }
    const depth = match.groups.indent.replaceAll("\t", "  ").length;
    while (stack.length > 0 && stack.at(-1).depth >= depth) {
      stack.pop();
    }
    const item = sidebarItem(match.groups.item.trim(), stack);
    if (item) {
      items.push(item);
    }
    stack.push({ depth, label: item?.label ?? match.groups.item.trim() });
  }
  return items;
};

const loadEmoji = (file) => {
  const map = new Map();
  if (!file) {
    return map;
  }
  for (const match of readFileSync(file, "utf-8").matchAll(EMOJI_ENTRY)) {
    const points = match.groups.hex
      .split("-")
      .map((hex) => Number.parseInt(hex, 16));
    map.set(match.groups.name, String.fromCodePoint(...points));
  }
  return map;
};

// --- Findings -----------------------------------------------------------------

/** A finding for a line, by its index in `page.lines` at the time. */
const review = (page, index, message) => {
  page.reviews.push({ index, message });
};

/** After a step rebuilt `page.lines`, move each finding to its line's new index. */
const remapReviews = (page, remap) => {
  for (const finding of page.reviews) {
    finding.index = remap[finding.index] ?? finding.index;
  }
};

const count = (page, kind) => {
  page.edits[kind] = (page.edits[kind] ?? 0) + 1;
};

// --- Page conversion steps --------------------------------------------------------

const isSetextUnderline = (lines, states, index) => {
  const previous = lines[index - 1];
  return (
    SETEXT.test(lines[index]) &&
    !inCode(states[index]) &&
    !inCode(states[index - 1]) &&
    !states[index].comment &&
    previous.trim() !== "" &&
    !LIST_OR_QUOTE.test(previous) &&
    !ATX.test(previous) &&
    !previous.trimStart().startsWith("<") &&
    (index < 2 || lines[index - 2].trim() === "")
  );
};

const setextToAtx = (page) => {
  const { lines } = page;
  const states = scanLines(lines);
  for (let index = 1; index < lines.length; index += 1) {
    if (isSetextUnderline(lines, states, index)) {
      const { rule } = SETEXT.exec(lines[index]).groups;
      const level = rule.startsWith("=") ? "#" : "##";
      lines[index - 1] = `${level} ${lines[index - 1].trim()}`;
      lines[index] = DELETED;
      count(page, "setext heading → ATX");
    }
  }
};

const tabLabel = (line) =>
  (TAB_COMMENT.exec(line) ?? TAB_HEADING.exec(line))?.groups.label.trim();

/** docsify-tabs sets → <Tabs>/<Tab>, with one blank line inside each tab. */
const convertTabs = (page) => {
  const states = scanLines(page.lines);
  const out = [];
  const remap = [];
  let indent = null;
  let tabOpen = false;
  const blankLast = () => out.length > 0 && out.at(-1).trim() === "";
  const closeTab = () => {
    if (tabOpen && !blankLast()) {
      out.push("");
    }
    if (tabOpen) {
      out.push(`${indent}</Tab>`);
    }
    tabOpen = false;
  };
  for (const [index, line] of page.lines.entries()) {
    remap[index] = out.length;
    const code = inCode(states[index]);
    const label = indent === null || code ? undefined : tabLabel(line);
    if (!code && TABS_START.test(line)) {
      [indent] = LEADING_SPACE.exec(line);
      out.push(`${indent}<Tabs>`);
      count(page, "tab set → <Tabs>");
    } else if (indent !== null && !code && TABS_END.test(line)) {
      closeTab();
      out.push(`${indent}</Tabs>`);
      indent = null;
    } else if (label !== undefined) {
      closeTab();
      out.push(`${indent}<Tab title=${yamlString(label)}>`, "");
      tabOpen = true;
    } else if (!(indent !== null && line.trim() === "" && blankLast())) {
      out.push(line);
    }
  }
  if (indent !== null) {
    review(
      page,
      out.length - 1,
      "a tab set has no `<!-- tabs:end -->`; closed it at the end of the page"
    );
    closeTab();
    out.push(`${indent}</Tabs>`);
  }
  remapReviews(page, remap);
  page.lines = out;
};

/** The last line of the paragraph a `!>` or `?>` callout starts. */
const paragraphEnd = (lines, states, start) => {
  let end = start;
  while (
    end + 1 < lines.length &&
    lines[end + 1].trim() !== "" &&
    !inCode(states[end + 1]) &&
    !ATX.test(lines[end + 1])
  ) {
    end += 1;
  }
  return end;
};

const legacyCallout = (page, lines, states, index) => {
  const match = LEGACY_CALLOUT.exec(lines[index]);
  // `!>` starts a callout only where a paragraph starts.
  const startsParagraph =
    index === 0 ||
    lines[index - 1].trim() === "" ||
    ATX.test(lines[index - 1]) ||
    states[index - 1].fence;
  // Four columns in, it's an indented code block, which Docsify showed as code.
  if (!(match && startsParagraph) || isCodeIndent(match.groups.indent)) {
    return null;
  }
  const { body, indent, mark } = match.groups;
  const end = paragraphEnd(lines, states, index);
  const type = mark === "!" ? "warning" : "tip";
  count(page, `${mark}> → :::${type}`);
  return {
    end,
    lines: [
      `${indent}:::${type}`,
      `${indent}${body}`,
      ...lines.slice(index + 1, end + 1),
      `${indent}:::`,
    ],
  };
};

const alertCallout = (page, lines, states, index) => {
  const match = ALERT.exec(lines[index]);
  if (!match || isCodeIndent(match.groups.indent)) {
    return null;
  }
  const { body, indent, kind, options } = match.groups;
  const type = ALERTS[kind.toLowerCase()] ?? "note";
  if (!ALERTS[kind.toLowerCase()]) {
    review(
      page,
      index,
      `custom alert type [!${kind}] became :::note; pick the closest callout`
    );
  }
  const settings = options.slice(1).split("|").filter(Boolean);
  const label = settings
    .find((option) => option.startsWith("label:"))
    ?.slice(6)
    .trim();
  if (settings.some((option) => !option.startsWith("label:"))) {
    count(page, "alert options dropped (style, icon, …)");
  }
  const content = body ? [`${indent}${body}`] : [];
  let end = index;
  while (
    end + 1 < lines.length &&
    QUOTE_LINE.test(lines[end + 1]) &&
    !inCode(states[end + 1])
  ) {
    end += 1;
    const quoted = QUOTE_LINE.exec(lines[end]).groups;
    content.push(`${quoted.indent}${quoted.body}`);
  }
  count(page, `[!${kind.toUpperCase()}] → :::${type}`);
  const opener = `${indent}:::${type}${label ? `[${label}]` : ""}`;
  return { end, lines: [opener, ...content, `${indent}:::`] };
};

const convertCallouts = (page) => {
  const { lines } = page;
  const states = scanLines(lines);
  const out = [];
  const remap = [];
  for (let index = 0; index < lines.length; index += 1) {
    remap[index] = out.length;
    const skip = inCode(states[index]) || states[index].comment;
    const callout = skip
      ? null
      : (legacyCallout(page, lines, states, index) ??
        alertCallout(page, lines, states, index));
    if (callout) {
      out.push(...callout.lines);
      index = callout.end;
    } else {
      out.push(lines[index]);
    }
  }
  remapReviews(page, remap);
  page.lines = out;
};

/** The content between `### [name]` / `/// [name]` markers, dedented. */
const extractFragment = (text, name, version) => {
  const escaped = name.replaceAll(REGEX_SPECIAL, "\\$&");
  const marker = `(?:###|\\/\\/\\/)\\s*\\[${escaped}\\]`;
  const body = version === 5 ? "(?<body>[\\s\\S]*?)" : "(?<body>[\\s\\S]*)";
  const found = new RegExp(`${marker}${body}${marker}`, "u").exec(text);
  if (!found) {
    return null;
  }
  const lines = found.groups.body.split("\n");
  const indents = lines
    .filter((line) => line.trim() !== "")
    .map((line) => LEADING_SPACE.exec(line)[0].length);
  const indent = indents.length > 0 ? Math.min(...indents) : 0;
  return lines
    .map((line) => line.slice(indent))
    .join("\n")
    .trim();
};

/** Docsify's embed type: an explicit `:type=`, else by extension. */
const includeType = (config, target) => {
  const explicit = config.get("type");
  if (explicit) {
    return explicit;
  }
  if (MD_EXT.test(target)) {
    return "markdown";
  }
  if (MMD.test(target)) {
    return "mermaid";
  }
  if (HTML_EXT.test(target)) {
    return "iframe";
  }
  if (VIDEO.test(target)) {
    return "video";
  }
  return AUDIO.test(target) ? "audio" : "code";
};

/** A `:fragment=`'s lines, copied to a file beside its target. */
const fragmentFile = (page, index, ctx, { config, file, target }) => {
  const name = config.get("fragment");
  const fragment = extractFragment(
    readFileSync(path.join(ctx.root, file), "utf-8"),
    name,
    ctx.settings.version
  );
  if (fragment === null) {
    review(page, index, `fragment [${name}] not found in ${target}`);
    return null;
  }
  const ext = posix.extname(file);
  const prefix = MD_EXT.test(ext) && !isPartialPath(file) ? "_" : "";
  const copy = posix.join(
    posix.dirname(file),
    `${prefix}${stemOf(file)}.${name}${ext}`
  );
  ctx.newFiles.set(copy, `${fragment}\n`);
  review(
    page,
    index,
    `fragment [${name}] copied to ${copy}; if ${target} is generated, have its generator write that file`
  );
  count(page, "fragment include → copied file");
  return copy;
};

const includeLanguage = (page, index, { file, rest, target, type }) => {
  if (type === "mermaid") {
    return "mermaid";
  }
  if (type === "code") {
    const [lang] = rest.split(WHITESPACE_RUN);
    return lang || (MD_EXT.test(file) ? "markdown" : "");
  }
  if (!MD_EXT.test(file)) {
    review(
      page,
      index,
      `${target} is included as Markdown, but Blume splices only .md and .mdx as content: give it a .md name (a symlink works)`
    );
  }
  return "";
};

/** Report an include the run leaves as it is; true when it does. */
const reviewUnconvertedInclude = (page, index, include, ctx) => {
  const { file, target, type } = include;
  if (EXTERNAL.test(target)) {
    review(
      page,
      index,
      `remote include ${target}: vendor the file into the content root, or fetch the page with mdxRemote()`
    );
    return true;
  }
  if (["audio", "iframe", "video"].includes(type)) {
    review(
      page,
      index,
      `${type} embed of ${target}: write a raw <${type}> (the file goes in public/), or <YouTube>`
    );
    return true;
  }
  if (!existsSync(path.join(ctx.root, file))) {
    review(
      page,
      index,
      `include target ${target} doesn't exist; Docsify 4 rendered this whole page blank. Repoint it or drop it`
    );
    return true;
  }
  return false;
};

/**
 * Docsify 4 cuts a `:fragment=` out of code includes only; it showed a
 * Markdown or mermaid include whole. Docsify 5 cuts Markdown ones too.
 */
const takesFragment = (type, version) =>
  type === "code" || (version === 5 && type === "markdown");

const convertInclude = (page, index, ctx) => {
  const match = INCLUDE_LINE.exec(page.lines[index]);
  if (!match) {
    if (INLINE_INCLUDE.test(page.lines[index])) {
      review(
        page,
        index,
        "an include inside other text: put it on its own line, then convert it"
      );
    }
    return;
  }
  const { indent, options, target } = match.groups;
  if (isCodeIndent(indent)) {
    return;
  }
  const { config, rest } = parseConfig(options);
  // Docsify joins the page's folder and the target even when the target
  // starts with `/`, so `/x` from `guide/page.md` loaded `guide/x`.
  const file = docsPath(posix.dirname(page.rel), target);
  const type = includeType(config, target);
  const include = { config, file, rest, target, type };
  if (reviewUnconvertedInclude(page, index, include, ctx)) {
    return;
  }
  if (config.has("fragment") && takesFragment(type, ctx.settings.version)) {
    include.file = fragmentFile(page, index, ctx, include);
  } else if (config.has("fragment")) {
    review(
      page,
      index,
      `Docsify ${ctx.settings.version} ignored :fragment= on a ${type} include and showed all of ${target}, so it's included whole`
    );
  }
  if (include.file === null) {
    return;
  }
  const lang = includeLanguage(page, index, include);
  page.includes.push({ file: include.file, lang });
  const into = ctx.moves.get(page.rel) ?? page.rel;
  const relative = relativeFile(
    into,
    ctx.moves.get(include.file) ?? include.file
  );
  const attribute = lang ? ` lang="${lang}"` : "";
  page.lines[index] = `${indent}<include${attribute}>${relative}</include>`;
  count(
    page,
    type === "code"
      ? "code include → <include lang>"
      : `${type} include → <include>`
  );
};

const convertIncludes = (page, ctx) => {
  const states = scanLines(page.lines);
  for (const index of page.lines.keys()) {
    if (!(inCode(states[index]) || states[index].comment)) {
      convertInclude(page, index, ctx);
    }
  }
};

/** One heading's `:id=` and docsify-ignore, as Blume markers. */
const headingMarkers = (page, text, ignoreAll) => {
  let rest = text;
  let toc = ignoreAll;
  for (const pattern of [IGNORE_COMMENT, IGNORE_BARE]) {
    if (pattern.test(rest)) {
      rest = rest.replace(pattern, "");
      toc = true;
    }
  }
  const custom = HEADING_ID.exec(rest)?.groups.id;
  const pin = custom ? ` [#${slugV4(custom)}]` : "";
  if (custom) {
    rest = rest.replace(HEADING_ID, "");
    count(page, ":id= → [#id]");
  }
  const marker = toc && !TOC_MARKER.test(` ${rest}`) ? " [!toc]" : "";
  if (marker) {
    count(page, "docsify-ignore → [!toc]");
  }
  return `${rest.trim()}${marker}${pin}`;
};

const convertHeadingAttributes = (page) => {
  const states = scanLines(page.lines);
  const headings = page.lines
    .map((line, index) => ({ index, match: ATX.exec(line) }))
    .filter(
      ({ index, match }) =>
        match?.groups.text !== undefined &&
        !inCode(states[index]) &&
        !states[index].comment
    );
  const ignoreAll = headings.some(({ match }) =>
    IGNORE_ALL.test(match.groups.text)
  );
  for (const { index, match } of headings) {
    const text = headingMarkers(page, match.groups.text, ignoreAll);
    page.lines[index] = `${match.groups.hashes} ${text}`;
  }
};

/** The route an absolute link to the old site's own hash URL names, if any. */
const siteRoute = (href, site) => {
  const rest = href.slice(site.length) || "/";
  if (rest.startsWith("/#/")) {
    return rest.slice(2);
  }
  return rest.startsWith("#/") ? rest.slice(1) : null;
};

/** Docsify's link target for an href on a page: a route and an anchor. */
const resolveDocsifyHref = (href, page, ctx) => {
  if (ctx.site && href.toLowerCase().startsWith(ctx.site)) {
    const route = siteRoute(href, ctx.site);
    return route === null ? null : { ...splitAnchor(route), hash: true };
  }
  if (SCHEME.test(href) || href.startsWith("//") || href === "") {
    return null;
  }
  if (href.startsWith("#/")) {
    return { ...splitAnchor(href.slice(1)), hash: true };
  }
  if (href.startsWith("#")) {
    return null;
  }
  const parts = splitAnchor(href);
  const relative = ctx.settings.relativePath && !parts.path.startsWith("/");
  const base = relative ? posix.dirname(`/${page.rel}`) : "/";
  const trailing = parts.path.endsWith("/") ? "/" : "";
  return {
    anchor: parts.anchor,
    hash: false,
    path: `${posix.normalize(posix.join(base, parts.path))}${trailing}`,
  };
};

/** Strip a Docsify attribute title; returns the config and the title to keep. */
const stripAttributes = (page, title, kind) => {
  const trimmed = title.trim();
  const inner = trimmed.slice(1, -1);
  if (!(trimmed && HAS_CONFIG.test(inner))) {
    return { config: new Map(), title };
  }
  const { config, rest } = parseConfig(inner);
  for (const key of config.keys()) {
    count(page, `${kind} attribute :${key} dropped`);
  }
  const [quote] = trimmed;
  return { config, title: rest ? ` ${quote}${rest}${quote}` : "" };
};

/** A link to a non-page file under the content root: it has to move. */
const reviewFileLink = (page, index, file, ctx) => {
  if (existsSync(path.join(ctx.root, file))) {
    ctx.publicFiles.add(`/${file}`);
    review(
      page,
      index,
      `links ${file}, a file in the content root: serve it from public/ and link /${file}`
    );
  }
};

/** A page link's new href: a file link relative to the linking page. */
const linkFor = (href, page, index, ctx) => {
  const target = resolveDocsifyHref(href, page, ctx);
  if (!target) {
    return href;
  }
  const routed = fileOfRoute(target.path, ctx.settings);
  if (!MD_EXT.test(routed)) {
    reviewFileLink(page, index, routed, ctx);
    return href;
  }
  const file = ctx.pageFiles.has(routed)
    ? routed
    : existingPage(ctx.root, routed);
  if (!ctx.pageFiles.has(file)) {
    review(
      page,
      index,
      `link ${href} → ${routed}, which isn't a page here (an alias, or dead on the old site too)`
    );
    return href;
  }
  const into = ctx.moves.get(page.rel) ?? page.rel;
  // The title H1 leaves the body, and its anchor with it: link the page.
  const title = target.anchor && target.anchor === ctx.titleIds.get(file);
  if (title) {
    count(page, "link to a title H1 → link to its page");
  }
  const anchor = target.anchor && !title ? `#${target.anchor}` : "";
  const next = relativeFile(into, ctx.moves.get(file) ?? file) + anchor;
  if (next !== href && !title) {
    count(page, target.hash ? "hash link → file link" : "link → file link");
  }
  return next;
};

/** A relative URL the browser read from the docs root, as a root path. */
const rootedUrl = (url, ctx) => {
  const rooted = `/${docsPath(".", url)}`;
  ctx.publicFiles.add(splitAnchor(rooted).path);
  return rooted;
};

/**
 * A root path to a file in the content root: list it for public/. A page's
 * own file needs nothing: Blume serves its Markdown copy at that path.
 */
const noteRootFile = (url, ctx) => {
  const file = splitAnchor(url).path;
  const stat = url.startsWith("//")
    ? undefined
    : statSync(path.join(ctx.root, file), { throwIfNoEntry: false });
  if (stat?.isFile() && !ctx.pageFiles.has(file.slice(1))) {
    ctx.publicFiles.add(file);
  }
};

/**
 * An image's path after the page's move, clamped to the docs root. Docsify
 * read a leading-slash image from the page's folder too (`/x.png` in
 * `guide/page.md` is `guide/x.png`), where Blume reads it from `public/`.
 */
const assetFor = (href, page, index, ctx) => {
  const { anchor, path: target } = splitAnchor(href);
  const dir = posix.dirname(page.rel);
  const file = docsPath(dir, target);
  const rooted = target.startsWith("/");
  if (!existsSync(path.join(ctx.root, file))) {
    const root = rooted && existsSync(path.join(ctx.root, target));
    const hint = root
      ? `; Docsify read a leading-slash path from the page's folder, so it looked for ${file}. If ${target.slice(1)} is the image meant, point the link at it`
      : "";
    review(
      page,
      index,
      `image ${href} doesn't exist (it was broken on the old site too)${hint}`
    );
  }
  const climbs = posix.normalize(posix.join(dir, target)) !== file;
  if (!(ctx.moves.has(page.rel) || climbs || rooted)) {
    return href;
  }
  const into = ctx.moves.get(page.rel) ?? page.rel;
  const next = relativeFile(into, file) + (anchor ? `#${anchor}` : "");
  if (posix.normalize(next) !== posix.normalize(href)) {
    let kind = "relative path rebased for the move";
    if (rooted) {
      kind = "leading-slash image → path from the page's folder";
    } else if (climbs) {
      kind = "path above the docs root clamped";
    }
    count(page, kind);
  }
  return next;
};

/**
 * A `':ignore'` link: Docsify left the href alone for the browser, which read
 * a relative one from the docs root (from the page's folder in history mode).
 * One naming a page's `.md` file opened that raw file, which Blume serves as
 * the page's Markdown copy, at its new route plus `.md`. A Markdown link to a
 * page's file lands on the page itself, so that one becomes a raw `<a href>`,
 * which keeps its path: `{ href, raw: true }`.
 */
const ignoredLinkFor = (href, page, ctx) => {
  const local = !(EXTERNAL.test(href) || href.startsWith("#") || href === "");
  if (!local) {
    return { href };
  }
  const { anchor, path: target } = splitAnchor(href);
  const rooted = target.startsWith("/");
  const dir = ctx.settings.history && !rooted ? posix.dirname(page.rel) : ".";
  const file = docsPath(dir, target);
  if (ctx.pageFiles.has(file)) {
    count(
      page,
      "':ignore' link to a page's file → <a href> to its Markdown copy"
    );
    const route = routeOfPage(ctx.moves.get(file) ?? file);
    const copy = route === "/" ? "/index.md" : `${route}.md`;
    return { href: copy + (anchor ? `#${anchor}` : ""), raw: true };
  }
  if (rooted) {
    noteRootFile(href, ctx);
  }
  if (rooted || ctx.settings.history) {
    return { href };
  }
  count(page, "':ignore' link → root path");
  return { href: rootedUrl(href, ctx) };
};

const escapeAttribute = (value) =>
  value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");

/** A raw `<a href>`, its title from a link's ` "title"` (as stripped). */
const rawLink = (label, href, title) => {
  const text = title.trim().slice(1, -1);
  const titled = text ? ` title="${escapeAttribute(text)}"` : "";
  return `<a href="${escapeAttribute(href)}"${titled}>${label}</a>`;
};

const rewriteMatch = (page, index, ctx, { kind, line, match }) => {
  const { href, text, title } = match.groups;
  const original = line.slice(match.index, match.index + match[0].length);
  if (title.includes(":include")) {
    return original;
  }
  const stripped = stripAttributes(page, title, kind);
  const local = !(EXTERNAL.test(href) || href.startsWith("#") || href === "");
  const textAt = match.index + (kind === "image" ? 2 : 1);
  const label = line.slice(textAt, textAt + text.length);
  let target = href;
  if (kind === "link" && stripped.config.has("ignore")) {
    const ignored = ignoredLinkFor(href, page, ctx);
    if (ignored.raw) {
      return rawLink(label, ignored.href, stripped.title);
    }
    target = ignored.href;
  } else if (kind === "link") {
    target = linkFor(href, page, index, ctx);
  } else if (local) {
    target = assetFor(href, page, index, ctx);
  }
  const bang = kind === "image" ? "!" : "";
  return `${bang}[${label}](${target}${stripped.title})`;
};

const rewriteLinks = (page, index, line, ctx) => {
  const masked = maskCode(line);
  const matches = [
    ...[...masked.matchAll(LINK)].map((match) => ({
      kind: "link",
      line,
      match,
    })),
    ...[...masked.matchAll(IMAGE)].map((match) => ({
      kind: "image",
      line,
      match,
    })),
  ].toSorted((a, b) => a.match.index - b.match.index);
  let out = "";
  let cursor = 0;
  for (const entry of matches) {
    if (entry.match.index >= cursor) {
      out +=
        line.slice(cursor, entry.match.index) +
        rewriteMatch(page, index, ctx, entry);
      cursor = entry.match.index + entry.match[0].length;
    }
  }
  return out + line.slice(cursor);
};

/** Raw HTML URLs: hash routing resolved a relative one from `/`. */
const rewriteRawUrls = (page, line, ctx) =>
  line.replaceAll(RAW_URL_ATTR, (whole, start, quote, url) => {
    if (url.startsWith("/")) {
      noteRootFile(url, ctx);
    }
    const absolute =
      url === "" ||
      EXTERNAL.test(url) ||
      url.startsWith("/") ||
      url.startsWith("#");
    if (absolute) {
      return whole;
    }
    count(page, "raw HTML relative URL → root path");
    return `${start}${quote}${rootedUrl(url, ctx)}${quote}`;
  });

const rewriteEmoji = (page, line, ctx) => {
  const masked = maskCode(line);
  let out = "";
  let cursor = 0;
  for (const match of masked.matchAll(SHORTCODE)) {
    const before = masked.slice(Math.max(0, match.index - 8), match.index);
    const inUrl = URL_BEFORE.test(before);
    const emoji = inUrl ? undefined : ctx.emoji.get(match.groups.name);
    if (emoji) {
      out += line.slice(cursor, match.index) + emoji;
      cursor = match.index + match[0].length;
      count(page, "emoji shortcode → Unicode");
    } else if (!inUrl) {
      page.shortcodes.add(match[0]);
    }
  }
  return out + line.slice(cursor);
};

/** Links, images, raw HTML URLs, emoji, and page-level syntax on one line. */
const rewriteLine = (page, index, ctx) => {
  let line = page.lines[index];
  if (SCRIPT.test(line)) {
    review(
      page,
      index,
      "a <script> in the page: Docsify 4 ran it only with executeScript or Vue; move it to an island or drop it"
    );
  }
  if (UPDATED.test(line)) {
    line = line.replace(UPDATED, "");
    review(page, index, '{docsify-updated} removed: set lastModified: "git"');
  }
  line = rewriteLinks(page, index, line, ctx);
  if (!ctx.settings.history) {
    line = rewriteRawUrls(page, line, ctx);
  }
  if (!ctx.settings.noEmoji) {
    line = rewriteEmoji(page, line, ctx);
  }
  page.lines[index] = line;
};

// --- Titles and frontmatter -------------------------------------------------------

const splitFrontmatter = (lines) => {
  const end = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  return end === -1
    ? { body: lines, front: null }
    : { body: lines.slice(end + 1), front: lines.slice(1, end) };
};

/** The page's headings and the kind of its first block. */
const collectHeadings = (page) => {
  const states = scanLines(page.lines);
  const headings = [];
  let firstBlock = null;
  for (const [index, line] of page.lines.entries()) {
    const blank =
      line.trim() === "" || line === DELETED || states[index].comment;
    const match = blank || inCode(states[index]) ? null : ATX.exec(line);
    if (match?.groups.text === undefined) {
      firstBlock ??= blank ? null : "text";
      continue;
    }
    const level = match.groups.hashes.length;
    headings.push({ index, level, text: match.groups.text });
    firstBlock ??= level === 1 ? "h1" : "heading";
  }
  return { firstBlock, headings };
};

/** The id Docsify gave the leading H1 that becomes a page's title, if any. */
const titleId = (page, version) => {
  const probe = { edits: {}, lines: [...page.original] };
  setextToAtx(probe);
  const { firstBlock, headings } = collectHeadings(probe);
  return firstBlock === "h1"
    ? docsifyBaseId(headings[0].text, version)
    : undefined;
};

const reviewTitle = (page, { h1s, label, title }) => {
  const labelWords = words(label);
  const fileWords = words(page.rel);
  const shared = [...words(title)].some(
    (word) => labelWords.has(word) || fileWords.has(word)
  );
  if (!shared || (h1s.length > 1 && title !== label)) {
    review(
      page,
      h1s[0].index,
      `title "${title}" (sidebar: "${label}", ${h1s.length} H1s): if this H1 is a section, not the page's title, take the label as the title and demote every heading instead`
    );
  }
};

const demoteHeadings = (page, headings, from) => {
  for (const heading of headings) {
    if (heading.index < from || page.lines[heading.index] === DELETED) {
      continue;
    }
    if (heading.level === 6) {
      review(
        page,
        heading.index,
        "an h6 can't move down a level; flatten this section by hand"
      );
      continue;
    }
    page.lines[heading.index] = page.lines[heading.index].replace(
      LEADING_HASH,
      "$<indent>##"
    );
    count(page, "heading demoted");
  }
};

/** The page's title, taking the leading H1 out of the body, and demotions. */
const titleAndDemote = (page, ctx) => {
  const { firstBlock, headings } = collectHeadings(page);
  const h1s = headings.filter((heading) => heading.level === 1);
  // A folder's README is named for its folder, not "README".
  const stem = stemOf(page.rel);
  const dir = posix.dirname(page.rel);
  const name =
    INDEX_STEM.test(stem) && dir !== "." ? posix.basename(dir) : stem;
  const label = ctx.sidebarByFile.get(page.rel)?.label ?? humanize(name);
  if (firstBlock !== "h1") {
    if (h1s.length > 0) {
      demoteHeadings(page, headings, 0);
      review(
        page,
        h1s[0].index,
        `content comes before the first H1, so the title is "${label}" and every heading moved down a level`
      );
    }
    return label;
  }
  const [first, second] = h1s;
  const title = plainText(
    first.text.replace(PIN_MARKER, "").replace(TOC_MARKER, "")
  );
  // Only a sidebar label is worth comparing; the home page's is "Home".
  if (ctx.sidebarByFile.has(page.rel) && page.route !== "/") {
    reviewTitle(page, { h1s, label, title });
  }
  page.lines[first.index] = DELETED;
  count(page, "H1 → frontmatter title");
  demoteHeadings(page, headings, second?.index ?? Number.POSITIVE_INFINITY);
  return title;
};

const buildFrontmatter = (page, title, ctx) => {
  const sidebar = ctx.sidebarByFile.get(page.rel);
  const entries = [`title: ${yamlString(title)}`];
  if (sidebar?.label && sidebar.label !== title) {
    entries.push("sidebar:", `  label: ${yamlString(sidebar.label)}`);
  }
  if (sidebar?.title) {
    entries.push("seo:", `  title: ${yamlString(sidebar.title)}`);
  }
  if (ctx.hasSidebar && !sidebar && page.route !== "/") {
    entries.push("hidden: true");
    count(page, "unlisted page → hidden: true");
  }
  const existing = page.front ?? [];
  for (const line of existing) {
    const key = FRONT_KEY.exec(line)?.groups.key;
    if (key && !BLUME_KEYS.has(key)) {
      review(
        page,
        0,
        `frontmatter key "${key}" isn't in Blume's schema: map it or remove it`
      );
    }
  }
  return [...entries, ...existing.filter((line) => !line.startsWith("title:"))];
};

// --- MDX ----------------------------------------------------------------------

const mdxSafeLine = (line, inComment) => {
  const comment = inComment || line.includes("<!--") || line.includes("-->");
  const uncommented = comment
    ? line.replaceAll(COMMENT_OPEN, "{/*").replaceAll(COMMENT_CLOSE, "*/}")
    : line;
  return uncommented
    .replaceAll(CLOSE_BR, "<br />")
    .replaceAll(VOID_TAG, "<$<tag>$<rest> />")
    .replaceAll(AUTOLINK, "[$<url>]($<url>)");
};

const makeMdxSafe = (page) => {
  const states = scanLines(page.lines);
  for (const [index, line] of page.lines.entries()) {
    const next = states[index].fence
      ? line
      : mdxSafeLine(line, states[index].comment);
    if (next !== line) {
      page.lines[index] = next;
      count(page, "MDX-safe HTML (comment, void tag, autolink)");
    }
  }
};

/** A <p> holding a block element can span lines: search the whole page. */
const reviewParagraphBlocks = (page, states) => {
  const starts = [];
  let offset = 0;
  for (const line of page.lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  const joined = page.lines
    .map((line, index) => (states[index].fence ? "" : line))
    .join("\n");
  for (const match of joined.matchAll(P_WITH_BLOCK)) {
    const index = starts.findLastIndex((start) => start <= match.index);
    review(
      page,
      index,
      "a block element inside <p>: MDX rejects it, so make the <p> a <div>"
    );
  }
};

const reviewAttributes = (page, index, masked) => {
  for (const tag of masked.matchAll(TAG_ATTRIBUTES)) {
    const names = [...tag.groups.attributes.matchAll(ATTRIBUTE_NAME)].map(
      (name) => name.groups.name.toLowerCase()
    );
    if (new Set(names).size !== names.length) {
      review(
        page,
        index,
        "an HTML tag repeats an attribute: MDX rejects it, so keep one"
      );
    }
  }
};

const reviewLine = (page, index, { line, startsBlock }) => {
  const masked = maskCode(line);
  const html = masked.trimStart().startsWith("<");
  if (startsBlock && INDENTED.test(line) && !html) {
    review(page, index, "an indented code block: MDX has none, so fence it");
  }
  if (CELL_WITH_TEXT.test(masked)) {
    review(
      page,
      index,
      "an HTML table tag shares its line with text: give each structural tag its own line"
    );
  }
  reviewAttributes(page, index, masked);
  if (BRACE.test(masked.replaceAll(MDX_COMMENT, "")) && !html) {
    review(
      page,
      index,
      "a brace in prose is a JSX expression in MDX: escape it as \\{ or put it in code"
    );
  }
};

/** What MDX still rejects in a renamed page. */
const reviewMdxHazards = (page) => {
  const states = scanLines(page.lines);
  reviewParagraphBlocks(page, states);
  let previousBlank = true;
  let inList = false;
  for (const [index, line] of page.lines.entries()) {
    if (line === DELETED) {
      continue;
    }
    if (!states[index].fence) {
      reviewLine(page, index, { line, startsBlock: previousBlank && !inList });
    }
    if (line.trim() !== "") {
      inList = LIST_OR_QUOTE.test(line) || (inList && line.startsWith(" "));
    }
    previousBlank = line.trim() === "";
  }
};

// --- The snapshot ---------------------------------------------------------------

/**
 * The Markdown a line includes: `{ file, fragment }`, `{ file: "" }` for
 * another kind of include, or null for no include.
 */
const includedMarkdown = (line, page, ctx) => {
  const include = INCLUDE_LINE.exec(line);
  if (!include || isCodeIndent(include.groups.indent)) {
    return null;
  }
  const { options, target } = include.groups;
  if (EXTERNAL.test(target)) {
    return { file: "" };
  }
  const file = docsPath(posix.dirname(page.rel), target);
  const { config } = parseConfig(options);
  const type = includeType(config, file);
  if (type !== "markdown" || !existsSync(path.join(ctx.root, file))) {
    return { file: "" };
  }
  const cut =
    config.has("fragment") && takesFragment(type, ctx.settings.version);
  return { file, fragment: cut ? config.get("fragment") : undefined };
};

const setextHeading = (lines, index) => {
  const line = lines[index];
  const under = index + 1 < lines.length ? SETEXT.exec(lines[index + 1]) : null;
  const plain =
    under &&
    line.trim() !== "" &&
    !LIST_OR_QUOTE.test(line) &&
    !ATX.test(line) &&
    !line.trimStart().startsWith("<") &&
    (index === 0 || lines[index - 1].trim() === "");
  if (!plain) {
    return null;
  }
  return {
    level: under.groups.rule.startsWith("=") ? 1 : 2,
    text: line.trim(),
  };
};

const snapshotHeading = (lines, index) => {
  const atx = ATX.exec(lines[index])?.groups;
  if (atx) {
    return { level: atx.hashes.length, setext: false, text: atx.text ?? "" };
  }
  const setext = setextHeading(lines, index);
  return setext ? { ...setext, setext: true } : null;
};

/** The headings Docsify rendered for a page, includes and setext ones too. */
const snapshotHeadings = (page, ctx, lines, seen) => {
  const states = scanLines(lines);
  const out = [];
  let inTabs = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    inTabs = (inTabs || TABS_START.test(line)) && !TABS_END.test(line);
    const included = includedMarkdown(line, page, ctx);
    const tab = inTabs && tabLabel(line) !== undefined;
    const skip =
      inCode(states[index]) ||
      states[index].comment ||
      tab ||
      included !== null;
    const heading = skip ? null : snapshotHeading(lines, index);
    if (included?.file && !seen.has(included.file)) {
      const { file, fragment } = included;
      const raw = readFileSync(path.join(ctx.root, file), "utf-8");
      const text = fragment
        ? (extractFragment(raw, fragment, ctx.settings.version) ?? "")
        : raw;
      const { body } = splitFrontmatter(text.split("\n"));
      const nested = new Set([...seen, file]);
      out.push(...snapshotHeadings({ rel: file }, ctx, body, nested));
    } else if (heading) {
      out.push(heading);
      index += heading.setext ? 1 : 0;
    }
  }
  return out;
};

const snapshotHtml = (headings, version) => {
  const counts = new Map();
  const html = [];
  for (const { level, text } of headings) {
    // Docsify counts an empty id too: the second empty heading is `-1`.
    const base = docsifyBaseId(text, version);
    const seen = counts.has(base) ? counts.get(base) + 1 : 0;
    counts.set(base, seen);
    const id = seen ? `${base}-${seen}` : base;
    if (id !== "") {
      const visible = visibleText(withoutConfig(text))
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;");
      const attribute = id.replaceAll('"', "&quot;");
      html.push(`<h${level} id="${attribute}">${visible}</h${level}>`);
    }
  }
  return html;
};

const writeSnapshot = (pages, ctx, dir) => {
  mkdirSync(dir, { recursive: true });
  const routes = new Set(ctx.oldRoutes);
  for (const page of pages) {
    const headings = snapshotHeadings(page, ctx, page.original, new Set());
    const html = snapshotHtml(headings, ctx.settings.version);
    const file =
      page.route === "/" ? "index.html" : `${page.route.slice(1)}/index.html`;
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(
      path.join(dir, file),
      `<!doctype html>\n<main>\n${html.join("\n")}\n</main>\n`
    );
    routes.add(page.route);
  }
  const list = [...routes].toSorted().join("\n");
  writeFileSync(path.join(dir, "old-routes.txt"), `${list}\n`);
};

const navRoute = (href) => {
  const bare = href
    .replace(HASH_PREFIX, "")
    .replace(QUERY, "")
    .replace(MD_EXT, "")
    .replace(LEADING_SLASHES, "");
  const route = `/${bare}`.replace(README_ROUTE, "$<lead>");
  return route.length > 1 ? route.replace(TRAILING_SLASHES, "$<first>") : route;
};

/** Old routes the sidebar, navbar, and cover link (aliases included). */
const collectOldRoutes = (ctx, files) => {
  const routes = new Set();
  const navFiles = files.filter((rel) =>
    isNavFile(posix.basename(rel), ctx.settings)
  );
  for (const file of navFiles) {
    const text = readFileSync(path.join(ctx.root, file), "utf-8").replaceAll(
      MD_IMAGE,
      ""
    );
    for (const match of text.matchAll(NAV_LINK)) {
      const { href } = match.groups;
      const anchorOnly = href.startsWith("#") && !href.startsWith("#/");
      if (!(SCHEME.test(href) || anchorOnly)) {
        routes.add(navRoute(href));
      }
    }
  }
  return routes;
};

// --- The run ------------------------------------------------------------------

const sidebarFile = (item, folder, ctx) => {
  const href = item.href.replace(HASH_PREFIX, "");
  const relative =
    ctx.settings.relativePath && !href.startsWith("/") && folder !== ".";
  const base = relative ? `/${folder}` : "/";
  const resolved = posix.normalize(posix.join(base, splitAnchor(href).path));
  const trailing = href.endsWith("/") ? "/" : "";
  const routed = fileOfRoute(`${resolved}${trailing}`, ctx.settings);
  return MD_EXT.test(routed) ? existingPage(ctx.root, routed) : undefined;
};

/** The sidebar(s): the root one names groups; a folder's own one is a tab. */
const loadSidebars = (ctx, files, notes) => {
  const sidebars = files.filter(
    (rel) => posix.basename(rel) === ctx.settings.sidebar
  );
  for (const file of sidebars) {
    ctx.hasSidebar = true;
    const folder = posix.dirname(file);
    if (folder !== ".") {
      notes.push(
        `${file}: a per-folder sidebar; make /${folder} a navigation.tabs entry`
      );
    }
    const text = readFileSync(path.join(ctx.root, file), "utf-8");
    for (const item of parseSidebar(text)) {
      const external = SCHEME.test(item.href) || item.href.startsWith("//");
      const page = external ? undefined : sidebarFile(item, folder, ctx);
      if (!page) {
        notes.push(
          `${file}: "${item.label}" → ${item.href} isn't a page here (external, an alias, a static file, or a dead link)`
        );
      } else if (!ctx.sidebarByFile.has(page)) {
        ctx.sidebarByFile.set(page, item);
        // The home page stays the content root's index, in no group.
        const home = page === ctx.settings.homepage || page === "index.md";
        ctx.groupsByFile.set(page, folder === "." && !home ? item.groups : []);
      }
    }
  }
};

const newPage = (rel, text, settings) => {
  const { body, front } = splitFrontmatter(text.split("\n"));
  const partial = isPartialPath(rel);
  return {
    converted: front?.some((line) => line.startsWith("title:")) ?? false,
    edits: {},
    front,
    includes: [],
    lines: [...body],
    original: body,
    partial,
    rel,
    reviews: [],
    route: partial ? null : routeOfFile(rel, settings),
    shortcodes: new Set(),
  };
};

/** Every Markdown file Docsify could route to; partials convert too. */
const loadPages = (ctx, files, notes) => {
  const pages = [];
  for (const rel of files) {
    const nav = isNavFile(posix.basename(rel), ctx.settings);
    const text =
      MD_EXT.test(rel) && !nav
        ? readFileSync(path.join(ctx.root, rel), "utf-8")
        : null;
    if (text !== null && HTML_DOCUMENT.test(text)) {
      notes.push(
        `${rel}: an HTML document saved as Markdown; publish the HTML from public/ instead`
      );
    } else if (text !== null) {
      pages.push(newPage(rel, text, ctx.settings));
    }
  }
  return pages;
};

/** README → index, and a folder per sidebar group; `.mdx` comes later. */
const nextPath = (page, ctx, options) => {
  const dir = posix.dirname(page.rel);
  let next = page.rel;
  if (page.rel === ctx.settings.homepage && page.rel !== "index.md") {
    next = "index.md";
  } else if (
    README.test(page.rel) &&
    !existingPage(ctx.root, posix.join(dir, "index.md"))
  ) {
    next = posix.join(dir, "index.md");
  }
  const groups = ctx.groupsByFile.get(page.rel) ?? [];
  const folder = groups.map(slugifyFolder).join("/");
  const regroup = options.has("group-folders") && folder !== "";
  if (regroup && posix.dirname(next) !== folder) {
    next = posix.join(folder, posix.basename(next));
  }
  return next;
};

const planMoves = (pages, ctx, options) => {
  const targets = new Set();
  for (const page of pages.filter(
    (entry) => !(entry.partial || entry.converted)
  )) {
    const next = nextPath(page, ctx, options);
    const taken = targets.has(next) || existsSync(path.join(ctx.root, next));
    if (next !== page.rel && taken) {
      review(page, 0, `can't move to ${next}: a file is already there`);
    } else if (next !== page.rel) {
      ctx.moves.set(page.rel, next);
      targets.add(next);
    }
  }
};

const needsMdx = (page) => page.lines.some((line) => MDX_ONLY.test(line));

/** Pages that need MDX: their own syntax, or a partial they include. */
const planMdx = (pages, ctx) => {
  const byFile = new Map(pages.map((page) => [page.rel, page]));
  for (const page of pages.filter((entry) => !entry.partial)) {
    const viaPartial = page.includes.some(
      ({ file, lang }) =>
        !lang && byFile.has(file) && needsMdx(byFile.get(file))
    );
    if (needsMdx(page) || viaPartial) {
      const next = (ctx.moves.get(page.rel) ?? page.rel).replace(
        MD_EXT,
        ".mdx"
      );
      ctx.moves.set(page.rel, next);
    }
  }
};

const convertPage = (page, ctx) => {
  setextToAtx(page);
  convertTabs(page);
  convertCallouts(page);
  convertIncludes(page, ctx);
  convertHeadingAttributes(page);
  const states = scanLines(page.lines);
  for (const index of page.lines.keys()) {
    const skip =
      inCode(states[index]) ||
      states[index].comment ||
      page.lines[index] === DELETED;
    if (!skip) {
      rewriteLine(page, index, ctx);
    }
  }
};

const finishPage = (page, ctx) => {
  if (!(page.partial || page.converted)) {
    const title = titleAndDemote(page, ctx);
    page.front = buildFrontmatter(page, title, ctx);
  }
  if ((ctx.moves.get(page.rel) ?? "").endsWith(".mdx")) {
    makeMdxSafe(page);
    reviewMdxHazards(page);
  }
  const hint = ctx.emoji.size === 0 ? " (pass --emoji)" : "";
  for (const code of [...page.shortcodes].toSorted()) {
    review(
      page,
      0,
      `emoji shortcode ${code} renders as text in Blume: replace it with the emoji${hint}`
    );
  }
};

/** Old route → new route, for every page whose route changed. */
const routeTable = (pages, ctx) => {
  const table = {};
  for (const page of pages.filter(
    (entry) => !(entry.partial || entry.converted)
  )) {
    const next = routeOfPage(ctx.moves.get(page.rel) ?? page.rel);
    if (next !== page.route) {
      table[page.route] = next;
    }
    // A `homepage: "intro.md"` page also answered at its own route.
    const own = `/${page.rel.replace(MD_EXT, "")}`;
    if (page.route === "/" && !README.test(page.rel) && own !== next) {
      table[own] = next;
    }
  }
  return table;
};

/**
 * meta.ts per group folder, in sidebar order, plus one at the content root
 * that keeps the groups in sidebar order (Blume would sort them by name).
 */
const groupMetas = (ctx) => {
  const metas = new Map();
  const top = [];
  for (const [file, groups] of ctx.groupsByFile) {
    const [first, ...rest] = (ctx.moves.get(file) ?? file).split("/");
    const topChild = childSlug(rest.length > 0 ? first : stemOf(first));
    if (topChild !== "index" && !top.includes(topChild)) {
      top.push(topChild);
    }
    for (const [depth, group] of groups.entries()) {
      const folder = groups
        .slice(0, depth + 1)
        .map(slugifyFolder)
        .join("/");
      const meta = metas.get(folder) ?? { pages: [], title: group };
      const last = depth === groups.length - 1;
      const child = last
        ? stripOrder(stemOf(ctx.moves.get(file) ?? file))
        : slugifyFolder(groups[depth + 1]);
      if (!meta.pages.includes(child)) {
        meta.pages.push(child);
      }
      metas.set(folder, meta);
    }
  }
  if (metas.size > 0 && top.length > 1) {
    metas.set(".", { pages: top });
  }
  return metas;
};

/** The page's output text, with each finding's line number in it. */
const renderPage = (page) => {
  const positions = [];
  const body = [];
  for (const line of page.lines) {
    positions.push(body.length);
    if (line !== DELETED) {
      body.push(line);
    }
  }
  const leading = Math.max(
    0,
    body.findIndex((line) => line.trim() !== "")
  );
  const front = page.front ? ["---", ...page.front, "---", ""] : [];
  const reviews = page.reviews
    .map(({ index, message }) => {
      const position = Math.max(0, (positions[index] ?? body.length) - leading);
      return { line: front.length + position + 1, message };
    })
    .toSorted((a, b) => a.line - b.line);
  return { reviews, text: [...front, ...body.slice(leading)].join("\n") };
};

const writeMetas = (ctx, metas, notes) => {
  for (const [folder, meta] of metas) {
    const file = path.join(ctx.root, folder, "meta.ts");
    if (existsSync(file)) {
      notes.push(`${folder}/meta.ts exists; left it alone`);
      continue;
    }
    mkdirSync(path.dirname(file), { recursive: true });
    const pages = meta.pages.map(yamlString).join(", ");
    const title = meta.title ? `  title: ${yamlString(meta.title)},\n` : "";
    writeFileSync(
      file,
      `import { defineMeta } from "blume";\n\nexport default defineMeta({\n${title}  pages: [${pages}],\n});\n`
    );
  }
};

const writeRouteTable = (table, file) => {
  const previous = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf-8"))
    : {};
  const merged = Object.fromEntries(
    Object.entries({ ...previous, ...table }).toSorted(([a], [b]) =>
      a.localeCompare(b)
    )
  );
  writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`);
};

const writeResults = (ctx, { metas, notes, options, results, table }) => {
  for (const result of results.filter((entry) => entry.changed)) {
    const target = path.join(ctx.root, result.renamed ?? result.file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, result.text);
    if (result.renamed) {
      rmSync(path.join(ctx.root, result.file));
    }
  }
  for (const [file, text] of ctx.newFiles) {
    writeFileSync(path.join(ctx.root, file), text);
  }
  writeMetas(ctx, metas, notes);
  if (Object.keys(table).length > 0) {
    const out = options.get("routes-out") ?? "docsify-routes.json";
    writeRouteTable(table, path.resolve(out));
  }
};

const siteNotes = (files, settings, notes) => {
  if (files.includes(settings.cover)) {
    notes.push(
      `${settings.cover}: rebuild the cover as the top of index.md (title, tagline, links); drop its background`
    );
  }
  if (files.includes(settings.navbar)) {
    notes.push(
      `${settings.navbar}: map its links to navigation.tabs (doc sections) or navigation.actions (the rest)`
    );
  }
};

const takeSnapshot = (pages, ctx, options, notes) => {
  const dir = options.get("snapshot");
  if (!dir) {
    return;
  }
  const converted = pages.filter((page) => page.converted).length;
  if (converted > 0) {
    notes.push(
      `snapshot skipped: ${converted} page(s) already have a title, so this isn't the first run`
    );
    return;
  }
  const routed = pages.filter((page) => !page.partial);
  writeSnapshot(routed, ctx, path.resolve(dir));
};

const pageResult = (page, ctx) => {
  const next = ctx.moves.get(page.rel) ?? page.rel;
  const { reviews, text } = renderPage(page);
  const before = readFileSync(path.join(ctx.root, page.rel), "utf-8");
  return {
    changed: text !== before || next !== page.rel,
    edits: page.edits,
    file: page.rel,
    renamed: next === page.rel ? undefined : next,
    reviews,
    text,
  };
};

const createContext = (root, options) => ({
  emoji: loadEmoji(options.get("emoji")),
  groupsByFile: new Map(),
  hasSidebar: false,
  moves: new Map(),
  newFiles: new Map(),
  oldRoutes: new Set(),
  pageFiles: new Set(),
  publicFiles: new Set(),
  root,
  settings: readSettings(root, options),
  sidebarByFile: new Map(),
  site: options.get("site")?.replace(SITE_SLASHES, "").toLowerCase() ?? "",
  titleIds: new Map(),
});

const run = (root, options) => {
  const ctx = createContext(root, options);
  const files = listFiles(root);
  const notes = [];
  loadSidebars(ctx, files, notes);
  ctx.oldRoutes = collectOldRoutes(ctx, files);
  siteNotes(files, ctx.settings, notes);
  const pages = loadPages(ctx, files, notes);
  ctx.pageFiles = new Set(
    pages.filter((page) => !page.partial).map((page) => page.rel)
  );
  for (const page of pages.filter((entry) => !entry.partial)) {
    ctx.titleIds.set(page.rel, titleId(page, ctx.settings.version));
  }
  takeSnapshot(pages, ctx, options, notes);
  planMoves(pages, ctx, options);
  const fresh = pages.filter((page) => !page.converted);
  for (const page of fresh) {
    convertPage(page, ctx);
  }
  planMdx(fresh, ctx);
  for (const page of pages) {
    finishPage(page, ctx);
  }
  const table = routeTable(pages, ctx);
  const metas = options.has("group-folders") ? groupMetas(ctx) : new Map();
  const results = pages
    .map((page) => pageResult(page, ctx))
    .filter((result) => result.changed || result.reviews.length > 0);
  if (options.has("write")) {
    writeResults(ctx, { metas, notes, options, results, table });
  }
  return {
    files: results.map(({ text: _text, ...rest }) => rest),
    metas: [...metas.keys()].toSorted(),
    notes: notes.toSorted(),
    publicFiles: [...ctx.publicFiles].toSorted(),
    routes: table,
    settings: ctx.settings,
  };
};

// --- CLI ----------------------------------------------------------------------

const HELP = [
  "Usage:",
  "  node docsify-codemod.mjs [options] <docsify-dir>",
  "",
  "  --write                 apply (default: dry run)",
  "  --snapshot <dir>        write old heading ids + old-routes.txt for pin-heading-ids.mjs",
  "  --group-folders         move pages into a folder per sidebar group, write meta.ts",
  "  --routes-out <file>     the route table (default: docsify-routes.json)",
  "  --emoji <file>          shortcode → emoji map (GitHub's /emojis JSON works)",
  "  --site <url>            the old site's address, for its own absolute links",
  "  --version 4|5           Docsify's major version (default: from index.html)",
  "  --relative-path true|false   Docsify's relativePath (default: from index.html)",
  "  --sidebar <file>        the sidebar file name (default: from index.html)",
  "  --json                  JSON report",
].join("\n");

const VALUE_OPTIONS = new Set([
  "emoji",
  "relative-path",
  "routes-out",
  "sidebar",
  "site",
  "snapshot",
  "version",
]);

const parseArgs = (argv) => {
  const options = new Map();
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [key, inline] = arg.startsWith("--")
      ? arg.slice(2).split("=", 2)
      : [];
    if (key === undefined) {
      positional.push(arg);
    } else if (VALUE_OPTIONS.has(key) && inline === undefined) {
      index += 1;
      options.set(key, argv[index]);
    } else {
      options.set(key, inline ?? "");
    }
  }
  return { options, positional };
};

const printFiles = (files, totals) => {
  let reviewCount = 0;
  for (const file of files) {
    const name = file.renamed ? `${file.file} → ${file.renamed}` : file.file;
    process.stdout.write(`\n${name}\n`);
    for (const [kind, n] of Object.entries(file.edits).toSorted()) {
      process.stdout.write(`  ${n} × ${kind}\n`);
      totals.set(kind, (totals.get(kind) ?? 0) + n);
    }
    for (const { line, message } of file.reviews) {
      process.stdout.write(`  REVIEW line ${line}: ${message}\n`);
    }
    reviewCount += file.reviews.length;
  }
  return reviewCount;
};

const printList = (heading, items) => {
  if (items.length === 0) {
    return;
  }
  process.stdout.write(`\n${heading}\n`);
  for (const item of items) {
    process.stdout.write(`  ${item}\n`);
  }
};

const printReport = (result, options) => {
  const { settings } = result;
  const write = options.has("write");
  const routing = settings.history ? "history" : "hash";
  process.stdout.write(
    `Docsify ${settings.version}, relativePath: ${settings.relativePath}, ${routing} routing, sidebar: ${settings.sidebar}\n`
  );
  const totals = new Map();
  const reviewCount = printFiles(result.files, totals);
  printList(
    "Site",
    result.notes.map((note) => `REVIEW ${note}`)
  );
  printList(
    "Files the pages link that must be served from public/",
    result.publicFiles
  );
  const moved = Object.keys(result.routes).length;
  const out = options.get("routes-out") ?? "docsify-routes.json";
  const where = write ? `, written to ${out}` : "";
  printList("Routes", moved > 0 ? [`${moved} route(s) changed${where}`] : []);
  printList(
    "Totals",
    [...totals].toSorted().map(([kind, n]) => `${n} × ${kind}`)
  );
  const changed = result.files.filter((file) => file.changed).length;
  const verb = write ? "changed" : "would change";
  const hint = write ? "" : " Re-run with --write to apply.";
  const reviews = reviewCount + result.notes.length;
  process.stdout.write(
    `\n${result.files.length} file(s) with findings, ${changed} ${verb}, ${reviews} item(s) to review.${hint}\n`
  );
};

const main = () => {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const [dir] = positional;
  if (options.has("help") || !dir) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  const result = run(path.resolve(dir), options);
  if (options.has("json")) {
    const json = { ...result, wrote: options.has("write") };
    process.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
    return;
  }
  printReport(result, options);
};

main();
