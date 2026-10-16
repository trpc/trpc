#!/usr/bin/env node
// pin-heading-ids.mjs — keep a migrated site's old heading anchors working.
//
// Every docs tool slugs headings its own way. GitBook writes
// `AppConfig:OCSP:Enabled` as `#appconfig-ocsp-enabled` where Blume writes
// `#appconfigocspenabled`; VitePress, MkDocs, and others differ in their own
// cases. After a migration, every `#anchor` link to such a heading and every
// deep link from outside lands at the top of the page instead. This script
// finds those headings and pins the old id on each:
//
//   1. It reads the ids the old site actually published — its live pages, or
//      a local directory of its built HTML — rather than deriving them, since
//      every tool has edge cases (GitBook truncates long ids, for one).
//   2. It reads the ids Blume actually rendered from the migrated build
//      (`dist/`), and pairs the two pages' headings by their text, in order.
//      Only letters and digits are compared, after dropping each old heading's
//      permalink (MkDocs' `¶`, VitePress's and Docusaurus's anchors), so smart
//      dashes, markup, and emoji don't break a pair.
//   3. For each pair whose ids differ, it finds the heading's source line — in
//      the page itself or in an `<include>`d partial — and appends the old id:
//      `[#id]` in `.mdx`, `{#id}` in `.md`, and `\{#id\}` in a partial (that
//      spelling pins the same anchor in both formats). An existing pin that
//      disagrees is replaced.
//
// Usage, from the migrated project after `blume build`:
//
//   node pin-heading-ids.mjs --old https://docs.example.com          # dry run
//   node pin-heading-ids.mjs --old https://docs.example.com --write  # apply
//   node pin-heading-ids.mjs --old ../old-site/build --map dist/blume-redirects.json
//
// Then rebuild and run it again until it reports 0: a pin can change the `-1`
// suffix Blume gives a later heading with the same text. Run `blume validate`
// after: it checks every `#anchor` link against the pinned ids.
//
// Options:
//   --old <url|dir>    The old site: its base URL (pages are fetched one at a
//                      time) or a directory of its built HTML. Required.
//   --dist <dir>       The migrated build (default: dist). A server build
//                      (vercel(), node(), cloudflare()) keeps its pages in
//                      dist/client, which is read when dist has a client/
//                      folder and no index.html of its own. Vercel's build
//                      also copies them to .vercel/output/static.
//   --manifest <file>  Blume's route manifest, which maps each route to its
//                      source file (default: <runtime dir>/blume.manifest.json,
//                      the runtime dir being $BLUME_RUNTIME_DIR or .blume).
//                      Without one, routes are derived from the file paths
//                      under --docs (ordering prefixes, (group) folders,
//                      index, and a frontmatter slug; not i18n or versions).
//   --docs <dir>       The content root (default: the manifest's, else docs).
//   --map <file>       Old URL → new route, for pages that moved: a JSON object
//                      { "/old": "/new" }, or an array of { from, to } entries:
//                      Blume's dist/blume-redirects.json works as it is, but a
//                      build writes it only when no host adapter is set (with
//                      one, save the config's `redirects` array as JSON).
//                      Patterns and .md/.mdx mirrors are skipped. A page it
//                      doesn't name is looked up at its own route.
//   --old-scope <tag>  The element holding the old page's content (default:
//                      main; the whole page when there's none).
//   --new-scope <tag>  The same for the build (default: article).
//   --only-linked      Pin only ids that content links to: a #fragment in a
//                      Markdown link or an href. For sites where hundreds of
//                      ids change and only the linked ones matter.
//   --links <file>     More ids to keep, one per line: `id`, `#id`,
//                      `/route#id`, or a full URL. Implies --only-linked.
//   --cache <dir>      Where fetched pages are kept, so reruns don't refetch
//                      (default: .pin-heading-ids-cache; delete it when done).
//   --delay <ms>       Pause between fetches (default: 500).
//   --write            Apply the pins. Without it, report only.
//   --json             A machine-readable report.
//
// The old pages must be server-rendered HTML with ids on their headings. A
// client-rendered site (Docsify) has none in its HTML: pass the directory
// `docsify-codemod.mjs --snapshot` wrote as `--old`. A heading whose text the source
// doesn't spell out (one a component renders, or a reworded one) is reported
// as a NOTE with no source line: pin it by hand.
//
// Zero dependencies: runs on a bare Node.js 22 with nothing installed.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const USAGE = [
  "Usage: node pin-heading-ids.mjs --old <url|dir> [options]",
  "",
  "  --old <url|dir>    the old site's base URL, or a directory of its built HTML",
  "  --dist <dir>       the migrated build (default: dist; a server build's",
  "                     dist/client is read when dist has no index.html)",
  "  --manifest <file>  Blume's route manifest (default: .blume/blume.manifest.json)",
  "  --docs <dir>       the content root (default: the manifest's, else docs)",
  "  --map <file>       old URL → new route, as JSON (dist/blume-redirects.json, written with no host adapter, works)",
  "  --old-scope <tag>  the old page's content element (default: main)",
  "  --new-scope <tag>  the build's content element (default: article)",
  "  --only-linked      pin only ids that content links to",
  "  --links <file>     more ids to keep, one per line (implies --only-linked)",
  "  --cache <dir>      fetched-page cache (default: .pin-heading-ids-cache)",
  "  --delay <ms>       pause between fetches (default: 500)",
  "  --write            apply the pins (default: report only)",
  "  --json             machine-readable report",
].join("\n");

// --- Arguments ---------------------------------------------------------------

const FLAGS = new Set(["--help", "--json", "--only-linked", "--write", "-h"]);

const parseArgs = (argv) => {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (FLAGS.has(arg)) {
      options[arg.replace(/^-+/u, "")] = true;
    } else if (arg.startsWith("--")) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${arg} needs a value`);
      }
      options[arg.slice(2)] = value;
      i += 1;
    } else {
      throw new Error(`unexpected argument: ${arg}`);
    }
  }
  return options;
};

// --- HTML --------------------------------------------------------------------

// The named entities docs sites write in headings: punctuation, arrows, and
// the pilcrow MkDocs and Sphinx put in their permalinks.
const NAMED_ENTITIES = {
  amp: "&",
  apos: "'",
  bull: "•",
  copy: "©",
  darr: "↓",
  emsp: " ",
  ensp: " ",
  gt: ">",
  harr: "↔",
  hellip: "…",
  laquo: "«",
  larr: "←",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  middot: "·",
  nbsp: " ",
  ndash: "–",
  para: "¶",
  quot: '"',
  raquo: "»",
  rarr: "→",
  rdquo: "”",
  reg: "®",
  rsquo: "’",
  sect: "§",
  shy: "",
  thinsp: " ",
  times: "×",
  trade: "™",
  uarr: "↑",
  zwj: "",
  zwnj: "",
};

const ENTITY = /&(?<entity>#x[0-9a-f]+|#\d+|[a-z]+);/giu;

/**
 * `text` with its character references decoded. A named one outside the table
 * is kept as written, or replaced by `unknown(match)`: in rendered HTML, where
 * a literal `&` is always `&amp;`, it can only be a character, never letters.
 */
const decodeEntities = (text, unknown = (match) => match) =>
  text.replace(ENTITY, (match, entity) => {
    if (!entity.startsWith("#")) {
      return NAMED_ENTITIES[entity.toLowerCase()] ?? unknown(match);
    }
    const hex = entity[1] === "x" || entity[1] === "X";
    const code = hex
      ? Number.parseInt(entity.slice(2), 16)
      : Number(entity.slice(1));
    return Number.isInteger(code) ? String.fromCodePoint(code) : match;
  });

/** `text` matched literally inside a `RegExp`. */
const escapeRegExp = (text) => text.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** The markup between the first `<tag …>` and the last `</tag>`, else all of it. */
const scope = (html, tag) => {
  const open = new RegExp(`<${escapeRegExp(tag)}[\\s>]`, "iu").exec(html);
  const close = html.toLowerCase().lastIndexOf(`</${tag.toLowerCase()}>`);
  return open && close > open.index ? html.slice(open.index, close) : html;
};

const HIDDEN_MARKUP = /<(?<tag>script|style|svg)\b[\s\S]*?<\/\k<tag>>/giu;

/** `html` without its script, style, and svg elements, removed until none is left. */
const withoutHiddenMarkup = (html) => {
  let out = html;
  let previous;
  do {
    previous = out;
    out = out.replaceAll(HIDDEN_MARKUP, "");
  } while (out !== previous);
  return out;
};

const ANCHOR = /<a\b(?<attributes>[^>]*)>(?<content>[\s\S]*?)<\/a\s*>/giu;
// Permalinks that sit beside a heading's text, never around it: MkDocs and
// Sphinx (`headerlink`), Docusaurus (`hash-link`), and Starlight.
const PERMALINK_CLASS =
  /\sclass\s*=\s*["'](?:[^"']*\s)?(?:headerlink|hash-link|sl-anchor-link)(?:\s[^"']*)?["']/iu;
const HEADING =
  /<h(?<level>[1-6])(?<attributes>\s[^>]*)?>(?<inner>[\s\S]*?)<\/h\k<level>\s*>/giu;
const ID_ATTRIBUTE =
  /\sid\s*=\s*(?:"(?<double>[^"]*)"|'(?<single>[^']*)'|(?<bare>[^\s"'>]+))/iu;

const dropEntity = () => "";

/** Markup as the text a reader sees: tags gone, entities decoded. */
const visibleText = (markup) =>
  decodeEntities(markup.replaceAll(/<[^>]*>/gu, " "), dropEntity);

/**
 * A heading's markup without its permalink: one by a known class, or a link
 * with no letters or digits in it (`¶`, `#`, a zero-width space, an icon).
 * A link around the heading's text, as Blume and VuePress 2 write it, stays.
 */
const withoutPermalinks = (inner) =>
  inner.replaceAll(ANCHOR, (match, attributes, content) =>
    PERMALINK_CLASS.test(` ${attributes}`) ||
    !/[\p{L}\p{N}]/u.test(visibleText(content))
      ? " "
      : match
  );

/** Every heading with an id, in document order: `{ id, level, text }`. */
const htmlHeadings = (html) => {
  const out = [];
  for (const match of withoutHiddenMarkup(html).matchAll(HEADING)) {
    const { attributes = "", inner, level } = match.groups;
    const id = ID_ATTRIBUTE.exec(attributes)?.groups;
    const value = decodeEntities(id?.double ?? id?.single ?? id?.bare ?? "");
    if (value) {
      const text = visibleText(withoutPermalinks(inner))
        .replaceAll(/\s+/gu, " ")
        .trim();
      out.push({ id: value, level: Number(level), text });
    }
  }
  return out;
};

/** Letters and digits only, so markup, punctuation, and emoji can't break a pair. */
const normalize = (text) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, "");

// --- Routes and source files --------------------------------------------------

/** A path as reports show it: relative to `from`, with `/` on every platform. */
const shown = (from, file) =>
  path.relative(from, file).split(path.sep).join("/");

/** A path with symlinks resolved (macOS's /var is /private/var), so reports stay relative. */
const real = (file) => {
  try {
    return realpathSync(file);
  } catch {
    return file;
  }
};

const ORDERING_PREFIX = /^\d+[-_.]/u;
const NOT_AN_ORDER = /^(?:\d+\.\d|\d{4}-\d{2}-\d{2}(?:[-_.]|$))/u;
const GROUP = /^\(.*\)$/u;

const stripOrder = (name) =>
  NOT_AN_ORDER.test(name) ? name : name.replace(ORDERING_PREFIX, "");

/** A route without a trailing slash (`/` stays `/`), decoded. */
const toRoute = (value) => {
  let route = value.replace(/[?#].*$/u, "");
  try {
    route = decodeURI(route);
  } catch {
    // Keep a malformed escape as written.
  }
  route = route.startsWith("/") ? route : `/${route}`;
  return route.length > 1 ? route.replace(/\/+$/u, "") : route;
};

const FRONTMATTER = /^---\r?\n(?<yaml>[\s\S]*?)\r?\n---/u;
const SLUG = /^slug:\s*["']?(?<slug>[^"'\n]+?)["']?\s*$/mu;

const frontmatterSlug = (text) => {
  const yaml = FRONTMATTER.exec(text)?.groups?.yaml ?? "";
  return SLUG.exec(yaml)?.groups?.slug.trim();
};

const walkContent = (dir, files = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const skipped = entry.name.startsWith(".") || entry.name === "node_modules";
    if (!skipped && entry.isDirectory()) {
      walkContent(full, files);
    } else if (!skipped && /\.mdx?$/u.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
};

/** The route Blume gives a content file, for projects without a manifest. */
const deriveRoute = (contentRoot, file) => {
  const slug = frontmatterSlug(readFileSync(file, "utf-8"));
  if (slug) {
    return toRoute(slug);
  }
  const segments = [];
  const relative = path.relative(contentRoot, file).replace(/\.mdx?$/u, "");
  for (const part of relative.split(path.sep)) {
    const name = stripOrder(part);
    if (!(GROUP.test(part) || GROUP.test(name) || name === "index")) {
      segments.push(name.replaceAll(/[:#?%]/gu, ""));
    }
  }
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
};

const isPublished = (contentRoot, file) =>
  path
    .relative(contentRoot, file)
    .split(path.sep)
    .every((part) => !part.startsWith("_"));

const pagesFromManifest = (manifestPath, options, cwd) => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const pages = [];
  for (const entry of manifest.routes ?? []) {
    const route = String(entry.path ?? "");
    const file = String(entry.sourcePath ?? "");
    if (route && file && existsSync(file)) {
      pages.push({ file: real(file), route });
    }
  }
  const contentRoot = real(
    options.docs
      ? path.resolve(cwd, options.docs)
      : String(manifest.contentRoot ?? path.resolve(cwd, "docs"))
  );
  return { contentRoot, pages };
};

/** `{ contentRoot, pages: [{ route, file }] }` from the manifest or the files. */
const loadPages = (options, cwd) => {
  const runtime = process.env.BLUME_RUNTIME_DIR ?? ".blume";
  const manifestPath = path.resolve(
    cwd,
    options.manifest ?? path.join(runtime, "blume.manifest.json")
  );
  if (existsSync(manifestPath)) {
    return pagesFromManifest(manifestPath, options, cwd);
  }
  if (options.manifest) {
    throw new Error(`no manifest at ${manifestPath}`);
  }
  const contentRoot = real(path.resolve(cwd, options.docs ?? "docs"));
  if (!existsSync(contentRoot)) {
    throw new Error(
      `no Blume manifest (run \`blume build\` first) and no content root at ${contentRoot}`
    );
  }
  const pages = walkContent(contentRoot)
    .filter((file) => isPublished(contentRoot, file))
    .map((file) => ({ file, route: deriveRoute(contentRoot, file) }));
  return { contentRoot, pages };
};

/** New route → the old URLs to try for it, from --map. */
const loadMap = (file) => {
  if (!existsSync(file)) {
    throw new Error(
      `no redirect map at ${file}: a build writes dist/blume-redirects.json only when no host adapter is set, so save the config's \`redirects\` as JSON instead`
    );
  }
  const data = JSON.parse(readFileSync(file, "utf-8"));
  const entries = Array.isArray(data)
    ? data.map((entry) => [entry.from, entry.to])
    : Object.entries(data);
  const oldFor = new Map();
  for (const [rawFrom, rawTo] of entries) {
    const from = String(rawFrom ?? "");
    const to = String(rawTo ?? "");
    const skip =
      !(from && to) ||
      /[:*]/u.test(from) ||
      /\.mdx?$/u.test(from) ||
      /^[a-z]+:\/\//iu.test(to);
    if (!skip) {
      const route = toRoute(to);
      oldFor.set(route, [...(oldFor.get(route) ?? []), toRoute(from)]);
    }
  }
  return oldFor;
};

// --- Old pages ------------------------------------------------------------------

const readOldFile = (dir, route) => {
  const base = path.join(dir, ...route.split("/").filter(Boolean));
  const candidates =
    route === "/"
      ? [path.join(dir, "index.html")]
      : [path.join(base, "index.html"), `${base}.html`, base];
  const file = candidates.find(
    (candidate) =>
      candidate.endsWith(".html") &&
      existsSync(candidate) &&
      statSync(candidate).isFile()
  );
  return file ? readFileSync(file, "utf-8") : null;
};

const fetchPage = async (url) => {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "blume-pin-heading-ids" },
      signal: AbortSignal.timeout(30_000),
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
};

const createOldSite = (options, cwd) => {
  if (!/^https?:\/\//iu.test(options.old)) {
    const dir = path.resolve(cwd, options.old);
    if (!existsSync(dir)) {
      throw new Error(`no old site at ${dir}`);
    }
    return { read: (route) => Promise.resolve(readOldFile(dir, route)) };
  }
  const base = options.old.replace(/\/+$/u, "");
  const cache = path.resolve(cwd, options.cache ?? ".pin-heading-ids-cache");
  const delay = Number(options.delay ?? 500);
  let lastFetch = 0;
  const read = async (route) => {
    mkdirSync(cache, { recursive: true });
    const key = path.join(cache, `${encodeURIComponent(route)}.html`);
    if (existsSync(key)) {
      return readFileSync(key, "utf-8");
    }
    // Be gentle with the old host: one request at a time, spaced out.
    const wait = lastFetch + delay - Date.now();
    if (wait > 0) {
      await sleep(wait);
    }
    lastFetch = Date.now();
    const html = await fetchPage(`${base}${encodeURI(route)}`);
    if (html !== null) {
      writeFileSync(key, html);
    }
    return html;
  };
  return { read };
};

// --- Source headings -------------------------------------------------------------

// Trailing heading markers Blume reads: `[#id]`, `{#id}`, `\{#id\}`, `[toc]`, `[!toc]`.
const MARKER = /\s*(?:\\?\{#[^\s}\\]+\\?\}|\[#[^\s\]]+\]|\[!?toc\])\s*$/u;
const ID_MARKER =
  /^\s*(?:\\?\{#(?<curly>[^\s}\\]+)\\?\}|\[#(?<bracket>[^\s\]]+)\])\s*$/u;
const VARIABLE = /\{\{\s*[\w-]+\s*\}\}/gu;
const INCLUDE =
  /^\s*<include\b(?<attributes>[^>]*)>\s*(?<target>[^<]+?)\s*<\/include>/u;
const FENCE = /^\s*(?<fence>`{3,}|~{3,})/u;

/** Split a heading line into its body and its trailing markers. */
const splitMarkers = (line) => {
  let body = line;
  const markers = [];
  for (let match = MARKER.exec(body); match; match = MARKER.exec(body)) {
    markers.unshift(match[0].trim());
    body = body.slice(0, match.index);
  }
  return { body, markers };
};

/** The id a heading's markers already pin, if any. */
const pinnedId = (markers) => {
  const groups = markers
    .map((marker) => ID_MARKER.exec(marker)?.groups)
    .find(Boolean);
  return groups?.curly ?? groups?.bracket;
};

const ESCAPED_PUNCTUATION = /\\[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/gu;
// Not opened by an escaped backtick; closed by any run of the same length, as
// escapes don't work inside.
const CODE_SPAN = /(?<!\\)(?<ticks>`+)(?<code>[\s\S]*?)\k<ticks>/gu;
const HELD_CODE = /\uE000(?<index>\d+)\uE000/gu;

/** A heading's visible text, with `{{variables}}` kept as placeholders. */
const plainText = (body) => {
  const spans = [];
  const prose = body
    .replace(/^\s*#{1,6}\s+/u, "")
    .replace(/\s+#+\s*$/u, "")
    // Code spans are literal: no escapes, tags, links, or entities inside.
    .replaceAll(CODE_SPAN, (_match, _ticks, code) => {
      spans.push(code);
      return `\uE000${spans.length - 1}\uE000`;
    })
    // So is an escaped character, and only letters and digits are compared,
    // so it reads as a space: `Promise\<App>` keeps its `App`.
    .replaceAll(ESCAPED_PUNCTUATION, " ");
  return decodeEntities(
    prose
      .replaceAll(/!\[[^\]]*\]\([^)]*\)/gu, "")
      .replaceAll(/\[(?<label>[^\]]*)\]\([^)]*\)/gu, "$<label>")
      .replaceAll(/<[^>]*>/gu, " ")
  ).replaceAll(HELD_CODE, (_match, index) => spans[Number(index)]);
};

/** A matcher for a source heading against a rendered heading's text. */
const textMatcher = (text) => {
  const parts = text
    .split(VARIABLE)
    .map((part) => normalize(part).replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
  return new RegExp(`^${parts.join(".*")}$`, "u");
};

/** Index of the line after the frontmatter block, or 0. */
const bodyStart = (lines) => {
  if (lines[0]?.trim() !== "---") {
    return 0;
  }
  return (
    lines.findIndex((line, index) => index > 0 && line.trim() === "---") + 1
  );
};

/** An `<include>` statement at `i`, joined when a formatter wrapped it. */
const includeAt = (lines, i) => {
  const line = lines[i];
  if (!/^\s*<include\b/u.test(line)) {
    return null;
  }
  if (line.includes("</include>")) {
    return { end: i, groups: INCLUDE.exec(line)?.groups };
  }
  const end = lines.findIndex(
    (next, index) => index > i && next.includes("</include>")
  );
  if (end === -1 || end - i > 5) {
    return null;
  }
  const statement = lines.slice(i, end + 1).join(" ");
  return { end, groups: INCLUDE.exec(statement)?.groups };
};

const resolveInclude = (file, target, context) =>
  target.startsWith("/")
    ? path.join(context.contentRoot, target)
    : path.resolve(path.dirname(file), target);

/** Every heading in a file and the partials it includes, in order. */
const sourceHeadings = (file, context, seen = new Set()) => {
  if (seen.has(file)) {
    return [];
  }
  const included = seen.size > 0;
  const nextSeen = new Set([...seen, file]);
  const lines = readFileSync(file, "utf-8").split("\n");
  const heading = file.endsWith(".mdx")
    ? /^\s*#{1,6}\s+\S/u
    : /^ {0,3}#{1,6}\s+\S/u;
  const out = [];
  let fence = null;
  for (let i = bodyStart(lines); i < lines.length; i += 1) {
    const line = lines[i];
    const opener = FENCE.exec(line)?.groups?.fence;
    const include = fence || opener ? null : includeAt(lines, i);
    if (opener && !fence) {
      fence = opener;
    } else if (fence) {
      fence = line.trim().startsWith(fence) ? null : fence;
    } else if (include?.groups) {
      i = include.end;
      const { target } = include.groups;
      const resolved = resolveInclude(file, target, context);
      if (existsSync(resolved)) {
        out.push(...sourceHeadings(resolved, context, nextSeen));
      } else {
        context.notes.push(
          `${shown(context.cwd, file)}: include not found: ${target}`
        );
      }
    } else if (heading.test(line)) {
      const { body, markers } = splitMarkers(line);
      out.push({
        file,
        included,
        index: i,
        match: textMatcher(plainText(body)),
        pinned: pinnedId(markers),
      });
    }
  }
  return out;
};

/** The marker that pins `id` in `entry`'s file. */
const markerFor = (entry, id) => {
  if (entry.included) {
    return `\\{#${id}\\}`;
  }
  return entry.file.endsWith(".mdx") ? `[#${id}]` : `{#${id}}`;
};

/** `line` with its id marker replaced by, or extended with, `marker`. */
const applyMarker = (line, marker) => {
  const { body, markers } = splitMarkers(line);
  const kept = markers.filter((existing) => !ID_MARKER.test(existing));
  const text = body.trimEnd().replace(/\s+#+$/u, "");
  return [text, ...kept, marker].join(" ");
};

// --- Linked ids ---------------------------------------------------------------------

const fragmentOf = (target) => {
  const hash = target.lastIndexOf("#");
  if (hash === -1) {
    return;
  }
  const fragment = target.slice(hash + 1).trim();
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
};

const LINK_TARGET = /\]\(\s*<?(?<target>[^)\s>]*#[^)\s>]+)/gu;
const HREF_TARGET = /\bhref=\{?["'](?<target>[^"']*#[^"']+)["']/gu;

const linkedIds = (options, contentRoot, cwd) => {
  const ids = new Set();
  if (options.links) {
    const listed = readFileSync(path.resolve(cwd, options.links), "utf-8");
    for (const line of listed.split("\n")) {
      const value = line.trim();
      if (value) {
        ids.add(fragmentOf(value) ?? value);
      }
    }
  }
  for (const file of walkContent(contentRoot)) {
    const text = readFileSync(file, "utf-8");
    for (const match of [
      ...text.matchAll(LINK_TARGET),
      ...text.matchAll(HREF_TARGET),
    ]) {
      ids.add(fragmentOf(match.groups.target));
    }
  }
  ids.delete();
  ids.delete("");
  return ids;
};

// --- Pairing -------------------------------------------------------------------------

const isDirectory = (dir) => existsSync(dir) && statSync(dir).isDirectory();

/**
 * The directory holding the pages: a server build's `client/` half, else
 * `dist`. node() and cloudflare() write `client/` beside `server/`, vercel()
 * writes only `client/`, and none of them puts an index.html in `dist`.
 */
const pagesRoot = (dist) => {
  const client = path.join(dist, "client");
  if (isDirectory(client) && !existsSync(path.join(dist, "index.html"))) {
    process.stderr.write(
      `pin-heading-ids: reading ${client}, a server build's pages.\n`
    );
    return client;
  }
  return dist;
};

const distPage = (dist, route) => {
  const base = path.join(dist, ...route.split("/").filter(Boolean));
  const candidates =
    route === "/"
      ? [path.join(dist, "index.html")]
      : [path.join(base, "index.html"), `${base}.html`];
  return candidates.find((candidate) => existsSync(candidate));
};

/** The next unused source line, from the cursor on, whose text matches `key`. */
const takeSource = (lines, state, key) => {
  let s = state.sourceCursor;
  while (s < lines.length && (lines[s].used || !lines[s].match.test(key))) {
    s += 1;
  }
  const entry = lines[s];
  if (entry) {
    entry.used = true;
    state.sourceCursor = s + 1;
  }
  return entry;
};

const TITLE = /<h1(?<attributes>\s[^>]*)?>(?<inner>[\s\S]*?)<\/h1\s*>/iu;

/**
 * The index of the old heading that became the page title: the first old h1
 * with the text of the build's title, an h1 Blume renders without an id.
 * Else -1.
 */
const oldTitleIndex = (before, builtHtml) => {
  const title = TITLE.exec(withoutHiddenMarkup(builtHtml))?.groups;
  if (!title || ID_ATTRIBUTE.test(title.attributes ?? "")) {
    return -1;
  }
  const key = normalize(visibleText(title.inner));
  return before.findIndex(
    (heading) => heading.level === 1 && normalize(heading.text) === key
  );
};

/**
 * The next old heading, from the cursor on, with the same text as `key`.
 * A section heading passes over the one the page title took: a section that
 * repeats the title's text (`# Install`, then `## Install`, which the old site
 * gave `#install-1`) pairs with its own old heading. A built h1 is the source's
 * own `# Install`, kept beside the title, so it pairs with the old title. A
 * later old h1 (a section the migration turned into an h2) still pairs.
 */
const takeOld = (before, state, heading, title) => {
  const key = normalize(heading.text);
  const skip = heading.level > 1 ? title : -1;
  let k = state.oldCursor;
  while (
    k < before.length &&
    (k === skip || normalize(before[k].text) !== key)
  ) {
    k += 1;
  }
  if (k === before.length) {
    return -1;
  }
  state.oldCursor = k + 1;
  return k;
};

/** Record a pin for one paired heading whose ids differ, or note why not. */
const pinHeading = (result, page, heading, oldId, entry) => {
  const { claims, cwd, edits, notes, pins } = result;
  if (!entry) {
    notes.push(
      `${page.route}: no source line for "${heading.text}" (#${heading.id})`
    );
    return;
  }
  if (/[\s\]}\\]/u.test(oldId)) {
    notes.push(
      `${page.route}: #${oldId} can't be written as a pin; link to #${heading.id} instead`
    );
    return;
  }
  // One source line can render on several pages (an included partial), and
  // it can pin only one id: the first page to claim it wins.
  const claim = `${entry.file}\n${entry.index}`;
  const claimed = claims.get(claim);
  if (claimed && claimed !== oldId) {
    notes.push(
      `${shown(cwd, entry.file)}:${entry.index + 1}: renders with two old ids (#${claimed}, #${oldId}), and a line pins one; kept #${claimed}`
    );
    return;
  }
  claims.set(claim, oldId);
  const fileEdits = edits.get(entry.file) ?? new Map();
  if (entry.pinned === oldId) {
    result.awaitingBuild += 1;
  } else if (!fileEdits.has(entry.index)) {
    fileEdits.set(entry.index, markerFor(entry, oldId));
    edits.set(entry.file, fileEdits);
    pins.push({
      file: shown(cwd, entry.file),
      from: heading.id,
      line: entry.index + 1,
      replaces: entry.pinned,
      route: page.route,
      text: heading.text,
      to: oldId,
    });
  }
};

const reportLost = (result, page, before, pairedOld) => {
  // An old h1 is the page title: a link to it lands at the top either way.
  for (const [k, heading] of before.entries()) {
    const reportable =
      !pairedOld.has(k) &&
      heading.level > 1 &&
      (!result.linked || result.linked.has(heading.id));
    if (reportable) {
      result.notes.push(
        `${page.route}: old heading #${heading.id} ("${heading.text}") has no counterpart; its anchor is lost`
      );
    }
  }
};

/** Pair one page's old and new headings, recording pins and notes. */
const pairPage = (result, page, oldHtml, builtHtml) => {
  const { linked, options } = result;
  const before = htmlHeadings(scope(oldHtml, options["old-scope"] ?? "main"));
  const built = scope(builtHtml, options["new-scope"] ?? "article");
  const after = htmlHeadings(built);
  const title = oldTitleIndex(before, built);
  const lines = sourceHeadings(page.file, result);
  const pairedOld = new Set();
  const state = { oldCursor: 0, sourceCursor: 0 };
  result.compared += 1;
  result.oldSections += before.filter((heading) => heading.level > 1).length;
  for (const heading of after) {
    const key = normalize(heading.text);
    // Source lines and rendered headings share an order, so both scan forward.
    const entry = takeSource(lines, state, key);
    const k = takeOld(before, state, heading, title);
    const oldId = k === -1 ? heading.id : before[k].id;
    if (k !== -1) {
      pairedOld.add(k);
      result.paired += 1;
    }
    if (oldId !== heading.id && linked && !linked.has(oldId)) {
      result.unlinked += 1;
    } else if (oldId !== heading.id) {
      pinHeading(result, page, heading, oldId, entry);
    }
  }
  reportLost(result, page, before, pairedOld);
};

/** The first old URL for a page that the old site has, as HTML. */
const findOldPage = async (oldSite, candidates) => {
  const [first, ...rest] = candidates;
  if (first === undefined) {
    return null;
  }
  return (await oldSite.read(first)) ?? findOldPage(oldSite, rest);
};

const writeEdits = (edits) => {
  for (const [file, fileEdits] of edits) {
    const lines = readFileSync(file, "utf-8").split("\n");
    for (const [index, marker] of fileEdits) {
      lines[index] = applyMarker(lines[index], marker);
    }
    writeFileSync(file, lines.join("\n"));
  }
};

/** Visit each page in route order, one at a time, so the old host never sees parallel requests. */
const visitPages = async (pages, visit) => {
  const [first, ...rest] = pages;
  if (first === undefined) {
    return;
  }
  await visit(first);
  await visitPages(rest, visit);
};

const run = async (options) => {
  const cwd = real(process.cwd());
  const { contentRoot, pages } = loadPages(options, cwd);
  const given = path.resolve(cwd, options.dist ?? "dist");
  if (!existsSync(given)) {
    throw new Error(`no build at ${given}: run \`blume build\` first`);
  }
  const dist = pagesRoot(given);
  const oldFor = options.map
    ? loadMap(path.resolve(cwd, options.map))
    : new Map();
  const oldSite = createOldSite(options, cwd);
  const onlyLinked = Boolean(options["only-linked"] || options.links);
  const result = {
    awaitingBuild: 0,
    claims: new Map(),
    compared: 0,
    contentRoot,
    cwd,
    dist,
    edits: new Map(),
    linked: onlyLinked ? linkedIds(options, contentRoot, cwd) : undefined,
    notes: [],
    oldSections: 0,
    options,
    paired: 0,
    pins: [],
    unlinked: 0,
  };
  const ordered = pages.toSorted((a, b) => a.route.localeCompare(b.route));
  await visitPages(ordered, async (page) => {
    const built = distPage(dist, page.route);
    if (!built) {
      result.notes.push(`${page.route}: not in the build`);
      return;
    }
    const candidates = [...(oldFor.get(page.route) ?? []), page.route];
    const oldHtml = await findOldPage(oldSite, candidates);
    if (oldHtml) {
      pairPage(result, page, oldHtml, readFileSync(built, "utf-8"));
    } else {
      result.notes.push(`${page.route}: not on the old site`);
    }
  });
  if (options.write) {
    writeEdits(result.edits);
  }
  return result;
};

// --- Report --------------------------------------------------------------------------

const summary = (result, write) => {
  const { awaitingBuild, notes, paired, pins, unlinked } = result;
  const files = new Set(pins.map((pin) => pin.file)).size;
  const parts = [
    `${paired} heading(s) paired`,
    `${pins.length} heading line(s) ${write ? "pinned" : "need a pin"} in ${files} file(s)`,
  ];
  if (awaitingBuild > 0) {
    parts.push(`${awaitingBuild} already pinned, waiting for a rebuild`);
  }
  if (unlinked > 0) {
    parts.push(
      `${unlinked} changed id(s) left alone because nothing links to them`
    );
  }
  parts.push(`${notes.length} note(s)`);
  return parts.join(" · ");
};

const report = (result, write) => {
  const out = result.pins.map((pin) => {
    const replaced = pin.replaces ? ` replaces #${pin.replaces}` : "";
    return `${pin.route}  "${pin.text}"  #${pin.from} → #${pin.to}  (${pin.file}:${pin.line})${replaced}`;
  });
  out.push(
    ...result.notes.map((note) => `NOTE ${note}`),
    summary(result, write)
  );
  if (result.pins.length > 0 && write) {
    out.push(
      "Rebuild and run again until it reports 0: a pin can change the -1 suffix of a later heading with the same text."
    );
  } else if (result.pins.length > 0) {
    out.push("Dry run: pass --write to apply.");
  }
  return out.join("\n");
};

/**
 * A warning when nothing paired for a reason other than an old site with no
 * section headings: no page found on both sides, usually the wrong --dist or
 * --old, or headings that never matched.
 */
const noPairsWarning = (result) => {
  if (result.paired > 0 || (result.compared > 0 && result.oldSections === 0)) {
    return;
  }
  const built = shown(result.cwd, result.dist) || ".";
  const where = `the build in ${built} and the old site at ${result.options.old}`;
  const what =
    result.compared === 0
      ? `no page was found in both ${where}`
      : `the old pages have ${result.oldSections} section heading(s), but none matched a heading in ${where}`;
  return [
    `WARNING: 0 headings paired: ${what}.`,
    "A server build keeps its pages in dist/client (read when dist has no index.html of its own); pass another folder with --dist. Check that --old points at the old site's pages, too.",
  ].join("\n");
};

const jsonReport = (result, write) =>
  JSON.stringify(
    {
      awaitingBuild: result.awaitingBuild,
      notes: result.notes,
      paired: result.paired,
      pins: result.pins,
      unlinked: result.unlinked,
      write,
    },
    null,
    2
  );

const main = async () => {
  let options = {};
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}\n`);
    process.exit(2);
  }
  if (options.help || options.h || process.argv.length <= 2) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (!options.old) {
    process.stderr.write(`--old is required\n\n${USAGE}\n`);
    process.exit(2);
  }
  try {
    const result = await run(options);
    const write = Boolean(options.write);
    const output = options.json
      ? jsonReport(result, write)
      : report(result, write);
    process.stdout.write(`${output}\n`);
    const warning = noPairsWarning(result);
    if (warning) {
      process.stderr.write(`${warning}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
};

await main();
