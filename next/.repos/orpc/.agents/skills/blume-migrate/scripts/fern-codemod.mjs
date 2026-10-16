#!/usr/bin/env node
// fern-codemod.mjs: the mechanical half of a Fern Docs → Blume migration.
// Run it from the folder that holds `fern/` (where blume.config.ts goes).
//
//   plan (default)  Reads fern/docs.yml, computes every URL the Fern site
//                   served (tabs, sections, slugs, skip-slug, frontmatter
//                   slugs, hidden pages, api summaries, changelog dates), and
//                   moves each page to a path in the content root that
//                   reproduces it. Writes a meta.ts per folder (docs.yml
//                   order, section titles and icons, collapse), maps
//                   frontmatter to Blume's strict schema, converts the Fern
//                   components a migration always meets (callouts, code
//                   groups, cards, accordions, icons, param fields,
//                   snippets, embeds),
//                   moves the assets pages use into public/, and saves
//                   fern-migration.json for the next step.
//   endpoints       After `blume build` and operation-routes.mjs: joins
//                   Fern's old API Reference URLs to the routes Blume built,
//                   translates docs.yml redirects, adds group and changelog
//                   redirects, rewrites links to old URLs, checks every old
//                   URL is served or redirected, and writes
//                   fern-redirects.json for blume.config.ts to import.
//
// It reports, never guesses, the judgment calls: changelog titles taken from
// file names, API embeds (<EndpointRequestSnippet> …), links already broken
// on Fern, unpublished drafts, CI and contributor docs. Versions, products,
// tab variants, and `folder:` entries stay with the agent (the reference
// covers them). It never touches generators.yml, the Fern Definition, or a
// spec. Zero dependencies, deterministic, idempotent (a moved page is
// skipped, and its URL comes from fern-migration.json). Dry run unless --write.

// oxlint-disable max-classes-per-file -- the YAML reader, the docs.yml walker, and the
// placer are separate state machines; one file keeps the script runnable with a bare `node`.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

// --- YAML: the subset Fern config uses ---------------------------------------

const DASH = /^-(?:\s|$)/u;
const SKIP = /^\s*(?:#.*)?$|^(?:---|\.\.\.)\s*$/u;
const ESCAPES = {
  "/": "/",
  0: "\0",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};
const DOUBLE_BODY = /^(?:[^"\\]|\\[\s\S])*/u;
const SINGLE_BODY = /^(?:[^']|'')*/u;

const unescapeDouble = (text) =>
  text.replaceAll(
    /\\(?:x(?<hex>[\dA-Fa-f]{2})|u(?<uni>[\dA-Fa-f]{4})|(?<char>[\s\S]))/gu,
    (...match) => {
      const { char, hex, uni } = match.at(-1);
      if (hex || uni) {
        return String.fromCodePoint(Number.parseInt(hex ?? uni, 16));
      }
      return ESCAPES[char] ?? char;
    }
  );

/** Text before a ` # comment` that sits outside quotes. */
const stripComment = (text) => {
  let quote = "";
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const prev = i === 0 ? " " : text[i - 1];
    if (quote && char === "\\" && quote === '"') {
      i += 1;
    } else if (quote && char === quote) {
      quote = "";
    } else if (
      !quote &&
      (char === '"' || char === "'") &&
      /[\s,:[{]/u.test(prev)
    ) {
      quote = char;
    } else if (!quote && char === "#" && /\s/u.test(prev)) {
      return text.slice(0, i).trimEnd();
    }
  }
  return text.trimEnd();
};

const scalar = (raw) => {
  const value = raw.trim();
  if (/^(?:|~|null|Null|NULL)$/u.test(value)) {
    return null;
  }
  if (/^(?:true|True|TRUE|false|False|FALSE)$/u.test(value)) {
    return value.toLowerCase() === "true";
  }
  if (/^[-+]?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) {
    return Number(value);
  }
  return value;
};

/** Where a mapping key ends (`key: value`), or -1. */
const keyColon = (text) => {
  if (/^[[{]/u.test(text)) {
    return -1;
  }
  if (text[0] === '"' || text[0] === "'") {
    const close = text.indexOf(text[0], 1);
    return close !== -1 && /^:(?:\s|$)/u.test(text.slice(close + 1))
      ? close + 1
      : -1;
  }
  const match = /:(?:\s|$)/u.exec(text);
  return match && !/\s#/u.test(text.slice(0, match.index)) ? match.index : -1;
};

const keyText = (raw) => {
  const key = raw.trim();
  if (key[0] === '"') {
    return unescapeDouble(key.slice(1, -1));
  }
  return key[0] === "'" ? key.slice(1, -1).replaceAll("''", "'") : key;
};

/** A one-line flow collection: `[a, "b"]`, `{ name: x, env: Y }`. */
const parseFlow = (text) => {
  let at = 0;
  const space = () => {
    while (/\s/u.test(text[at] ?? "")) {
      at += 1;
    }
  };
  const quoted = () => {
    const quote = text[at];
    const end = text.indexOf(quote, at + 1);
    const inner = text.slice(at + 1, end);
    at = end + 1;
    return quote === '"' ? unescapeDouble(inner) : inner;
  };
  const value = (stops) => {
    space();
    if (text[at] === "[" || text[at] === "{") {
      const close = text[at] === "[" ? "]" : "}";
      const entries = [];
      at += 1;
      for (space(); text[at] !== close && at < text.length; space()) {
        const key = value(close === "}" ? /[,:}]/u : /[,\]]/u);
        space();
        if (close === "}" && text[at] === ":") {
          at += 1;
          entries.push([String(key), value(/[,}]/u)]);
        } else {
          entries.push(close === "}" ? [String(key), null] : key);
        }
        space();
        at += text[at] === "," ? 1 : 0;
      }
      at += 1;
      return close === "]" ? entries : Object.fromEntries(entries);
    }
    if (text[at] === '"' || text[at] === "'") {
      return quoted();
    }
    const start = at;
    while (at < text.length && !stops.test(text[at])) {
      at += 1;
    }
    return scalar(text.slice(start, at));
  };
  return value(/[,\]}]/u);
};

/** Fold continuation lines the way a YAML flow scalar does. */
const fold = (parts) => {
  let out = parts[0].trimEnd();
  let breaks = 0;
  for (const part of parts.slice(1)) {
    if (part.trim() === "") {
      breaks += 1;
    } else {
      out += `${breaks > 0 ? "\n".repeat(breaks) : " "}${part.trim()}`;
      breaks = 0;
    }
  }
  return out;
};

class YamlReader {
  constructor(source, file) {
    this.lines = source.replaceAll(/\r\n?/gu, "\n").split("\n");
    this.at = 0;
    this.file = file;
  }

  fail(message, line = this.at) {
    throw new Error(`${this.file}:${line + 1}: ${message}`);
  }

  indentOf(line) {
    const [lead] = /^[\t ]*/u.exec(line);
    if (lead.includes("\t")) {
      this.fail("tabs in indentation aren't supported");
    }
    return lead.length;
  }

  peek() {
    let i = this.at;
    while (i < this.lines.length && SKIP.test(this.lines[i])) {
      i += 1;
    }
    return i;
  }

  read() {
    const start = this.peek();
    if (start >= this.lines.length) {
      return null;
    }
    const result = this.block(this.indentOf(this.lines[start]));
    const rest = this.peek();
    if (rest < this.lines.length) {
      this.fail(`unexpected content: ${this.lines[rest].trim()}`, rest);
    }
    return result;
  }

  block(indent) {
    this.at = this.peek();
    const line = this.lines[this.at].slice(indent);
    if (DASH.test(line)) {
      return this.list(indent);
    }
    if (keyColon(line) !== -1) {
      return this.map(indent);
    }
    return this.value(line, indent - 1, false);
  }

  map(indent) {
    const map = {};
    for (let i = this.peek(); i < this.lines.length; i = this.peek()) {
      const depth = this.indentOf(this.lines[i]);
      const line = this.lines[i].slice(depth);
      if (depth < indent || DASH.test(line)) {
        break;
      }
      const colon = keyColon(line);
      if (depth > indent || colon === -1) {
        this.fail(`expected "key: value" at this indentation: ${line}`, i);
      }
      this.at = i;
      map[keyText(line.slice(0, colon))] = this.value(
        line.slice(colon + 1),
        depth,
        true
      );
    }
    this.at = this.peek();
    return map;
  }

  list(indent) {
    const items = [];
    for (let i = this.peek(); i < this.lines.length; i = this.peek()) {
      const depth = this.indentOf(this.lines[i]);
      const line = this.lines[i].slice(depth);
      if (depth !== indent || !DASH.test(line)) {
        break;
      }
      this.at = i;
      const content = line.slice(1).trimStart();
      const column = depth + line.length - content.length;
      const nested = DASH.test(content) || keyColon(content) !== -1;
      if (content && !content.startsWith("#") && nested) {
        // A map or list starting on the dash line: read it at its own column.
        this.lines[i] = `${" ".repeat(column)}${content}`;
        items.push(this.block(column));
      } else {
        items.push(this.value(content, depth, false));
      }
    }
    this.at = this.peek();
    return items;
  }

  value(rest, parent, compactList) {
    const text = stripComment(rest).trim();
    if (text === "") {
      this.at += 1;
      const next = this.peek();
      const depth =
        next < this.lines.length ? this.indentOf(this.lines[next]) : -1;
      const sameLevelList =
        compactList &&
        depth === parent &&
        DASH.test(this.lines[next].slice(depth));
      return depth > parent || sameLevelList ? this.block(depth) : null;
    }
    if (/^[!&*]/u.test(text)) {
      return this.fail("anchors, aliases, and tags aren't supported");
    }
    if (/^[>|]/u.test(text)) {
      return this.literal(text, parent);
    }
    if (text[0] === "[" || text[0] === "{") {
      this.at += 1;
      return parseFlow(text);
    }
    if (text[0] === '"' || text[0] === "'") {
      return this.quoted(rest.trim());
    }
    return this.plain(text, parent);
  }

  plain(first, parent) {
    const parts = [first];
    for (this.at += 1; this.at < this.lines.length; this.at += 1) {
      const line = this.lines[this.at];
      if (line.trim() === "") {
        parts.push("");
      } else if (SKIP.test(line) || this.indentOf(line) <= parent) {
        break;
      } else {
        parts.push(stripComment(line));
      }
    }
    while (parts.at(-1) === "") {
      parts.pop();
      this.at -= 1;
    }
    return parts.length === 1 ? scalar(first) : fold(parts);
  }

  quoted(first) {
    const double = first[0] === '"';
    const [inner] = (double ? DOUBLE_BODY : SINGLE_BODY).exec(first.slice(1));
    if (inner.length >= first.length - 1) {
      this.fail("a quoted string that spans lines isn't supported");
    }
    this.at += 1;
    return double ? unescapeDouble(inner) : inner.replaceAll("''", "'");
  }

  literal(header, parent) {
    const { chomp, style } = /^(?<style>[>|])(?<chomp>[+-]?)/u.exec(
      header
    ).groups;
    const body = [];
    let indent = -1;
    for (this.at += 1; this.at < this.lines.length; this.at += 1) {
      const line = this.lines[this.at];
      const blank = line.trim() === "";
      const depth = blank ? indent : this.indentOf(line);
      indent = indent === -1 ? depth : indent;
      if (!blank && (depth <= parent || depth < indent)) {
        break;
      }
      body.push(blank ? "" : line.slice(indent));
    }
    let trailing = 0;
    while (body.at(-1) === "") {
      body.pop();
      trailing += 1;
    }
    let text = body.join("\n");
    if (style === ">") {
      // Folded: a line break between two plain lines becomes a space.
      text = body
        .map((line, i) =>
          i > 0 && line && body[i - 1] && !/^\s/u.test(line)
            ? ` ${line}`
            : `${i > 0 ? "\n" : ""}${line}`
        )
        .join("");
    }
    if (body.length === 0 || chomp === "-") {
      return text;
    }
    return chomp === "+" ? `${text}\n${"\n".repeat(trailing)}` : `${text}\n`;
  }
}

const parseYaml = (source, file) => new YamlReader(source, file).read();

// --- Slugs -----------------------------------------------------------------------

// lodash `kebabCase`, which Fern uses for every generated slug: apostrophes
// dropped, accents folded, words split at case changes and letter/digit
// boundaries (`v3 (Latest)` → `v-3-latest`, `AgentMail` → `agent-mail`).
const WORD =
  /[A-Z]?[a-z]+(?=[^\dA-Za-z]|[A-Z]|$)|[A-Z]+(?=[^\dA-Za-z]|[A-Z][a-z]|$)|[A-Z]?[a-z]+|[A-Z]+|\d*(?:1ST|2ND|3RD|(?![123])\dTH)(?=\b|[_a-z])|\d*(?:1st|2nd|3rd|(?![123])\dth)(?=\b|[A-Z_])|\d+/gu;
const kebab = (value) =>
  (
    String(value ?? "")
      .normalize("NFD")
      .replaceAll(/[̀-ͯ'’]/gu, "")
      .match(WORD) ?? []
  )
    .map((word) => word.toLowerCase())
    .join("-");

/** Blume's ordering-prefix rule (core/ordering-prefix.ts). */
const stripOrder = (name) =>
  /^(?:\d+\.\d|\d{4}-\d{2}-\d{2}(?:[-_.]|$))/u.test(name)
    ? name
    : name.replace(/^\d+[-_.]/u, "");
const childSlug = (name) =>
  stripOrder(name.replace(/^\((?<inner>.*)\)$/u, "$<inner>"));
const joinUrl = (...parts) =>
  `/${parts
    .flat()
    .filter((part) => part !== undefined && part !== null && part !== "")
    .flatMap((part) => String(part).split("/"))
    .filter(Boolean)
    .join("/")}`;
const normUrl = (url) => (url.length > 1 ? url.replace(/\/+$/u, "") : url);
const folderRoute = (folder) =>
  joinUrl(
    folder
      .split("/")
      .filter((segment) => segment && !/^\(.*\)$/u.test(segment))
      .map(stripOrder)
  );

// --- Icons: Font Awesome → Lucide ---------------------------------------------------

// `name` maps to itself, `name:other` to another Lucide name, and `name:` to
// nothing (dropped and reported). Every target is in the set Blume bundles.
const ICON_TABLE = `
address-book:book-user angle-right:chevron-right arrow-right arrow-right-from-bracket:log-out
arrow-up-right-from-square:external-link at:at-sign aws: ban bars:menu bell bolt:zap
bolt-lightning:zap book book-open bookmark box-open:package-open boxes brain briefcase bug building
bullhorn:megaphone calendar certificate:badge-check chart-line chart-simple:chart-column check
circle-check circle-exclamation:circle-alert circle-info:info circle-question:circle-help
circle-xmark:circle-x clipboard clock clone:copy cloud cloud-arrow-up:cloud-upload code
code-branch:git-branch code-merge:git-merge cog:settings comment:message-square
comments:messages-square compass copy credit-card cube:box cubes:boxes database
diagram-project:workflow discord: docker: dollar-sign download ellipsis ellipsis-h:ellipsis
envelope:mail envelope-circle-check:mail-check envelope-open:mail-open envelope-open-text:mail-open
eye face-frown:frown face-smile:smile facebook file file-code file-invoice:file-text
file-lines:file-text filter fire:flame flag flask:flask-conical folder folder-open gauge
gauge-high:gauge gear:settings gears:settings gift github gitlab globe google: graduation-cap hand
hand-holding:hand-helping handshake headset heart home:house house image inbox info instagram key
keyboard laptop-code:laptop layer-group:layers leaf life-ring:life-buoy lightbulb link
link-slash:unlink linkedin list list-check:list-checks location-dot:map-pin lock magic:sparkles
magnifying-glass:search map map-marker:map-pin medium: message:message-square microchip:cpu
microphone:mic money-bill:banknote money-bill-wave:banknote moon n: network-wired:network newspaper
node-js: npm: paper-plane:send paperclip pen pen-to-square:square-pen pencil people-group:users
phone play plug plus puzzle puzzle-piece:puzzle python: question:circle-help repeat
right-from-bracket:log-out right-left:arrow-left-right right-to-bracket:log-in robot:bot rocket
rotate-left:rotate-ccw rotate-right:rotate-cw route rss scissors screwdriver-wrench:wrench
search server shield shield-alt:shield shield-check shield-halved:shield shield-virus:shield-alert
sitemap:network slack sliders:sliders-horizontal sparkles star table tag tags
temperature-half:thermometer terminal times:x toolbox:wrench trash trash-can:trash-2
triangle-exclamation:triangle-alert twitter unlock upload user user-check user-gear:user-cog
user-plus user-shield:shield-user users video walkie-talkie:radio wand-magic-sparkles:sparkles
warning:triangle-alert webhook wrench x x-twitter: xmark:x youtube zap
`;
const ICONS = new Map(
  ICON_TABLE.trim()
    .split(/\s+/u)
    .map((pair) => {
      const [name, target = name] = pair.split(":");
      return [name, target || null];
    })
);
const ICON_STYLE =
  /^(?:fa-)?(?:brands|duotone|light|regular|sharp|solid|thin)\s+/u;

/** A Font Awesome spelling as Fern accepts it → { lucide } | { asset } | { dropped } | { unknown }. */
const mapIcon = (value) => {
  const raw = String(value ?? "").trim();
  if (raw === "" || raw.startsWith("<svg")) {
    return raw ? { lucide: raw } : {};
  }
  if (/^(?:\.{0,2}\/|https?:)|\.(?:gif|jpe?g|png|svg|webp)$/iu.test(raw)) {
    return { asset: raw };
  }
  let name = raw;
  while (ICON_STYLE.test(name)) {
    name = name.replace(ICON_STYLE, "");
  }
  name = name.replace(/^fa-/u, "");
  if (!ICONS.has(name)) {
    return { unknown: raw };
  }
  return ICONS.get(name) ? { lucide: ICONS.get(name) } : { dropped: raw };
};

// --- Files and reports ----------------------------------------------------------------

const toPosix = (file) => file.split(path.sep).join("/");
const readText = (file) => readFileSync(file, "utf-8").replaceAll("\r\n", "\n");
const byName = (a, b) => (a < b ? -1 : Number(a > b));

const listFiles = (dir, rel = "") => {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(path.join(dir, rel))
    .toSorted(byName)
    .filter((name) => name !== "node_modules" && !name.startsWith("."))
    .flatMap((name) => {
      const child = rel ? `${rel}/${name}` : name;
      return statSync(path.join(dir, child)).isDirectory()
        ? listFiles(dir, child)
        : [child];
    });
};

const splitFrontmatter = (text) => {
  const match = /^---\n(?<yaml>[\s\S]*?)\n---[\t ]*(?:\n|$)/u.exec(text);
  return match
    ? { body: text.slice(match[0].length), raw: match.groups.yaml }
    : { body: text, raw: null };
};

const moveFile = (from, to, text) => {
  mkdirSync(path.dirname(to), { recursive: true });
  renameSync(from, to);
  if (text !== undefined) {
    writeFileSync(to, text);
  }
};

const makeReport = () => {
  const entries = [];
  const add = (kind) => (where, detail) => {
    entries.push({ detail, kind, where });
  };
  /** Report an icon that didn't map to a Lucide name (a no-op when it did). */
  const icon = (where, found) => {
    let detail;
    if (found.dropped) {
      detail = `icon ${found.dropped} has no Lucide equivalent: dropped`;
    } else if (found.unknown) {
      detail = `icon ${found.unknown} isn't in the table: set a Lucide name by hand`;
    } else if (found.asset) {
      detail = `icon ${found.asset} is an image: move it into public/ and set its root-absolute path by hand`;
    }
    if (detail) {
      entries.push({ detail, kind: "icon", where });
    }
  };
  return {
    drop: add("dropped"),
    entries,
    icon,
    note: add("note"),
    todo: add("todo"),
  };
};

// --- docs.yml → a tree of pages with their old URLs ------------------------------------

const CHANGELOG_FILE =
  /^(?:(?<y>\d{4})-(?<m>\d{1,2})-(?<d>\d{1,2})|(?<m2>\d{1,2})-(?<d2>\d{1,2})-(?<y2>\d{4}|\d{2}))(?:-(?<suffix>.+))?\.mdx?$/u;
const MONTHS =
  "January February March April May June July August September October November December".split(
    " "
  );

const changelogDate = (name) => {
  const groups = CHANGELOG_FILE.exec(name)?.groups;
  if (!groups) {
    return null;
  }
  const shortYear = groups.y2?.length === 2 ? `20${groups.y2}` : groups.y2;
  const year = groups.y ?? shortYear;
  const month = Number(groups.m ?? groups.m2);
  const day = Number(groups.d ?? groups.d2);
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { day, iso, month, suffix: groups.suffix, year };
};

const pageUrl = (slugs, own, fm) =>
  fm.slug ? joinUrl(String(fm.slug)) : joinUrl(slugs, own);

class Navigation {
  constructor(fernDir, report, previous) {
    this.fernDir = fernDir;
    this.report = report;
    this.previous = previous;
    this.referenced = new Set();
    this.apis = [];
    this.seen = new Map();
  }

  rel(file) {
    return toPosix(path.relative(this.fernDir, file));
  }

  frontmatter(file) {
    const raw = existsSync(file) ? splitFrontmatter(readText(file)).raw : null;
    try {
      return (raw && parseYaml(raw, this.rel(file))) || {};
    } catch (error) {
      this.report.todo(
        this.rel(file),
        `frontmatter not parsed: ${error.message}`
      );
      return {};
    }
  }

  /** A page an earlier --write already moved keeps the URL recorded then. */
  moved(file) {
    const rel = this.rel(file);
    // A file docs.yml lists twice has one recorded URL per listing, in order.
    const nth = this.seen.get(rel) ?? 0;
    this.seen.set(rel, nth + 1);
    return existsSync(file) ? undefined : this.previous.get(rel)?.[nth];
  }

  read(file, extra) {
    this.referenced.add(file);
    const fm = this.frontmatter(file);
    return { file: this.rel(file), fm, ...extra(fm) };
  }

  page(item, ctx) {
    const file = path.resolve(ctx.dir, String(item.path ?? ""));
    return this.read(file, (fm) => ({
      hidden: Boolean(item.hidden || ctx.hidden),
      icon: item.icon,
      kind: "page",
      name: String(item.page),
      noindex: Boolean(item.noindex),
      url:
        this.moved(file) ??
        pageUrl(ctx.slugs, item.slug ?? kebab(item.page), fm),
    }));
  }

  section(item, ctx) {
    const slug = item["skip-slug"]
      ? undefined
      : (item.slug ?? kebab(item.section));
    const hidden = Boolean(ctx.hidden || item.hidden);
    const sub = { ...ctx, hidden, slugs: [...ctx.slugs, slug] };
    const children = this.items(item.contents, sub);
    if (item.path) {
      const file = path.resolve(ctx.dir, String(item.path));
      children.unshift(
        this.read(file, (fm) => ({
          hidden,
          kind: "overview",
          name: String(item.section),
          url: this.moved(file) ?? pageUrl(sub.slugs, undefined, fm),
        }))
      );
    }
    const collapsible = item.collapsible ? "open-by-default" : undefined;
    const byDefault = item["collapsed-by-default"] ? true : collapsible;
    return {
      children,
      collapsed: item.collapsed ?? byDefault,
      icon: item.icon,
      kind: "group",
      name: String(item.section),
    };
  }

  api(item, ctx) {
    const own = item["skip-slug"] ? undefined : (item.slug ?? kebab(item.api));
    let base = joinUrl(ctx.slugs, own);
    const children = [];
    if (item.summary) {
      const file = path.resolve(ctx.dir, String(item.summary));
      const summary = this.read(file, (fm) => ({
        kind: "apiSummary",
        name: String(item.api),
        url: this.moved(file) ?? (fm.slug ? joinUrl(String(fm.slug)) : base),
      }));
      base = summary.url;
      children.push(summary);
    }
    const name = item["api-name"] ? String(item["api-name"]) : undefined;
    const definition = [
      name && path.join(this.fernDir, "apis", name, "definition"),
      path.join(this.fernDir, "definition"),
    ].find((dir) => dir && existsSync(dir));
    const fromDefinition = Boolean(definition && !item.specs);
    const api = {
      base,
      definition: fromDefinition ? this.rel(definition) : undefined,
      kind: fromDefinition ? "definition" : "openapi",
      name,
    };
    this.apis.push(api);
    return { api, children, kind: "api" };
  }

  changelog(dir, ctx, ownSlug) {
    // Fern reads the changelog index's text from any of these.
    const overview = ["overview", "index", "summary"]
      .flatMap((name) => [`${name}.mdx`, `${name}.md`])
      .map((name) => path.join(dir, name))
      .find((file) => existsSync(file));
    const overviewSlug = overview ? this.frontmatter(overview).slug : undefined;
    const base = overviewSlug
      ? joinUrl(String(overviewSlug))
      : joinUrl(ctx.slugs, ownSlug);
    const dateUrl = (date) =>
      joinUrl(base, String(date.year), String(date.month), String(date.day));
    const entries = [];
    const others = [];
    const names = existsSync(dir) ? readdirSync(dir).toSorted(byName) : [];
    for (const name of names) {
      const file = path.join(dir, name);
      const date = changelogDate(name);
      if (date) {
        entries.push(
          this.read(file, (fm) => ({
            date,
            kind: "changelogEntry",
            url: fm.slug ? joinUrl(String(fm.slug)) : dateUrl(date),
          }))
        );
      } else if (/\.mdx?$/u.test(name) && file !== overview) {
        others.push(this.rel(file));
      }
    }
    const prefix = `${this.rel(dir)}/`;
    for (const [source, [url]] of this.previous) {
      const date = changelogDate(path.posix.basename(source));
      const gone = !existsSync(path.join(this.fernDir, source));
      if (date && gone && source.startsWith(prefix)) {
        entries.push({
          date,
          file: source,
          fm: {},
          kind: "changelogEntry",
          url,
        });
      }
    }
    entries.sort((a, b) => byName(a.file, b.file));
    if (overview) {
      this.referenced.add(overview);
    }
    const overviewRel = overview ? this.rel(overview) : undefined;
    return { base, entries, kind: "changelog", others, overview: overviewRel };
  }

  items(list, ctx) {
    const out = [];
    for (const item of list ?? []) {
      if (item?.page !== undefined) {
        out.push(this.page(item, ctx));
      } else if (item?.section !== undefined) {
        out.push(this.section(item, ctx));
      } else if (item?.api !== undefined) {
        out.push(this.api(item, ctx));
      } else if (item?.changelog !== undefined) {
        const dir = path.resolve(ctx.dir, String(item.changelog));
        out.push(
          this.changelog(
            dir,
            ctx,
            item.slug ?? kebab(item.title ?? "Changelog")
          )
        );
      } else if (item?.link === undefined) {
        // `- folder:`, `- library:`, `- blog:`, or anything newer: never drop
        // a listing silently.
        const [key] = Object.keys(item ?? {});
        this.report.todo(
          "docs.yml",
          `"${key}: ${item?.[key]}" entry: not handled here; place its pages by hand`
        );
      } else {
        this.report.todo(
          "docs.yml",
          `sidebar link "${item.link}" → ${item.href}: add it to navigation.featured`
        );
      }
    }
    return out;
  }

  tab(entry, docs) {
    const root = { dir: this.fernDir, hidden: false, slugs: [] };
    const key = String(entry.tab);
    const tab = docs.tabs?.[key] ?? {};
    const label = String(tab["display-name"] ?? key);
    const slug = tab["skip-slug"] ? undefined : (tab.slug ?? kebab(label));
    const info = {
      hidden: Boolean(tab.hidden),
      href: tab.href,
      icon: tab.icon,
      key,
      label,
      slug,
    };
    const changelog = tab.changelog ?? tab.blog;
    if (tab.href) {
      return { ...info, children: [] };
    }
    if (changelog) {
      const dir = path.resolve(this.fernDir, String(changelog));
      return {
        ...info,
        // Fern ignores skip-slug on a changelog tab.
        children: [this.changelog(dir, root, tab.slug ?? kebab(label))],
      };
    }
    if (entry.variants) {
      this.report.todo(
        "docs.yml",
        `tab "${label}" has variants: not handled here (see the reference)`
      );
      return { ...info, children: [] };
    }
    const ctx = { ...root, hidden: info.hidden, slugs: slug ? [slug] : [] };
    return { ...info, children: this.items(entry.layout, ctx) };
  }

  tabs(docs) {
    const navigation = [docs.navigation ?? []].flat();
    if (!navigation.some((entry) => entry?.tab !== undefined)) {
      const root = { dir: this.fernDir, hidden: false, slugs: [] };
      return [{ children: this.items(navigation, root), key: null }];
    }
    return navigation.map((entry) => this.tab(entry, docs));
  }
}

// --- Placement: a file path per page that reproduces its URL ------------------------

const pagesIn = (nodes) =>
  nodes.flatMap((node) => {
    if (node.kind === "group") {
      return pagesIn(node.children);
    }
    return node.kind === "page" || node.kind === "overview" ? [node] : [];
  });

/** A section's folder: a real one when its pages share a URL segment, else a `(group)`. */
const groupFolderName = (node, prefix) => {
  const base = prefix === "/" ? "" : prefix;
  const overview = node.children.find((child) => child.kind === "overview");
  const own = overview?.url.slice(base.length + 1);
  if (overview?.url.startsWith(`${base}/`) && !own.includes("/")) {
    return own;
  }
  const direct = node.children
    .filter(
      (child) => child.kind === "page" && child.url.startsWith(`${base}/`)
    )
    .map((child) => child.url.slice(base.length + 1).split("/"));
  const counts = new Map();
  for (const rest of direct.filter((parts) => parts.length <= 2)) {
    counts.set(rest[0], (counts.get(rest[0]) ?? 0) + 1);
  }
  const ranked = [...counts].toSorted(
    (a, b) => b[1] - a[1] || byName(a[0], b[0])
  );
  const [best, count = 0] = ranked[0] ?? [];
  const pages = node.children.filter((child) => child.kind === "page").length;
  return count >= 2 && count >= Math.ceil(pages / 2)
    ? best
    : `(${kebab(node.name) || "group"})`;
};

class Placer {
  constructor(report) {
    this.report = report;
    this.placements = [];
    this.metas = new Map();
    this.taken = new Set();
    this.changelogs = [];
    this.tabs = [];
  }

  meta(folder) {
    if (!this.metas.has(folder)) {
      this.metas.set(folder, { pages: [] });
    }
    return this.metas.get(folder);
  }

  claim(file, page) {
    let target = file;
    for (let n = 2; this.taken.has(target); n += 1) {
      target = file.replace(/\.mdx$/u, `-${n}.mdx`);
    }
    if (target !== file) {
      this.report.todo(
        page.file,
        `another page already sits at ${file}; placed at ${target}`
      );
    }
    this.taken.add(target);
    return target;
  }

  page(page, folder) {
    const first = this.placements.find(
      (p) => p.page.file === page.file && !p.alias
    );
    if (first) {
      // Fern served the file at every listing; Blume publishes it once.
      const route = first.slug ? `/${first.slug}` : first.route;
      this.placements.push({ alias: true, file: first.file, page, route });
      this.report.todo(
        page.file,
        `docs.yml lists it twice: published once, at ${route}; ${page.url} redirects there`
      );
      return;
    }
    const prefix = folderRoute(folder);
    const leaf = page.url === prefix ? "index" : page.url.split("/").pop();
    const file = this.claim(`${folder ? `${folder}/` : ""}${leaf}.mdx`, page);
    const stem = path.posix.basename(file, ".mdx");
    const derived =
      stem === "index" ? prefix : joinUrl(prefix, stripOrder(stem));
    const slug = derived === page.url ? undefined : page.url.slice(1);
    this.placements.push({ file, page, route: page.url, slug });
    if (stem !== "index") {
      this.meta(folder).pages.push(childSlug(stem));
    }
  }

  group(node, folder) {
    const name = groupFolderName(node, folderRoute(folder));
    const sub = `${folder ? `${folder}/` : ""}${name}`;
    const meta = this.meta(sub);
    if (meta.title !== undefined) {
      this.report.todo(
        `section "${node.name}"`,
        `shares the folder ${sub} with "${meta.title}", so the sidebar merges them: split them by hand`
      );
    }
    meta.title = node.name;
    const icon = mapIcon(node.icon);
    meta.icon = icon.lucide;
    this.report.icon(`section "${node.name}"`, icon);
    if (node.collapsed === true || node.collapsed === "open-by-default") {
      meta.display = "group";
      meta.collapsed = node.collapsed === true;
    }
    this.meta(folder).pages.push(childSlug(name));
    this.nodes(node.children, sub);
  }

  api(node) {
    for (const page of node.children) {
      const intro = joinUrl(node.api.base, "introduction").slice(1);
      const file = this.claim(`${intro}.mdx`, page);
      const route = `/${file.replace(/\.mdx$/u, "")}`;
      this.placements.push({ file, page, route, summary: true });
    }
  }

  changelog(node) {
    this.changelogs.push(node);
    for (const entry of node.entries) {
      const suffix = entry.date.suffix ? `-${entry.date.suffix}` : "";
      const name = `${entry.date.iso}${suffix}`;
      const file = this.claim(`changelog/${name}.mdx`, entry);
      this.placements.push({
        changelog: true,
        file,
        page: entry,
        route: `/${file.replace(/\.mdx$/u, "")}`,
      });
    }
  }

  nodes(nodes, folder) {
    for (const node of nodes) {
      if (node.kind === "page" || node.kind === "overview") {
        this.page(node, folder);
      } else if (node.kind === "group") {
        this.group(node, folder);
      } else if (node.kind === "api") {
        this.api(node);
      } else if (node.kind === "changelog") {
        this.changelog(node);
      }
    }
  }

  tab(tab) {
    if (tab.href) {
      this.tabs.push({ href: tab.href, label: tab.label });
      return;
    }
    const pages = pagesIn(tab.children);
    const slugUrl = joinUrl(tab.slug);
    const underSlug = (page) =>
      page.url === slugUrl || page.url.startsWith(`${slugUrl}/`);
    const shared = Boolean(
      tab.key && tab.slug && pages.length > 0 && pages.every(underSlug)
    );
    const folder = shared ? tab.slug : "";
    if (shared) {
      this.meta(folder).title = tab.label;
    }
    this.nodes(tab.children, folder);
    if (tab.key) {
      this.tabs.push(this.tabEntry(tab, shared ? slugUrl : "/", pages));
    }
  }

  tabEntry(tab, ownPath, pages) {
    const [first] = tab.children;
    let tabPath = ownPath;
    if (tab.children.length === 1 && first.kind === "changelog") {
      tabPath = "/changelog";
    } else if (first?.kind === "api" && pages.length === 0) {
      tabPath = first.api.base;
    }
    const icon = mapIcon(tab.icon);
    this.report.icon(`tab "${tab.label}"`, icon);
    return {
      hidden: tab.hidden,
      icon: icon.lucide,
      label: tab.label,
      path: tabPath,
    };
  }
}

// --- Frontmatter ---------------------------------------------------------------------

const KNOWN_KEYS = new Set([
  "description",
  "headline",
  "noindex",
  "sidebar-title",
  "slug",
  "subtitle",
  "title",
]);

const sentenceCase = (suffix) =>
  suffix
    .split(/[-_]+/u)
    .filter(Boolean)
    .map((word, i) =>
      i === 0 ? `${word[0].toUpperCase()}${word.slice(1)}` : word
    )
    .join(" ");

const changelogFrontmatter = (page, report) => {
  const { date, fm } = page;
  let title = `${MONTHS[date.month - 1]} ${date.day}, ${date.year}`;
  if (fm.title) {
    title = String(fm.title);
  } else if (date.suffix) {
    title = sentenceCase(date.suffix);
    report.todo(
      page.file,
      `changelog title "${title}" came from the file name: review it`
    );
  }
  const data = Object.fromEntries([
    ["title", title],
    ["type", "changelog"],
    ["date", date.iso],
  ]);
  const tags = [fm.tags ?? []].flat().map(String);
  if (tags.length > 0) {
    data.changelog = { category: tags[0] };
    data.search = { tags };
  }
  for (const key of Object.keys(fm).filter(
    (k) => k !== "tags" && k !== "title"
  )) {
    report.drop(page.file, `frontmatter ${key}`);
  }
  return data;
};

const seoFields = (page) => {
  const { fm } = page;
  const seo = {};
  if (fm.headline) {
    seo.title = String(fm.headline);
  }
  if (fm.subtitle && fm.description && fm.description !== fm.subtitle) {
    seo.description = String(fm.description);
  }
  if (page.hidden || page.noindex || fm.noindex === true) {
    seo.noindex = true;
  }
  return Object.keys(seo).length > 0 ? seo : undefined;
};

const pageFrontmatter = (placement, title, report) => {
  const { page } = placement;
  const { fm } = page;
  const icon = mapIcon(page.icon);
  report.icon(page.file, icon);
  const named =
    page.kind === "page" && page.name !== title ? page.name : undefined;
  const label = fm["sidebar-title"] ?? named;
  const description = fm.subtitle ?? fm.description;
  // Entries, not an object literal: they keep the order the page is read in.
  const data = Object.fromEntries([
    ["title", title],
    ["description", description ? String(description) : undefined],
    ["slug", placement.slug],
    ["icon", icon.lucide],
    ["hidden", page.hidden || undefined],
    ["sidebar", label ? { label: String(label) } : undefined],
    ["seo", seoFields(page)],
    ["search", page.hidden ? { exclude: true } : undefined],
  ]);
  for (const key of Object.keys(fm).filter((k) => !KNOWN_KEYS.has(k))) {
    report.drop(
      page.file,
      `frontmatter ${key}: map it by hand if it matters (the reference's table)`
    );
  }
  return data;
};

const yamlScalar = (value) => {
  if (value === true || value === false || /^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return String(value);
  }
  const unsafe =
    value === "" ||
    value.trim() !== value ||
    /^[!"#%&'*,:>?@[\]`{|}-]|: |\s#|:$|[\n\t]/u.test(value) ||
    /^(?:true|false|yes|no|on|off|null|~|[-+]?[\d.]+)$/iu.test(value);
  return unsafe ? JSON.stringify(value) : value;
};

const yamlLines = (data, indent = "") =>
  Object.entries(data)
    .filter(([, value]) => value !== undefined)
    .flatMap(([key, value]) => {
      if (Array.isArray(value)) {
        return [
          `${indent}${key}: [${value.map((item) => JSON.stringify(item)).join(", ")}]`,
        ];
      }
      if (value instanceof Object) {
        return [`${indent}${key}:`, ...yamlLines(value, `${indent}  `)];
      }
      return [`${indent}${key}: ${yamlScalar(value)}`];
    });

// --- Body: Fern components → Blume ---------------------------------------------------

// Placeholders for masked code: private-use characters no page contains.
const FENCE = String.fromCodePoint(0xe0_00);
const CODE = String.fromCodePoint(0xe0_01);
/** `"a:b c:d"` → Map { a → b, c → d }: compact tables that stay one line each. */
const table = (text) => new Map(text.split(" ").map((pair) => pair.split(":")));
const CALLOUTS = table(
  "Check:success Error:danger Info:info Launch:tip Note:note Success:success Tip:tip Warning:warning"
);
const INTENTS = table(
  "check:success danger:danger error:danger info:info launch:tip note:note success:success tip:tip warn:warning warning:warning"
);
const LANGUAGES = table(
  "bash:Bash csharp:C# curl:cURL go:Go java:Java javascript:JavaScript js:JavaScript json:JSON php:PHP py:Python python:Python ruby:Ruby rust:Rust sh:Shell shell:Shell swift:Swift ts:TypeScript typescript:TypeScript yaml:YAML"
);
const RENAMES = table(
  "AccordionGroup:Accordion Cards:CardGroup CodeBlocks:CodeGroup"
);
const REPORTED = new Set(
  "Aside Availability Badge Button ChangelogTags Code Copy Download EndpointRequestSnippet EndpointResponseSnippet EndpointSchemaSnippet Feature Files If Indent PaginatedSearchableTable PaginatedTable Prompt RunnableEndpoint Schema SchemaSnippet ScrollWalkthrough SearchableTable StickySearchableTable StickyTable Template Versions WebhookPayloadSnippet".split(
    " "
  )
);
const CARD_PROPS =
  "className darkModeColor iconPosition iconSize imageHeight imageWidth lightModeColor".split(
    " "
  );
const TAG = new RegExp(
  `<(?<closing>/?)(?<name>[A-Z][\\w.]*)(?<attrs>(?:\\s+(?:[^>"'{}/]|/(?!>)|"[^"]*"|'[^']*'|\\{(?:[^{}]|\\{(?:[^{}]|\\{[^{}]*\\})*\\})*\\})*)?)\\s*(?<self>/?)>|${FENCE}(?<fence>\\d+)${FENCE}`,
  "gu"
);

const attrPattern = (name) =>
  new RegExp(
    `(?<lead>^|\\s)${name}\\s*=\\s*(?:"(?<dq>[^"]*)"|'(?<sq>[^']*)'|\\{(?<ex>(?:[^{}]|\\{[^{}]*\\})*)\\})`,
    "u"
  );
const attr = (attrs, name) => {
  const groups = attrPattern(name).exec(attrs)?.groups;
  if (!groups) {
    return;
  }
  return (
    groups.dq ??
    groups.sq ??
    groups.ex.trim().replace(/^["'`](?<inner>.*)["'`]$/u, "$<inner>")
  );
};
const dropAttr = (attrs, name) => attrs.replace(attrPattern(name), "");
const setAttr = (attrs, name, value) =>
  attrs.replace(
    attrPattern(name),
    (...match) => `${match.at(-1).lead}${name}="${value}"`
  );
/** A masked-source position's line in the original file (fences count in full). */
const lineAt = (src, pos, ctx) => {
  const masked = src.slice(0, pos).split("\n").length - 1;
  return ctx.lines[masked] ?? masked + 1;
};
const lineStart = (src, pos) => src.lastIndexOf("\n", pos - 1) + 1;
const ownLine = (src, pos) =>
  /^[\t ]*$/u.test(src.slice(lineStart(src, pos), pos));
/** Nothing but whitespace from `pos` to the end of its line. */
const endsLine = (src, pos) => /^[\t ]*(?:\n|$)/u.test(src.slice(pos));
const edit = (range, text) => ({ end: range.end, start: range.start, text });
const wrapEdits = (open, opening, closing) =>
  open.close
    ? [edit(open, opening), edit(open.close, closing)]
    : [edit(open, opening)];
const tagText = (open, name, attrs) =>
  `<${name}${attrs}${open.self ? " /" : ""}>`;

const dedent = (text) => {
  const lines = text
    .replace(/^[\t ]*\n/u, "")
    .replace(/\n[\t ]*$/u, "")
    .split("\n");
  const widths = lines
    .filter((line) => line.trim())
    .map((line) => /^ */u.exec(line)[0].length);
  const width = widths.length > 0 ? Math.min(...widths) : 0;
  return lines
    .map((line) => line.slice(Math.min(width, /^ */u.exec(line)[0].length)))
    .join("\n")
    .trim();
};

const splice = (text, offset, edits) => {
  let out = text;
  const inRange = edits.filter(
    (change) => change.start >= offset && change.end <= offset + text.length
  );
  for (const change of inRange.toSorted((a, b) => b.start - a.start)) {
    out = `${out.slice(0, change.start - offset)}${change.text}${out.slice(change.end - offset)}`;
  }
  return out;
};

const dropAll = (attrs, names) => {
  let out = attrs;
  for (const name of names) {
    out = dropAttr(out, name);
  }
  return out;
};

/** Fenced code out of the way: placeholders, so tag rewriting never sees it. */
const maskFences = (input, ctx) => {
  const fences = [];
  const lines = input.split("\n");
  const out = [];
  const offset = ctx.offset ?? 0;
  ctx.lines = [];
  for (let i = 0; i < lines.length; i += 1) {
    const open =
      /^(?<indent>\s*)(?<marker>`{3,}|~{3,})(?<lang>[^\s`]*)(?<meta>.*)$/u.exec(
        lines[i]
      )?.groups;
    if (open) {
      const closer = new RegExp(
        `^\\s*[${open.marker[0]}]{${open.marker.length},}\\s*$`,
        "u"
      );
      let j = i + 1;
      while (j < lines.length && !closer.test(lines[j])) {
        j += 1;
      }
      if (j >= lines.length) {
        ctx.report.todo(
          ctx.where,
          `unclosed code fence at line ${i + 1 + offset} (Fern rendered an empty block): closed at the end; delete the stray fence`
        );
      }
      const close = lines[j] ?? `${open.indent}${open.marker}`;
      fences.push({ ...open, body: lines.slice(i + 1, j), close });
      out.push(`${open.indent}${FENCE}${fences.length - 1}${FENCE}`);
      ctx.lines.push(i + 1 + offset);
      i = j;
    } else {
      out.push(lines[i]);
      ctx.lines.push(i + 1 + offset);
    }
  }
  return { fences, src: out.join("\n") };
};

const iframe = (whole, attrs) => {
  const src = attr(attrs, "src") ?? "";
  const title = attr(attrs, "title");
  const titled = title ? ` title="${title}"` : "";
  // A playlist embed names no video (`videoseries`): <YouTube url> embeds the list.
  if (/youtube(?:-nocookie)?\.com\/embed\/videoseries\?/u.test(src)) {
    return `<YouTube url="${src}"${titled} />`;
  }
  const id =
    /(?:youtube(?:-nocookie)?\.com\/embed\/|youtu\.be\/)(?<id>[\w-]{6,})/u.exec(
      src
    )?.groups.id;
  if (id) {
    return `<YouTube id="${id}"${titled} />`;
  }
  return whole
    .replace(
      /\ballowfullscreen(?:=(?:""|"true"|\{true\}))?/u,
      "allowFullScreen"
    )
    .replace(/\bframeborder=/u, "frameBorder=");
};

/** Prose-level rewrites: HTML comments, iframes, custom-component imports. */
const rewriteProse = (src, ctx) =>
  src
    .replaceAll(
      /<!--(?<comment>[\s\S]*?)-->/gu,
      (...match) => `{/*${match.at(-1).comment.replaceAll("*/", "* /")}*/}`
    )
    .replaceAll(/<iframe\b(?<attrs>[^>]*?)\/?>(?:\s*<\/iframe>)?/gu, iframe)
    .replaceAll(/^\s*import\s.+\sfrom\s+["'][^"']+["'];?\s*$/gmu, (line) => {
      ctx.report.todo(
        ctx.where,
        `import (a custom component): ${line.trim()}; make it an island or a components.ts override`
      );
      return line;
    });

/** Every component tag, with its parents and its closing tag. */
const scanTags = (src, fences, ctx) => {
  const stack = [];
  const opens = [];
  for (const match of src.matchAll(TAG)) {
    const { attrs = "", closing, fence, name, self } = match.groups;
    const end = match.index + match[0].length;
    if (fence !== undefined) {
      const wrapper = stack.findLast((open) => open.name === "CodeBlock");
      const target = fences[Number(fence)];
      target.group = stack.some(
        (open) => open.name === "CodeBlocks" || open.name === "CodeGroup"
      );
      target.title =
        wrapper &&
        (attr(wrapper.attrs, "title") ?? attr(wrapper.attrs, "filename"));
    } else if (closing) {
      const at = stack.map((open) => open.name).lastIndexOf(name);
      if (at === -1) {
        ctx.report.todo(
          ctx.where,
          `unmatched </${name}> (line ${lineAt(src, match.index, ctx)})`
        );
      } else {
        stack[at].close = { end, start: match.index };
        stack.length = at;
      }
    } else {
      const parents = stack.map((open) => open.name);
      const open = {
        attrs,
        end,
        name,
        parents,
        self: Boolean(self),
        start: match.index,
      };
      opens.push(open);
      if (!open.self) {
        stack.push(open);
      }
    }
  }
  for (const open of stack) {
    ctx.report.todo(
      ctx.where,
      `unclosed <${open.name}> (line ${lineAt(src, open.start, ctx)})`
    );
  }
  return opens;
};

const iconProp = (attrs, ctx, label) => {
  const value = attr(attrs, "icon");
  if (value === undefined) {
    return attrs;
  }
  const img = /<img[^>]*\ssrc=["'](?<src>[^"']+)["']/u.exec(value)?.groups.src;
  const icon = img ? { asset: img } : mapIcon(value);
  if (icon.lucide || icon.asset) {
    return setAttr(attrs, "icon", icon.lucide ?? ctx.asset(icon.asset));
  }
  ctx.report.icon(`${ctx.where} ${label}`, icon);
  return dropAttr(attrs, "icon");
};

/** Drop Fern-only props from a tag Blume ships under the same name. */
const dropProps = (open, props) => {
  const attrs = dropAll(open.attrs, props);
  return attrs === open.attrs
    ? []
    : [edit(open, tagText(open, open.name, attrs))];
};

const TAG_HANDLERS = {
  Accordion: (open) => {
    if (attr(open.attrs, "title") === undefined) {
      return [];
    }
    const attrs = dropAttr(dropAttr(open.attrs, "id"), "toc");
    return open.parents.at(-1) === "AccordionGroup"
      ? wrapEdits(open, `<AccordionItem${attrs}>`, "</AccordionItem>")
      : wrapEdits(
          open,
          `<Accordion>\n<AccordionItem${attrs}>`,
          "</AccordionItem>\n</Accordion>"
        );
  },
  Card: (open, src, ctx) => {
    const label = `<Card title="${attr(open.attrs, "title") ?? ""}">`;
    const attrs = dropAll(iconProp(open.attrs, ctx, label), CARD_PROPS);
    return attrs === open.attrs
      ? []
      : [edit(open, tagText(open, "Card", attrs))];
  },
  // Blume's <CodeBlock> renders a wrapped fence but not its `title`, so the
  // title moves onto the fence (scanTags) and the wrapper goes.
  CodeBlock: (open) =>
    attr(open.attrs, "code") === undefined ? wrapEdits(open, "", "") : [],
  Frame: (open) => dropProps(open, ["background"]),
  Icon: (open, src, ctx) => {
    const icon = mapIcon(attr(open.attrs, "icon"));
    if (!(icon.lucide || icon.asset)) {
      ctx.report.icon(`${ctx.where} <Icon>`, icon);
      return wrapEdits(open, "", "");
    }
    const size = attr(open.attrs, "size") ?? "";
    const color = attr(open.attrs, "color");
    const props = [
      `icon="${icon.lucide ?? ctx.asset(icon.asset)}"`,
      /^\d+$/u.test(size) && `size={${Number(size) * 4}}`,
      color && `color="${color}"`,
    ].filter(Boolean);
    return wrapEdits(open, `<Icon ${props.join(" ")} />`, "");
  },
  Markdown: (open, src, ctx) => {
    const params = [
      ...open.attrs.matchAll(
        /\s(?<key>[A-Z_a-z][\w-]*)\s*=\s*"(?<value>[^"]*)"/gu
      ),
    ]
      .filter((param) => param.groups.key !== "src")
      .map((param) => ` ${param.groups.key}="${param.groups.value}"`);
    const target = ctx.snippet(attr(open.attrs, "src") ?? "");
    const include = `<include${params.join("")}>${target}</include>`;
    // Blume reads an <include> only on a line of its own.
    const alone = ownLine(src, open.start) && endsLine(src, open.end);
    return [edit(open, alone ? include : `\n${include}\n`)];
  },
  // Fern's `path` is the field's name; Blume's (Mintlify's) is a path
  // parameter's location, which would badge every field "path".
  ParamField: (open) => {
    const attrs = dropAttr(open.attrs, "toc").replace(
      attrPattern("path"),
      (match) => match.replace("path", "name")
    );
    return attrs === open.attrs
      ? []
      : [edit(open, tagText(open, "ParamField", attrs.trimEnd()))];
  },
  Tab: (open) => dropProps(open, ["language"]),
};

/**
 * A top-level callout becomes a `:::` directive; a nested one, or one whose
 * icon maps (a directive can't set an icon), a <Callout>.
 */
const calloutEdits = (open, src, ctx) => {
  const intent = String(
    attr(open.attrs, "intent") ?? attr(open.attrs, "type") ?? "info"
  );
  const kind =
    CALLOUTS.get(open.name) ?? INTENTS.get(intent.toLowerCase()) ?? "info";
  const title = attr(open.attrs, "title");
  const mapped = mapIcon(attr(open.attrs, "icon"));
  const iconValue = mapped.lucide ?? (mapped.asset && ctx.asset(mapped.asset));
  if (!iconValue) {
    ctx.report.icon(`${ctx.where} <${open.name}>`, mapped);
  }
  const alone = lineStart(src, open.start) === open.start;
  if (
    !iconValue &&
    open.parents.length === 0 &&
    open.close &&
    alone &&
    ownLine(src, open.close.start) &&
    endsLine(src, open.close.end)
  ) {
    const directive = `:::${kind}${title ? `[${title}]` : ""}`;
    return [
      {
        bodyEnd: open.close.start,
        bodyStart: open.end,
        directive,
        end: open.close.end,
        start: open.start,
      },
    ];
  }
  const titleAttr = title ? ` title="${title.replaceAll('"', "&quot;")}"` : "";
  const iconAttr = iconValue ? ` icon="${iconValue}"` : "";
  return wrapEdits(
    open,
    tagText(open, "Callout", ` type="${kind}"${titleAttr}${iconAttr}`),
    "</Callout>"
  );
};

/** The edits one component tag needs; `src` is the masked page. */
const tagEdits = (open, src, ctx) => {
  if (RENAMES.get(open.name)) {
    const to = RENAMES.get(open.name);
    return wrapEdits(
      open,
      tagText(open, to, open.name === "Cards" ? open.attrs : ""),
      `</${to}>`
    );
  }
  if (CALLOUTS.get(open.name) || open.name === "Callout") {
    return calloutEdits(open, src, ctx);
  }
  if (REPORTED.has(open.name)) {
    ctx.report.todo(
      ctx.where,
      `<${open.name}> (line ${lineAt(src, open.start, ctx)}): convert it by hand (the reference's component table)`
    );
  }
  return TAG_HANDLERS[open.name]?.(open, src, ctx) ?? [];
};

/** A fence's info string in Blume's grammar. */
const fenceInfo = (fence) => {
  const lang = fence.lang === "env" ? "dotenv" : fence.lang;
  let meta = fence.meta
    .trim()
    .replace(/\bwordWrap\b(?:=\{?true\}?)?/u, "wrap")
    .replace(/\bfilename=/u, "title=");
  const bare = meta
    .replaceAll(
      /\b\w+=(?:"[^"]*"|'[^']*'|\S+)|\{[^}]*\}|\b(?:wrap|lineNumbers|expandable)\b/gu,
      ""
    )
    .trim();
  if (/\s/u.test(bare)) {
    // Fern and Blume both read every word after the language as the title;
    // the quotes only make it explicit.
    meta = `title="${bare}" ${meta.replace(bare, "").trim()}`.trim();
  }
  // Blume labels an untitled grouped block by its language too; the title
  // keeps Fern's label where the two differ (`curl` → cURL).
  const groupTitle =
    fence.group && lang ? (LANGUAGES.get(lang) ?? lang) : undefined;
  const title = fence.title ?? groupTitle;
  if (title && !/\btitle=/u.test(meta) && bare === "") {
    meta = `title="${title}"${meta ? ` ${meta}` : ""}`;
  }
  return `${lang}${meta ? ` ${meta}` : ""}`;
};

const unmask = (text, fences, inline) =>
  text
    .replaceAll(
      new RegExp(`${CODE}(?<i>\\d+)${CODE}`, "gu"),
      (...match) => inline[Number(match.at(-1).i)]
    )
    .replaceAll(
      new RegExp(`^(?<lead>[\\t ]*)${FENCE}(?<i>\\d+)${FENCE}`, "gmu"),
      (...match) => {
        const { i, lead } = match.at(-1);
        const fence = fences[Number(i)];
        const cut = fence.indent.length - lead.length;
        const fix = (line) =>
          cut > 0
            ? line.slice(Math.min(cut, /^ */u.exec(line)[0].length))
            : line;
        return [
          `${lead}${fence.marker}${fenceInfo(fence)}`,
          ...fence.body.map(fix),
          fix(fence.close),
        ].join("\n");
      }
    );

const rewriteUrls = (text, ctx) =>
  text
    .replaceAll(
      /(?<bang>!?)\[(?<label>[^\n\]]*)\]\((?<url>[^\s)]+)(?<title>\s+"[^"]*")?\)/gu,
      (...match) => {
        const { bang, label, title = "", url } = match.at(-1);
        return `${bang}[${label}](${bang ? ctx.asset(url) : ctx.link(url)}${title})`;
      }
    )
    .replaceAll(
      /(?<lead>\s(?:href|poster|src)=)(?<quote>["'])(?<url>[^"']+)\k<quote>/gu,
      (...match) => {
        const { lead, quote, url } = match.at(-1);
        return `${lead}${quote}${ctx.link(url)}${quote}`;
      }
    );

/** Convert one page or snippet body. `ctx` resolves links, assets, and snippets. */
const convertBody = (input, ctx) => {
  const { fences, src: masked } = maskFences(input, ctx);
  const inline = [];
  const hidden = masked.replaceAll(
    /(?<ticks>`+)[^\n`](?:[^\n]*?[^\n`])?\k<ticks>(?!`)/gu,
    (code) => {
      inline.push(code);
      return `${CODE}${inline.length - 1}${CODE}`;
    }
  );
  const src = rewriteProse(hidden, ctx);
  const edits = scanTags(src, fences, ctx).flatMap((open) =>
    tagEdits(open, src, ctx)
  );
  const directives = edits.filter((change) => change.directive);
  const nested = edits.filter((change) => !change.directive);
  const inside = (change) =>
    directives.some((d) => change.start >= d.start && change.end <= d.end);
  const final = [
    ...directives.map((d) => {
      const body = dedent(
        splice(src.slice(d.bodyStart, d.bodyEnd), d.bodyStart, nested)
      );
      return {
        end: d.end,
        start: d.start,
        text: `${d.directive}\n${body}\n:::`,
      };
    }),
    ...nested.filter((change) => !inside(change)),
  ];
  const spliced = splice(src, 0, final).replaceAll(/^[\t ]+$/gmu, "");
  return unmask(rewriteUrls(spliced, ctx), fences, inline);
};

// --- plan ----------------------------------------------------------------------------------

const instanceHosts = (docs) =>
  (docs.instances ?? []).flatMap((instance) =>
    [instance.url, ...[instance["custom-domain"]].flat()]
      .filter(Boolean)
      .map((domain) => {
        const clean = String(domain)
          .replace(/^https?:\/\//u, "")
          .replace(/\/+$/u, "");
        const slash = clean.indexOf("/");
        return slash === -1
          ? { host: clean, path: "" }
          : { host: clean.slice(0, slash), path: clean.slice(slash) };
      })
  );

const docsRedirects = (docs, fernDir, report) => {
  const entries = [docs.redirects ?? []].flat();
  const files = entries.filter((entry) => !(entry instanceof Object));
  const fromFiles = files.flatMap((file) => {
    try {
      return (
        parseYaml(readText(path.join(fernDir, String(file))), String(file))
          ?.redirects ?? []
      );
    } catch (error) {
      report.todo(String(file), `redirects file not parsed: ${error.message}`);
      return [];
    }
  });
  return [...entries.filter((entry) => entry instanceof Object), ...fromFiles];
};

const loadPrevious = (statePath) => {
  if (!existsSync(statePath)) {
    return new Map();
  }
  const { pages = [] } = JSON.parse(readText(statePath));
  const previous = new Map();
  for (const page of pages.filter((p) => p.source)) {
    previous.set(page.source, [
      ...(previous.get(page.source) ?? []),
      page.from,
    ]);
  }
  return previous;
};

/** The fern-relative path of a local file a page references, or null. */
const localFile = (env, url, fromFile) => {
  const [clean] = url.split(/[#?]/u);
  if (!clean || /^(?:[a-z][\d+.a-z-]*:|\/\/)/iu.test(url)) {
    return null;
  }
  const abs = clean.startsWith("/")
    ? path.join(env.fernDir, clean)
    : path.resolve(path.dirname(path.join(env.fernDir, fromFile)), clean);
  const usable =
    abs.startsWith(env.fernDir + path.sep) &&
    existsSync(abs) &&
    statSync(abs).isFile();
  return usable ? toPosix(path.relative(env.fernDir, abs)) : null;
};

/** A link to the docs' own host, made root-relative. */
const siteRelative = (env, url) => {
  const bare = url.replace(/^https?:\/\//u, "");
  const host = /^https?:\/\//u.test(url)
    ? env.hosts.find(
        (h) =>
          bare.startsWith(`${h.host}${h.path}`) &&
          /^(?:[#/?]|$)/u.test(bare.slice(h.host.length + h.path.length))
      )
    : undefined;
  return host ? bare.slice(host.host.length + host.path.length) || "/" : url;
};

/** Links, assets, and snippets for one page, resolved against its Fern location. */
const pageContext = (env, fromFile, offset = 0) => {
  const asset = (url) => {
    const rel = localFile(env, url, fromFile);
    if (!rel || /\.mdx?$/u.test(rel)) {
      return url;
    }
    env.assets.add(rel);
    return `/${rel}`;
  };
  const link = (url) => {
    const rel = localFile(env, url, fromFile);
    if (rel && !/\.mdx?$/u.test(rel)) {
      return asset(url);
    }
    const target = siteRelative(env, url);
    const groups = /^(?<p>\/[^#?]*)(?<rest>.*)$/u.exec(target)?.groups;
    const mapped = groups && env.urlMap.get(normUrl(groups.p));
    return mapped ? `${mapped}${groups.rest}` : target;
  };
  const snippet = (src) => {
    const rel = localFile(env, src, fromFile);
    if (!rel) {
      env.report.todo(
        fromFile,
        `<Markdown src="${src}">: snippet file not found`
      );
      return src;
    }
    const at = rel.lastIndexOf("snippets/");
    const name =
      at === -1 ? path.posix.basename(rel) : rel.slice(at + "snippets/".length);
    env.snippets.set(rel, `_snippets/${name}`);
    return `/_snippets/${name}`;
  };
  return { asset, link, offset, report: env.report, snippet, where: fromFile };
};

const metaSource = (meta) => {
  const fields = [
    meta.title && `  title: ${JSON.stringify(meta.title)},`,
    meta.icon && `  icon: ${JSON.stringify(meta.icon)},`,
    meta.display &&
      `  display: "${meta.display}",\n  collapsed: ${meta.collapsed},`,
    meta.pages.length > 0 &&
      `  pages: [${[...new Set(meta.pages)].map((slug) => JSON.stringify(slug)).join(", ")}],`,
  ].filter(Boolean);
  return fields.length > 0
    ? `import { defineMeta } from "blume";\n\nexport default defineMeta({\n${fields.join("\n")}\n});\n`
    : null;
};

const changelogRedirects = (placer, report) =>
  placer.changelogs.flatMap((changelog) => {
    if (changelog.overview) {
      report.todo(
        changelog.overview,
        "changelog overview: move its text to `changelog: { title, description }` in blume.config.ts"
      );
    }
    for (const other of changelog.others) {
      report.todo(
        other,
        "not a dated entry (Fern never published it): move it out or prefix it with _"
      );
    }
    const index =
      changelog.base === "/changelog"
        ? []
        : [{ from: changelog.base, status: 308, to: "/changelog" }];
    const feeds = ["rss", "atom", "json"].map((ext) => ({
      from: `${changelog.base}.${ext}`,
      status: 308,
      to: "/changelog/rss.xml",
    }));
    return [...index, ...feeds];
  });

/** Old URL → new route, and the redirects content moves need. */
const contentRedirects = (placer, report) => {
  const urlMap = new Map();
  for (const placement of placer.placements.filter((p) => !p.summary)) {
    const route = placement.slug ? `/${placement.slug}` : placement.route;
    // Two changelog entries on one day share a Fern URL: prefer the unsuffixed one.
    const unsuffixed = placement.changelog && !placement.page.date.suffix;
    if (!urlMap.has(placement.page.url) || unsuffixed) {
      urlMap.set(placement.page.url, route);
    }
  }
  const moved = [...urlMap]
    .filter(([from, to]) => from !== to)
    .map(([from, to]) => ({ from, status: 308, to }));
  const redirects = [...moved, ...changelogRedirects(placer, report)];
  const first = placer.placements.find((p) => !(p.changelog || p.summary));
  if (first && ![...urlMap.values()].includes("/")) {
    const to = first.slug ? `/${first.slug}` : first.route;
    redirects.unshift({ from: "/", status: 307, to });
    report.note(
      "blume.config.ts",
      `no page at "/": Fern sent it to the first page, so it redirects to ${to}; set logo.href to ${to}`
    );
  }
  return { redirects, urlMap };
};

const pageWrite = (placement, env, from, to) => {
  const { page } = placement;
  const source = readText(from);
  const { body } = splitFrontmatter(source);
  // Only an H1 that opens the page: a `# comment` further down can sit in a fence.
  const h1 = /^(?:[\t ]*\n)*# (?<heading>.+)\n+/u.exec(body);
  const useH1 = page.kind !== "changelogEntry" && !page.fm.title && h1;
  let title = page.name;
  if (page.fm.title) {
    title = String(page.fm.title);
  } else if (useH1) {
    title = h1.groups.heading.trim();
  }
  const data =
    page.kind === "changelogEntry"
      ? changelogFrontmatter(page, env.report)
      : pageFrontmatter(placement, title, env.report);
  // Findings cite file lines: count the frontmatter (and a dropped H1) back in.
  const dropped = useH1 ? h1[0].split("\n").length - 1 : 0;
  const offset = source.split("\n").length - body.split("\n").length + dropped;
  const text = convertBody(
    useH1 ? body.replace(h1[0], "") : body,
    pageContext(env, page.file, offset)
  );
  return {
    from,
    text: `---\n${yamlLines(data).join("\n")}\n---\n\n${text.replace(/^\n+/u, "")}`,
    to,
  };
};

const convertPages = (placer, env, outDir) => {
  const writes = [];
  let skipped = 0;
  for (const placement of placer.placements.filter((p) => !p.alias)) {
    const from = path.join(env.fernDir, placement.page.file);
    const to = path.join(outDir, placement.file);
    if (existsSync(from) && !existsSync(to)) {
      writes.push(pageWrite(placement, env, from, to));
    } else if (existsSync(from)) {
      env.report.todo(
        placement.file,
        `target exists; left ${placement.page.file} in place`
      );
    } else if (existsSync(to)) {
      skipped += 1;
    } else {
      env.report.todo(
        placement.page.file,
        "docs.yml references it, but it doesn't exist"
      );
    }
  }
  return { skipped, writes };
};

const snippetWrites = (env, outDir) =>
  [...env.snippets]
    .filter(
      ([rel, target]) =>
        existsSync(path.join(env.fernDir, rel)) &&
        !existsSync(path.join(outDir, target))
    )
    .map(([rel, target]) => {
      // Fern's {{params}} are Blume's include props as written.
      const text = convertBody(
        readText(path.join(env.fernDir, rel)),
        pageContext(env, rel)
      );
      return {
        from: path.join(env.fernDir, rel),
        text,
        to: path.join(outDir, target),
      };
    });

const diffSitemap = (file, urlMap, placer, nav) => {
  const sitemap = new Set(
    readText(file)
      .split("\n")
      .map((line) => normUrl(line.trim()))
      .filter(Boolean)
  );
  const computed = new Set([
    ...urlMap.keys(),
    ...nav.apis.map((api) => api.base),
    ...placer.changelogs.map((c) => c.base),
  ]);
  const hidden = new Set(
    placer.placements.filter((p) => p.page.hidden).map((p) => p.page.url)
  );
  const underApi = (url) =>
    nav.apis.some((api) => url.startsWith(`${api.base}/`));
  return {
    computedOnly: [...computed].filter(
      (url) => !(sitemap.has(url) || hidden.has(url))
    ),
    hiddenPages: [...hidden].filter((url) => !sitemap.has(url)),
    sitemapOnly: [...sitemap]
      .filter((url) => !(computed.has(url) || underApi(url)))
      .toSorted(byName),
  };
};

/** A file under fern/ that SDK generation can read: YAML, JSON, or the API folders. */
const sdkFile = (rel) =>
  /^(?:apis|definition)\//u.test(rel) || /\.(?:json|ya?ml)$/iu.test(rel);

const applyPlan = (work, opts) => {
  for (const write of work.writes) {
    moveFile(write.from, write.to, write.text);
  }
  for (const rel of work.env.assets) {
    const from = path.join(work.env.fernDir, rel);
    const to = path.resolve(
      opts.public,
      rel === work.env.favicon ? `favicon${path.extname(rel)}` : rel
    );
    if (existsSync(from) && !existsSync(to)) {
      mkdirSync(path.dirname(to), { recursive: true });
      // SDK generation may read it (a spec, the definition): copy, never move.
      (sdkFile(rel) ? copyFileSync : renameSync)(from, to);
    }
  }
  for (const meta of work.metas.filter((m) => !existsSync(m.to))) {
    mkdirSync(path.dirname(meta.to), { recursive: true });
    writeFileSync(meta.to, meta.text);
  }
  writeFileSync(
    path.resolve(opts.state),
    `${JSON.stringify(work.state, null, 2)}\n`
  );
};

const readFern = (opts, report) => {
  const fernDir = path.resolve(opts.fern);
  if (!existsSync(path.join(fernDir, "docs.yml"))) {
    throw new Error(
      `${opts.fern}/docs.yml not found: run from the folder that holds fern/, or pass --fern`
    );
  }
  const docs =
    parseYaml(readText(path.join(fernDir, "docs.yml")), "docs.yml") ?? {};
  if (docs.versions || docs.products) {
    throw new Error(
      "docs.yml declares versions or products, which this codemod doesn't handle: follow the reference by hand"
    );
  }
  const nav = new Navigation(
    fernDir,
    report,
    loadPrevious(path.resolve(opts.state))
  );
  const placer = new Placer(report);
  for (const tab of nav.tabs(docs)) {
    placer.tab(tab);
  }
  const roots = placer.tabs.filter((tab) => tab.path === "/" && !tab.hidden);
  if (roots.length > 1) {
    report.todo(
      "blume.config.ts",
      `tabs ${roots.map((t) => `"${t.label}"`).join(", ")} share no URL prefix; only one tab can sit at "/"`
    );
  }
  return { docs, fernDir, nav, placer };
};

const plan = (opts) => {
  const report = makeReport();
  const { docs, fernDir, nav, placer } = readFern(opts, report);
  const { redirects, urlMap } = contentRedirects(placer, report);
  const hosts = instanceHosts(docs);
  const paths = [...new Set(hosts.map((host) => host.path))];
  if (paths.some(Boolean)) {
    report.note(
      "docs.yml",
      `an instance serves under ${paths.filter(Boolean).join(", ")}: links and redirects written with that path need it stripped (Blume adds deployment.base itself)`
    );
  }
  const env = {
    assets: new Set(),
    fernDir,
    hosts,
    report,
    snippets: new Map(),
    urlMap,
  };
  const outDir = path.resolve(opts.out);
  const { skipped, writes } = convertPages(placer, env, outDir);
  writes.push(...snippetWrites(env, outDir));
  const config = pageContext(env, "docs.yml");
  for (const logo of [docs.logo?.light, docs.logo?.dark].filter(Boolean)) {
    config.asset(String(logo));
  }
  env.favicon = docs.favicon
    ? config.asset(String(docs.favicon)).replace(/^\//u, "")
    : undefined;
  for (const rel of [...env.assets].filter(sdkFile)) {
    report.note(
      rel,
      "a page links it: copied to public/, not moved (SDK generation may read it); the copy goes stale when it changes"
    );
  }
  const isDraft = (rel) =>
    /\.mdx?$/u.test(rel) &&
    !nav.referenced.has(path.join(fernDir, rel)) &&
    !env.snippets.has(rel) &&
    !placer.changelogs.some(
      (c) => c.overview === rel || c.others.includes(rel)
    );
  const drafts = listFiles(fernDir).filter(isDraft);
  for (const rel of drafts) {
    report.todo(
      rel,
      "unpublished draft (docs.yml never references it): decide where it goes"
    );
  }
  const metas = [...placer.metas]
    .toSorted(([a], [b]) => byName(a, b))
    .map(([folder, meta]) => ({
      text: metaSource(meta),
      to: path.join(outDir, folder, "meta.ts"),
    }))
    .filter((meta) => meta.text);
  const pages = placer.placements.map((p) => ({
    file: p.file,
    from: p.page.url,
    source: p.page.file,
    to: p.slug ? `/${p.slug}` : p.route,
  }));
  const oldUrls = [
    ...urlMap.keys(),
    ...nav.apis.map((api) => api.base),
    ...placer.changelogs.map((c) => c.base),
  ];
  const state = {
    apis: nav.apis,
    docsRedirects: docsRedirects(docs, fernDir, report),
    generated: placer.changelogs.length > 0 ? ["/changelog"] : [],
    oldUrls: [...new Set(oldUrls)].toSorted(byName),
    out: toPosix(path.relative(process.cwd(), outDir)),
    pages,
    redirects,
    urlMap: Object.fromEntries(urlMap),
  };
  if (opts.write) {
    applyPlan({ env, metas, state, writes }, opts);
  }
  return {
    apis: nav.apis,
    assets: [...env.assets],
    drafts,
    findings: report.entries,
    metas: metas.length,
    moved: redirects.length,
    pages: placer.placements.filter((p) => !p.alias).length,
    sitemapDiff: opts.sitemap
      ? diffSitemap(opts.sitemap, urlMap, placer, nav)
      : undefined,
    skipped,
    tabs: placer.tabs,
    wrote: opts.write,
  };
};

// --- endpoints -----------------------------------------------------------------------------

const METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
];
const PATTERN = /[(*:]/u;
const SPREAD = /\/:\w+\*$/u;

/** Fern's URL for a spec operation (the reference's "API URLs"). */
const fernEndpointUrl = (api, op, method, specPath) => {
  if (api.kind === "definition") {
    return op.operationId
      ? joinUrl(api.base, String(op.operationId).split("_").map(kebab))
      : null;
  }
  // Fern's OpenAPI parser: x-fern-sdk-method-name names the endpoint and
  // x-fern-sdk-group-name its group; otherwise the first tag is the group and
  // the operationId minus the tag's leading words (else the summary) the name.
  const sdkMethod = op["x-fern-sdk-method-name"];
  const tag = op.tags?.[0];
  const groups = [sdkMethod ? op["x-fern-sdk-group-name"] : tag]
    .flat()
    .filter(Boolean)
    .map(kebab);
  const tagWords = kebab(tag).split("-").filter(Boolean);
  const idWords = kebab(op.operationId).split("-").filter(Boolean);
  const leading =
    tagWords.length > 0 &&
    tagWords.length < idWords.length &&
    tagWords.every((word, i) => idWords[i] === word);
  const id = idWords.slice(leading ? tagWords.length : 0).join("-");
  const name = sdkMethod ?? (id || op.summary || `${method} ${specPath}`);
  return joinUrl(api.base, groups, kebab(name));
};

/** One API's Fern endpoint and webhook URLs → Blume routes. */
const joinApi = (api, reference, spec, oldUrls, report) => {
  const joined = [];
  for (const [specPath, item] of Object.entries(spec.paths ?? {})) {
    for (const method of METHODS.filter((m) => item?.[m])) {
      const endpoint = `${method.toUpperCase()} ${specPath}`;
      const from = fernEndpointUrl(api, item[method], method, specPath);
      const route = reference.endpoints?.[endpoint];
      if (from && route) {
        joined.push([from, route]);
      } else {
        report.todo(
          api.base,
          `${endpoint}: ${from ? "no page in the build" : "no operationId, so its Fern URL is unknown"}`
        );
      }
    }
  }
  // Webhooks: fern export drops them, so their pages only exist when an
  // overlay restored them; match each to the old URL ending in its kebab name.
  const taken = new Set(joined.map(([from]) => from));
  for (const [endpoint, route] of Object.entries(reference.endpoints ?? {})) {
    const [, name] = endpoint.split(" ");
    const from = name.startsWith("/")
      ? undefined
      : oldUrls.find(
          (url) =>
            url.startsWith(`${api.base}/`) &&
            !taken.has(url) &&
            url.endsWith(`/${kebab(name)}`)
        );
    if (from) {
      joined.push([from, route]);
    }
  }
  return joined;
};

/** Every Fern endpoint URL → its route, and each group URL → its overview anchor. */
const joinEndpoints = (state, routes, specs, oldUrls, report) => {
  const endpointMap = new Map();
  const groupMap = new Map();
  for (const api of state.apis) {
    const reference = routes.references?.[api.base];
    const specFile = specs.get(api.base);
    if (reference && specFile) {
      for (const [from, route] of joinApi(
        api,
        reference,
        JSON.parse(readText(specFile)),
        oldUrls,
        report
      )) {
        endpointMap.set(from, route);
        const group = from.slice(0, from.lastIndexOf("/"));
        if (group !== api.base && !groupMap.has(group)) {
          groupMap.set(
            group,
            `${api.base}#${route.slice(api.base.length + 1).split("/")[0]}`
          );
        }
      }
    } else {
      report.todo(
        api.base,
        reference
          ? `pass --spec ${api.base}=<spec.json>`
          : `no reference at ${api.base} in the routes file`
      );
    }
  }
  return { endpointMap, groupMap };
};

/** Follow a docs.yml destination through Fern's own redirects to its final route. */
const followDestination = (dest, exact, maps) => {
  let current = dest;
  for (
    let hop = 0;
    hop < 10 && !maps.finalMap.has(current) && exact.has(current);
    hop += 1
  ) {
    current = exact.get(current);
  }
  const [url, hash] = current.split("#");
  const mapped = maps.finalMap.get(url) ?? maps.groupMap.get(url);
  if (!mapped) {
    return current;
  }
  return hash && !mapped.includes("#") ? `${mapped}#${hash}` : mapped;
};

/** One docs.yml redirect in Blume's shape (a reference pattern expands per operation). */
const translateRedirect = (redirect, exact, maps, report) => {
  const { endpointMap, finalMap, groupMap } = maps;
  const from = normUrl(String(redirect.source));
  const external = /^https?:/u.test(String(redirect.destination));
  const dest = external
    ? String(redirect.destination)
    : normUrl(String(redirect.destination));
  const status = redirect.permanent === false ? 307 : 308;
  if (/\(|:\w+\+/u.test(from)) {
    report.todo(
      from,
      "regex or one-or-more pattern: Blume reads :name and :name* only; expand it or use host rules"
    );
    return [];
  }
  const destBase = dest.replace(SPREAD, "");
  const covered =
    PATTERN.test(from) && SPREAD.test(dest)
      ? [...endpointMap].filter(([fern]) => fern.startsWith(`${destBase}/`))
      : [];
  if (covered.length > 0) {
    const fromBase = from.replace(SPREAD, "");
    return covered.map(([fern, route]) => ({
      from: `${fromBase}${fern.slice(destBase.length)}`,
      status,
      to: route,
    }));
  }
  const to =
    external || PATTERN.test(dest)
      ? dest
      : followDestination(dest, exact, maps);
  const landed =
    external ||
    PATTERN.test(to) ||
    [...finalMap.values()].includes(to.split("#")[0]) ||
    groupMap.has(dest);
  if (!landed) {
    report.todo(
      from,
      `destination ${to} isn't a page here: it probably 404ed on Fern too; point it at the intended page`
    );
  }
  return [{ from, status, to }];
};

const coverage = (state, redirects, oldUrls) => {
  const served = new Set([
    ...state.pages.map((p) => p.to),
    ...state.generated,
    ...state.apis.map((a) => a.base),
  ]);
  const exact = new Set(redirects.map((r) => r.from));
  const patterns = redirects
    .filter((r) => PATTERN.test(r.from))
    .map(
      (r) =>
        new RegExp(
          `^${r.from.replace(SPREAD, "(?:/.*)?").replaceAll(/:\w+/gu, "[^/]+")}$`,
          "u"
        )
    );
  return oldUrls
    .filter(
      (url) =>
        !(
          served.has(url) ||
          exact.has(url) ||
          patterns.some((p) => p.test(url))
        )
    )
    .toSorted(byName);
};

const fixLink = (url, targets, apiRoutes) => {
  const api = /^api:(?:[\w-]+:)?(?<method>[A-Z]+)(?<route>\/\S*)$/u.exec(
    url
  )?.groups;
  if (api) {
    return apiRoutes.get(`${api.method} ${api.route}`) ?? url;
  }
  const groups = /^(?<p>\/[^#?]*)(?<rest>.*)$/u.exec(url)?.groups;
  const target = groups && targets.get(normUrl(groups.p));
  if (!target) {
    return url;
  }
  return target.includes("#") ? target : `${target}${groups.rest}`;
};

const rewriteLinks = (state, targets, apiRoutes, write) => {
  const outDir = path.resolve(state.out);
  const rewritten = [];
  const code =
    /(?<code>^[\t ]*(?:`{3,}|~{3,})[\s\S]*?^[\t ]*(?:`{3,}|~{3,})[\t ]*$|`[^\n`]+`)/mu;
  for (const rel of listFiles(outDir).filter((file) => /\.mdx?$/u.test(file))) {
    const file = path.join(outDir, rel);
    const before = readText(file);
    const after = before
      .split(code)
      .map((part, i) =>
        i % 2 === 1
          ? part
          : part.replaceAll(
              /(?<lead>\]\(|\shref=["'])(?<url>[^\s"')]+)/gu,
              (...match) => {
                const { lead, url } = match.at(-1);
                return `${lead}${fixLink(url, targets, apiRoutes)}`;
              }
            )
      )
      .join("");
    if (after !== before) {
      rewritten.push(`${state.out}/${rel}`);
      if (write) {
        writeFileSync(file, after);
      }
    }
  }
  return rewritten;
};

const endpoints = (opts) => {
  const state = JSON.parse(readText(path.resolve(opts.state)));
  const routes = JSON.parse(readText(path.resolve(opts.routes)));
  const report = makeReport();
  const specs = new Map(
    opts.specs.map((spec) => [normUrl(spec.route), spec.file])
  );
  const yamlSpec = [...specs.values()].find((file) => /\.ya?ml$/iu.test(file));
  if (yamlSpec) {
    throw new Error(
      `${yamlSpec}: pass a JSON spec (fern export writes JSON to a .json path)`
    );
  }
  const fromSitemap = opts.sitemap
    ? readText(opts.sitemap)
        .split("\n")
        .map((line) => normUrl(line.trim()))
    : [];
  const oldUrls = [
    ...new Set([...state.oldUrls, ...fromSitemap.filter(Boolean)]),
  ];
  const { endpointMap, groupMap } = joinEndpoints(
    state,
    routes,
    specs,
    oldUrls,
    report
  );
  const finalMap = new Map([...Object.entries(state.urlMap), ...endpointMap]);
  const maps = { endpointMap, finalMap, groupMap };
  const exact = new Map(
    state.docsRedirects
      .filter((r) => !PATTERN.test(String(r.source)))
      .map((r) => [normUrl(String(r.source)), normUrl(String(r.destination))])
  );
  const all = [
    ...state.redirects,
    ...state.docsRedirects.flatMap((redirect) =>
      translateRedirect(redirect, exact, maps, report)
    ),
    ...[...endpointMap].map(([from, to]) => ({ from, status: 308, to })),
    ...[...groupMap]
      .filter(([from]) => !finalMap.has(from))
      .map(([from, to]) => ({ from, status: 307, to })),
  ];
  const seen = new Set();
  const redirects = all.filter(
    (r) => r.from !== r.to && !seen.has(r.from) && seen.add(r.from)
  );
  const missing = coverage(state, redirects, oldUrls);
  for (const url of missing) {
    report.todo(url, "old URL neither served nor redirected");
  }
  const apiRoutes = new Map(
    Object.values(routes.references ?? {}).flatMap((reference) =>
      Object.entries(reference.endpoints ?? {})
    )
  );
  const targets = new Map(
    redirects
      .filter((r) => !(PATTERN.test(r.from) || PATTERN.test(r.to)))
      .map((r) => [r.from, r.to])
  );
  const rewritten = rewriteLinks(state, targets, apiRoutes, opts.write);
  if (opts.write) {
    writeFileSync(
      path.resolve(opts.redirectsOut),
      `${JSON.stringify(redirects, null, 2)}\n`
    );
  }
  return {
    endpoints: endpointMap.size,
    findings: report.entries,
    groups: groupMap.size,
    missing,
    redirects: redirects.length,
    rewritten,
    wrote: opts.write ? opts.redirectsOut : false,
  };
};

// --- CLI -------------------------------------------------------------------------------------

const HELP = `fern-codemod: the mechanical half of a Fern Docs → Blume migration

  node fern-codemod.mjs [plan] [--write] [--fern fern] [--out docs] [--public public]
                        [--sitemap old-urls.txt] [--json]
      Place every page at a path that reproduces its Fern URL, convert
      frontmatter and components, write meta.ts files, move assets to
      public/. Dry run unless --write, which also saves fern-migration.json.

  node fern-codemod.mjs endpoints --routes routes.json --spec <route>=<spec.json>
                        [--sitemap old-urls.txt] [--write] [--json]
      After blume build and operation-routes.mjs: one redirect per old
      endpoint and group URL, docs.yml redirects translated, links rewritten,
      every old URL checked. --write saves fern-redirects.json.
`;

const VALUE_FLAGS = new Set([
  "--fern",
  "--out",
  "--public",
  "--routes",
  "--sitemap",
  "--spec",
]);

const parseArgs = (argv) => {
  const opts = {
    command: "plan",
    fern: "fern",
    json: false,
    out: "docs",
    public: "public",
    redirectsOut: "fern-redirects.json",
    specs: [],
    state: "fern-migration.json",
    write: false,
  };
  const args = [...argv];
  if (args[0] && !args[0].startsWith("-")) {
    opts.command = args.shift();
  }
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    const value = args[i + 1];
    if (VALUE_FLAGS.has(flag) && value === undefined) {
      throw new Error(`${flag} needs a value`);
    }
    if (flag === "--spec") {
      const [route, file] = value.split(/[=](?<file>.*)/u);
      opts.specs.push({ file, route });
    } else if (VALUE_FLAGS.has(flag)) {
      opts[flag.slice(2)] = value;
    } else if (flag === "--write" || flag === "--json") {
      opts[flag.slice(2)] = true;
    } else if (flag === "--help" || flag === "-h") {
      opts.command = "help";
    } else {
      throw new Error(`unknown argument ${flag} (see --help)`);
    }
    i += VALUE_FLAGS.has(flag) ? 1 : 0;
  }
  return opts;
};

const print = (line = "") => process.stdout.write(`${line}\n`);

const printFindings = (findings) => {
  const labels = [
    ["todo", "TODO (judgment)"],
    ["icon", "icons"],
    ["dropped", "dropped"],
    ["note", "notes"],
  ];
  for (const [kind, label] of labels) {
    const matching = findings.filter((finding) => finding.kind === kind);
    if (matching.length > 0) {
      print(`\n${label}:`);
      for (const finding of matching) {
        print(`  ${finding.where}: ${finding.detail}`);
      }
    }
  }
};

const tabLine = (tab) => {
  if (tab.href) {
    return `  ${tab.label} links to ${tab.href}: put it in navigation.actions`;
  }
  const icon = tab.icon ? `, icon: ${JSON.stringify(tab.icon)}` : "";
  return `  { label: ${JSON.stringify(tab.label)}, path: ${JSON.stringify(tab.path)}${icon} }${tab.hidden ? " (hidden on Fern)" : ""}`;
};

const printPlan = (result) => {
  print(
    `${result.pages} page(s) placed (${result.skipped} already migrated); ${result.moved} content redirect(s); ${result.metas} meta.ts; ${result.assets.length} asset(s) for public/`
  );
  const diff = result.sitemapDiff;
  if (diff) {
    print(
      `sitemap: ${diff.computedOnly.length} computed URL(s) not in it, ${diff.sitemapOnly.length} of its URLs not computed (API pages aside), ${diff.hiddenPages.length} hidden page(s) it omits`
    );
    for (const url of diff.computedOnly) {
      print(`  computed only: ${url}`);
    }
    for (const url of diff.sitemapOnly) {
      print(`  sitemap only: ${url}`);
    }
  }
  print("\nnavigation.tabs:");
  for (const tab of result.tabs) {
    print(tabLine(tab));
  }
  for (const api of result.apis) {
    const source =
      api.kind === "definition"
        ? `Fern Definition in ${api.definition}: fern export it to OpenAPI`
        : "OpenAPI";
    print(`API at ${api.base}: ${source}`);
  }
  printFindings(result.findings);
  print(
    result.wrote
      ? "\nWrote the changes and fern-migration.json."
      : "\nDry run. Re-run with --write to apply."
  );
};

const printEndpoints = (result) => {
  print(
    `${result.endpoints} endpoint URL(s) joined, ${result.groups} group URL(s), ${result.redirects} redirect(s) in all`
  );
  print(
    `${result.rewritten.length} file(s) with links to old URLs${result.wrote ? " rewritten" : ""}`
  );
  print(
    result.missing.length === 0
      ? "every old URL is served or redirected"
      : `${result.missing.length} old URL(s) not covered`
  );
  printFindings(result.findings);
  print(
    result.wrote
      ? `\nWrote ${result.wrote}: import it into redirects in blume.config.ts.`
      : "\nDry run. Re-run with --write to save the redirects and rewrite links."
  );
};

const COMMANDS = {
  endpoints: (opts) => {
    if (!opts.routes) {
      throw new Error("endpoints needs --routes <operation-routes.mjs output>");
    }
    return [endpoints(opts), printEndpoints];
  },
  plan: (opts) => [plan(opts), printPlan],
};

const run = (opts) => {
  if (opts.command === "help") {
    process.stdout.write(HELP);
    return;
  }
  const command = COMMANDS[opts.command];
  if (!command) {
    throw new Error(`unknown command ${opts.command} (see --help)`);
  }
  const [result, printer] = command(opts);
  if (opts.json) {
    print(JSON.stringify(result, null, 2));
  } else {
    printer(result);
  }
};

process.stdout.on("error", (error) => {
  // A reader that closes the pipe early (`| head`) isn't a failure.
  if (error.code !== "EPIPE") {
    throw error;
  }
});

try {
  run(parseArgs(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(`fern-codemod: ${error.message}\n`);
  process.exitCode = 1;
}
