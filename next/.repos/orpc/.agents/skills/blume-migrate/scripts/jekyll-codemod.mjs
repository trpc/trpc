#!/usr/bin/env node
// jekyll-codemod.mjs — the mechanical part of a Jekyll (Just the Docs) →
// Blume migration. Run it from the Jekyll source directory (the folder that
// holds `_config.yml`, which becomes Blume's `content.root: "."`), after
// building the old site. It rewrites pages and Markdown partials only where
// the mapping is exact, and reports everything it leaves:
//
//   - Kramdown block IALs: a callout name declared under `callouts:` in
//     `_config.yml` (`{: .note }` before or after a paragraph or blockquote,
//     `{: .note-title }` with its title paragraph, nested ones) → `:::type`
//     directives. A name `callouts:` doesn't declare, or a malformed IAL,
//     rendered a plain paragraph, so the IAL is dropped. `.label` →
//     `<Badge>`, `.no_toc` on a heading → `[!toc]`, `{#id}`/`{: #id }` on a
//     heading → `[#id]`, and Just the Docs' utility and button classes go.
//   - The in-page TOC (`1. TOC` + `{:toc}`, the `<details>` around it, its
//     "Table of contents" heading, an include of a partial that holds only a
//     TOC) is deleted, and so are `{::comment}` blocks and ALDs.
//   - The body `# H1` → front matter `title` (a different old `title` becomes
//     `sidebar.label` and `seo.title`); Just the Docs' navigation keys,
//     `layout`, `permalink`, and the redirect keys are mapped or removed.
//   - Liquid: `{% include x.md k="v" %}` (and `include_relative`,
//     `include_cached`) → `<include k="v">/_includes/x.md</include>`, with
//     `{{ include.k }}` → `{{k}}` in the partial; `{{ site.x }}` (a plain
//     value in `_config.yml`) → the `{{x}}` variable; `{{ site.baseurl }}`,
//     `relative_url`, `absolute_url`, and `{% link %}` → root-relative routes;
//     `{% highlight %}` → a fence; `{% comment %}` removed; `{% raw %}`
//     unwrapped, its content left exactly as written.
//   - Links: relative links resolved against the page's old URL (a `pretty`
//     page lived at `/a/b/`), `.md` and `.html` links, trailing slashes, and
//     links to the site's own origin → the target's route; relative Markdown
//     images → a path from the page's new location, and a relative raw HTML
//     `src` → a root path (Jekyll resolved it against the page's old URL).
//   - With `--old <built site>`: the sidebar the old build rendered becomes
//     folders and `meta.ts` files. A parent page that's a leaf file moves into
//     a folder of its own (a `(name)` group folder when its children sit
//     beside it), a child elsewhere moves under its parent, and a `slug` pins
//     every URL a move would change. Each section's duplicate index row is
//     hidden when the titles allow it, pages outside the nav are hidden (a
//     hidden home page still stays in search, the sitemap, and llms.txt), a
//     parent that showed Just the Docs' child list gets
//     `directory: "accordion"`, and a folder the nav never showed gets
//     `collapsed: false`: Blume opens a group that's alone at the top of the
//     sidebar by itself, but not one beside the home page's row or a section.
//   - A page that now needs MDX (a directive, a component, `$$` math, an
//     indented include, or a partial that does) is renamed `.mdx`, with void
//     tags self-closed, HTML comments as `{/* */}`, autolinks as links, and
//     page scripts and styles removed, inline code left as written. Partials
//     such a page includes get the same treatment.
//   - `redirect_from`, `redirect_to`, `.html` URLs, and the variables go to
//     `jekyll-migration.json`, for `blume.config.ts` to import.
//
// It never changes the content of `{% raw %}` blocks or fenced code (except
// the Liquid Jekyll rendered there too), never moves a folder, and
// reports HTML includes, Liquid logic, unknown front matter, MDX hazards,
// custom CSS that hides or adds content, and theme hook files.
//
// Design constraints (shared with the other blume-migrate codemods):
//   - ZERO dependencies: runs with a bare `node`.
//   - Deterministic: files are processed in sorted order.
//   - Runs once: `--write` always writes `jekyll-migration.json` and refuses a
//     folder that has one, since a second pass would take a page's next H1
//     as its title and convert what `{% raw %}` protected the first time.
//   - Reports every change and every finding, so nothing is silent.
//
// Usage, from the Jekyll source directory:
//   node jekyll-codemod.mjs --old <built site> .           # dry run
//   node jekyll-codemod.mjs --old <built site> --write .   # apply
//   node jekyll-codemod.mjs --old <built site> --json .    # JSON report
//
// `--old` is the Jekyll build (`bundle exec jekyll build -d <dir>`). Without
// it, URLs come from the permalink rules alone and the navigation is left
// for you. `--callouts note,warning` names the callout classes of a site whose
// `_config.yml` has no `callouts:` (it styled them in `_sass/custom`).

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

// --- Tables -------------------------------------------------------------------

// Just the Docs callout names → the Blume directive to write. Blume reads
// `caution`, `error`, `important`, and `warn` as aliases, so they stay.
const CALLOUT_NAMES = new Map([
  ["attention", "warning"],
  ["caution", "caution"],
  ["danger", "danger"],
  ["error", "error"],
  ["highlight", "info"],
  ["hint", "tip"],
  ["important", "important"],
  ["info", "info"],
  ["new", "success"],
  ["note", "note"],
  ["success", "success"],
  ["tip", "tip"],
  ["warn", "warn"],
  ["warning", "warning"],
]);

// A callout name Blume doesn't know maps by the color `_config.yml` gave it.
const CALLOUT_COLORS = new Map([
  ["blue", "info"],
  ["green", "success"],
  ["grey-dk", "note"],
  ["grey-lt", "note"],
  ["purple", "note"],
  ["red", "danger"],
  ["yellow", "warning"],
]);

// `.label-<color>` → `<Badge color>`; a bare `.label` is blue.
const LABEL_COLORS = new Set(["blue", "green", "purple", "red", "yellow"]);

// Just the Docs' layout and typography utilities: dropping them keeps the
// content.
const UTILITY_CLASS =
  /^(?:text-delta|fs-\d+|fw-\d+|lh-[\w-]+|d-[\w-]+|text-[\w-]+|m[trblxy]?-[\w-]+|p[trblxy]?-[\w-]+|float-[\w-]+|v-align-[\w-]+|bg-[\w-]+|flex-[\w-]+|opaque|lead|no_toc)$/u;

// Front matter keys Just the Docs reads for its navigation.
const NAV_KEYS = new Set([
  "ancestor",
  "child_nav_order",
  "grand_parent",
  "has_children",
  "has_toc",
  "nav_exclude",
  "nav_fold",
  "nav_order",
  "parent",
]);

// Layouts that only frame a page: a page using one needs no `mode`.
const PLAIN_LAYOUTS = new Set(["about", "default", "home", "page", "post"]);

// Jekyll keys this codemod reads and maps (or drops) itself.
const HANDLED_KEYS = new Set([
  ...NAV_KEYS,
  "canonical_url",
  "description",
  "image",
  "last_modified_date",
  "layout",
  "nav_enabled",
  "permalink",
  "published",
  "redirect_from",
  "redirect_to",
  "search",
  "search_exclude",
  "seo",
  "sidebar",
  "summary",
  "title",
]);

// Blume's page front matter keys (its schema is strict).
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

const FRONTMATTER_ORDER = [
  "title",
  "description",
  "slug",
  "sidebar",
  "seo",
  "search",
  "lastModified",
  "draft",
  "mode",
];

const VOID_TAGS =
  "area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr";

// Words a folder name spells in lowercase that Blume capitalizes its own way
// when it labels a group (core/navigation.ts): a `meta.ts` title is written
// only when the label differs from Blume's.
const WORD_FORMS = new Map([
  ["ai", "AI"],
  ["api", "API"],
  ["apis", "APIs"],
  ["asyncapi", "AsyncAPI"],
  ["cli", "CLI"],
  ["css", "CSS"],
  ["faq", "FAQ"],
  ["faqs", "FAQs"],
  ["graphql", "GraphQL"],
  ["html", "HTML"],
  ["http", "HTTP"],
  ["https", "HTTPS"],
  ["id", "ID"],
  ["ids", "IDs"],
  ["ios", "iOS"],
  ["js", "JS"],
  ["json", "JSON"],
  ["jwt", "JWT"],
  ["llm", "LLM"],
  ["llms", "LLMs"],
  ["macos", "macOS"],
  ["mcp", "MCP"],
  ["oauth", "OAuth"],
  ["openapi", "OpenAPI"],
  ["rss", "RSS"],
  ["sdk", "SDK"],
  ["sdks", "SDKs"],
  ["seo", "SEO"],
  ["sql", "SQL"],
  ["sso", "SSO"],
  ["ts", "TS"],
  ["ui", "UI"],
  ["url", "URL"],
  ["urls", "URLs"],
  ["xml", "XML"],
  ["yaml", "YAML"],
]);

const META_HEADER =
  "// Generated by jekyll-codemod.mjs from the old site's sidebar.";

const BOM = String.fromCodePoint(0xfe_ff);

// `{` `}` `%` inside `{% raw %}` blocks are swapped for private-use characters
// until the end, so no pass reads them as Liquid or as an IAL.
const RAW_CHARS = new Map([
  ["%", String.fromCodePoint(0xe0_02)],
  ["{", String.fromCodePoint(0xe0_00)],
  ["}", String.fromCodePoint(0xe0_01)],
]);
const RAW_PLACEHOLDERS = [...RAW_CHARS.values()];
const hasRawPlaceholder = (text) =>
  RAW_PLACEHOLDERS.some((char) => text.includes(char));

// --- Values -------------------------------------------------------------------

// Values come from the YAML reader below: strings, numbers, booleans, null,
// arrays, and plain objects.
const isRecord = (value) =>
  value !== null &&
  value !== undefined &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const textOf = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === true ||
    value === false ||
    Array.isArray(value) ||
    isRecord(value)
  ) {
    return;
  }
  const text = String(value).trim();
  return text === "" ? undefined : text;
};
const recordOf = (value) => (isRecord(value) ? value : {});
const listOf = (value) => {
  if (Array.isArray(value)) {
    return value;
  }
  return value === null || value === undefined ? [] : [value];
};

// A replace() callback that reads named groups.
const byGroups =
  (read) =>
  (...args) =>
    read(args.at(-1), args[0]);

/** A file's text without a BOM, with LF line endings. */
const normalizeText = (text) =>
  (text.startsWith(BOM) ? text.slice(1) : text).replaceAll("\r\n", "\n");

const parentOf = (rel) => {
  const dir = path.posix.dirname(rel);
  return dir === "." ? "" : dir;
};

const safeDecode = (value) => {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
};

// --- Minimal YAML (the subset `_config.yml` and front matter use) -------------

class YamlError extends Error {
  constructor(message) {
    super(message);
    this.name = "YamlError";
  }
}

const indentOf = (line) => line.match(/^ */u)[0].length;
const isSkippable = (line) => /^\s*(?:#.*)?$/u.test(line);

const ESCAPES = new Map([
  [" ", " "],
  ['"', '"'],
  ["/", "/"],
  ["0", String.fromCodePoint(0)],
  ["L", String.fromCodePoint(0x20_28)],
  ["N", String.fromCodePoint(0x85)],
  ["P", String.fromCodePoint(0x20_29)],
  ["\\", "\\"],
  ["_", String.fromCodePoint(0xa0)],
  ["a", String.fromCodePoint(7)],
  ["b", "\b"],
  ["e", String.fromCodePoint(0x1b)],
  ["f", "\f"],
  ["n", "\n"],
  ["r", "\r"],
  ["t", "\t"],
  ["v", "\v"],
]);

const unescapeDouble = (body) =>
  body.replaceAll(
    /\\(?:x(?<x>[0-9a-fA-F]{2})|u(?<u>[0-9a-fA-F]{4})|U(?<big>[0-9a-fA-F]{8})|(?<char>.))/gu,
    byGroups(({ big, char, u, x }) => {
      const hex = x ?? u ?? big;
      if (hex) {
        return String.fromCodePoint(Number.parseInt(hex, 16));
      }
      if (!ESCAPES.has(char)) {
        throw new YamlError(`unknown escape \\${char}`);
      }
      return ESCAPES.get(char);
    })
  );

const splitFlow = (inner) => {
  const items = [];
  let current = "";
  let quote = null;
  for (const char of inner) {
    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
      current += char;
    } else if (char === "[" || char === "{") {
      throw new YamlError("nested flow collections");
    } else if (char === ",") {
      items.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim() !== "") {
    items.push(current.trim());
  }
  return items;
};

const parseQuoted = (text) => {
  if (text.startsWith('"')) {
    const match = /^"(?<inner>(?:[^"\\]|\\.)*)"\s*(?:#.*)?$/u.exec(text);
    if (!match) {
      throw new YamlError("unterminated double-quoted string");
    }
    return unescapeDouble(match.groups.inner);
  }
  const match = /^'(?<inner>(?:[^']|'')*)'\s*(?:#.*)?$/u.exec(text);
  if (!match) {
    throw new YamlError("unterminated single-quoted string");
  }
  return match.groups.inner.replaceAll("''", "'");
};

const parsePlain = (text) => {
  const plain = text.replace(/\s+#.*$/u, "");
  if (/^(?:true|True|TRUE)$/u.test(plain)) {
    return true;
  }
  if (/^(?:false|False|FALSE)$/u.test(plain)) {
    return false;
  }
  if (
    /^[-+]?(?:0|[1-9]\d*)$/u.test(plain) ||
    /^[-+]?(?:\d+\.\d*|\.\d+)(?:[eE][-+]?\d+)?$/u.test(plain)
  ) {
    return Number(plain);
  }
  return plain;
};

const parseScalar = (raw) => {
  const text = raw.trim();
  if (text === "" || text === "~" || /^null$/iu.test(text)) {
    return null;
  }
  if (/^[&*!|>]/u.test(text)) {
    throw new YamlError(`unsupported value ${text}`);
  }
  if (text.startsWith('"') || text.startsWith("'")) {
    return parseQuoted(text);
  }
  if (text.startsWith("[")) {
    if (!text.endsWith("]")) {
      throw new YamlError("unterminated flow sequence");
    }
    return splitFlow(text.slice(1, -1)).map(parseScalar);
  }
  if (text.startsWith("{")) {
    if (/^\{\s*\}$/u.test(text)) {
      return {};
    }
    throw new YamlError("flow mappings");
  }
  return parsePlain(text);
};

const foldLines = (content) => {
  let value = "";
  let previous = null;
  for (const line of content) {
    if (line === "") {
      value += "\n";
    } else if (previous === null || previous === "") {
      value += line;
    } else if (line.startsWith(" ") || previous.startsWith(" ")) {
      value += `\n${line}`;
    } else {
      value += ` ${line}`;
    }
    previous = line;
  }
  return value;
};

const chomp = (value, indicator) => {
  const body = value.replace(/\n+$/u, "");
  if (indicator === "-") {
    return body;
  }
  if (indicator === "+") {
    return `${body}${value.slice(body.length)}\n`;
  }
  return body === "" ? "" : `${body}\n`;
};

const parseBlockScalar = (lines, start, header, parentIndent) => {
  const match = /^(?<style>[|>])(?<indicator>[-+]?)$/u.exec(header);
  if (!match) {
    throw new YamlError(`unsupported block scalar header ${header}`);
  }
  let end = start;
  while (
    end < lines.length &&
    (lines[end].trim() === "" || indentOf(lines[end]) > parentIndent)
  ) {
    end += 1;
  }
  const block = lines.slice(start, end);
  const first = block.find((line) => line.trim() !== "");
  const indent = first === undefined ? 0 : indentOf(first);
  const content = block.map((line) =>
    line.trim() === "" ? "" : line.slice(indent)
  );
  const value =
    match.groups.style === "|" ? content.join("\n") : foldLines(content);
  return [chomp(value, match.groups.indicator), end];
};

const KEY_LINE =
  /^(?:"(?<dq>(?:[^"\\]|\\.)*)"|'(?<sq>(?:[^']|'')*)'|(?<plain>[^\s"'#\-?:,[\]{}][^#]*?|-[^\s#][^#]*?))\s*:(?:\s+(?<rest>.*))?$/u;

const nextContent = (lines, index) => {
  let cursor = index;
  while (cursor < lines.length && isSkippable(lines[cursor])) {
    cursor += 1;
  }
  return cursor;
};

const isSequenceLine = (line, indent) =>
  indentOf(line) === indent && /^-(?:\s|$)/u.test(line.slice(indent));

const keyOf = ({ dq, plain, sq }) => {
  if (dq !== undefined) {
    return unescapeDouble(dq);
  }
  if (sq !== undefined) {
    return sq.replaceAll("''", "'");
  }
  return plain;
};

// One `key: value` line; `parseBlock` reads a nested block.
const parseEntry = (lines, index, indent, parseBlock) => {
  const content = lines[index].slice(indent);
  const match = KEY_LINE.exec(content);
  if (!match) {
    throw new YamlError(`can't read line ${index + 1}: ${content}`);
  }
  const key = keyOf(match.groups);
  const value = (match.groups.rest ?? "").trim();
  if (value === "" || value.startsWith("#")) {
    const next = nextContent(lines, index + 1);
    const nested =
      next < lines.length &&
      (indentOf(lines[next]) > indent || isSequenceLine(lines[next], indent));
    return nested ? [key, ...parseBlock(next, indent)] : [key, null, index + 1];
  }
  if (/^[|>][-+]?(?:\s+#.*)?$/u.test(value)) {
    const header = value.replace(/\s+#.*$/u, "");
    return [key, ...parseBlockScalar(lines, index + 1, header, indent)];
  }
  const next = nextContent(lines, index + 1);
  if (next < lines.length && indentOf(lines[next]) > indent) {
    throw new YamlError(`multi-line value on line ${index + 1}`);
  }
  return [key, parseScalar(value), index + 1];
};

const parseMapping = (lines, start, indent, parseBlock) => {
  const object = {};
  let index = start;
  for (;;) {
    index = nextContent(lines, index);
    if (index >= lines.length || indentOf(lines[index]) < indent) {
      return [object, index];
    }
    if (indentOf(lines[index]) > indent) {
      throw new YamlError(`unexpected indentation on line ${index + 1}`);
    }
    if (/^-(?:\s|$)/u.test(lines[index].slice(indent))) {
      return [object, index];
    }
    const [key, value, next] = parseEntry(lines, index, indent, parseBlock);
    object[key] = value;
    index = next;
  }
};

const parseSequence = (lines, start, indent, parseBlock) => {
  const array = [];
  let index = start;
  for (;;) {
    index = nextContent(lines, index);
    if (index >= lines.length || !isSequenceLine(lines[index], indent)) {
      return [array, index];
    }
    const after = lines[index].slice(indent + 1);
    const rest = after.trimStart();
    let value;
    if (rest === "" || rest.startsWith("#")) {
      [value, index] = parseBlock(index + 1, indent + 1);
    } else if (KEY_LINE.test(rest) && !/^["'[{]/u.test(rest)) {
      // `- key: value` starts a mapping at the key's column.
      const itemIndent = indent + 1 + (after.length - rest.length);
      lines[index] = `${" ".repeat(itemIndent)}${rest}`;
      [value, index] = parseMapping(lines, index, itemIndent, parseBlock);
    } else {
      value = parseScalar(rest);
      index += 1;
    }
    array.push(value);
  }
};

const parseYaml = (text) => {
  if (/^\t|\n\t/u.test(text)) {
    throw new YamlError("tab indentation");
  }
  const lines = text.split("\n");
  const parseBlock = (start, minIndent) => {
    const index = nextContent(lines, start);
    if (index >= lines.length || indentOf(lines[index]) < minIndent) {
      return [null, index];
    }
    const indent = indentOf(lines[index]);
    return isSequenceLine(lines[index], indent)
      ? parseSequence(lines, index, indent, parseBlock)
      : parseMapping(lines, index, indent, parseBlock);
  };
  const [value, end] = parseBlock(0, 0);
  if (nextContent(lines, end) < lines.length) {
    throw new YamlError(`can't read line ${end + 1}`);
  }
  return value ?? {};
};

const plainSafe = (text) =>
  text !== "" &&
  !/^\s|\s$/u.test(text) &&
  !/^[-?:,[\]{}#&*!|>'"%@`]/u.test(text) &&
  !/:(?:\s|$)|\s#|[\n\r\t\\]/u.test(text) &&
  !/^(?:true|false|null|~|yes|no|on|off|y|n)$/iu.test(text) &&
  !/^[-+]?(?:\d|\.\d)/u.test(text);

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

const yamlKey = (key) =>
  /^[A-Za-z_][\w-]*$/u.test(key) ? key : JSON.stringify(key);

const yamlScalar = (value, key) => {
  if (value === null) {
    return "null";
  }
  if (value === true || value === false || Number.isFinite(value)) {
    return String(value);
  }
  const text = String(value);
  if ((key === "date" || key === "lastModified") && DATE_ONLY.test(text)) {
    return text;
  }
  return plainSafe(text) ? text : JSON.stringify(text);
};

const emitYaml = (value, indent = 0) => {
  const pad = " ".repeat(indent);
  const lines = [];
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) {
      continue;
    }
    if (Array.isArray(entry) && entry.length === 0) {
      lines.push(`${pad}${yamlKey(key)}: []`);
    } else if (Array.isArray(entry)) {
      lines.push(`${pad}${yamlKey(key)}:`);
      for (const item of entry) {
        if (isRecord(item)) {
          const [first, ...more] = emitYaml(item, indent + 4).split("\n");
          lines.push(`${pad}  - ${first.trimStart()}`, ...more);
        } else {
          lines.push(`${pad}  - ${yamlScalar(item)}`);
        }
      }
    } else if (isRecord(entry) && Object.keys(entry).length === 0) {
      lines.push(`${pad}${yamlKey(key)}: {}`);
    } else if (isRecord(entry)) {
      lines.push(`${pad}${yamlKey(key)}:`, emitYaml(entry, indent + 2));
    } else {
      lines.push(`${pad}${yamlKey(key)}: ${yamlScalar(entry, key)}`);
    }
  }
  return lines.join("\n");
};

// --- Report ---------------------------------------------------------------------

const newReport = () => ({ edits: new Map(), notes: [] });
const edit = (report, kind, count = 1) => {
  report.edits.set(kind, (report.edits.get(kind) ?? 0) + count);
};
const note = (report, message) => {
  if (!report.notes.includes(message)) {
    report.notes.push(message);
  }
};

// --- Config ---------------------------------------------------------------------

/** The lines of one top-level key's block, for a config the reader rejects. */
const topLevelBlock = (text, key) => {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (start === -1) {
    return null;
  }
  let end = start + 1;
  while (end < lines.length && !/^[^\s#]/u.test(lines[end])) {
    end += 1;
  }
  return lines.slice(start, end).join("\n");
};

const CONFIG_KEYS = [
  "baseurl",
  "callouts",
  "collections",
  "exclude",
  "includes_dir",
  "permalink",
  "url",
];

const readConfig = (root, notes) => {
  const file = path.join(root, "_config.yml");
  if (!existsSync(file)) {
    notes.push(
      "No _config.yml here: run the codemod from the Jekyll source directory."
    );
    return {};
  }
  const text = normalizeText(readFileSync(file, "utf-8"));
  try {
    return recordOf(parseYaml(text));
  } catch (error) {
    notes.push(
      `_config.yml: ${error.message}; only ${CONFIG_KEYS.join(", ")} were read, so {{ site.x }} stays for you.`
    );
  }
  const config = {};
  for (const key of CONFIG_KEYS) {
    const block = topLevelBlock(text, key);
    if (block) {
      try {
        Object.assign(config, recordOf(parseYaml(block)));
      } catch {
        notes.push(`_config.yml: couldn't read \`${key}\`.`);
      }
    }
  }
  config.unreadable = true;
  return config;
};

/** `name → { color, title }` from `callouts:`, or null when it's unset. */
const calloutConfig = (config) => {
  if (!isRecord(config.callouts)) {
    return null;
  }
  const out = new Map();
  for (const [name, value] of Object.entries(config.callouts)) {
    const entry = recordOf(value);
    out.set(name, { color: textOf(entry.color), title: textOf(entry.title) });
  }
  return out;
};

/** The directive (and title) a configured callout name becomes. */
const calloutDirective = (name, callouts) => {
  const entry = callouts.get(name);
  const type =
    CALLOUT_NAMES.get(name) ?? CALLOUT_COLORS.get(entry?.color) ?? "note";
  const title =
    entry?.title && entry.title.toLowerCase() !== type
      ? entry.title
      : undefined;
  return { title, type };
};

/** The URL suffix Jekyll gives a non-index page under a permalink style. */
const permalinkSuffix = (style) => {
  if (style === undefined || ["date", "none", "ordinal"].includes(style)) {
    return ".html";
  }
  if (style === "pretty" || style.endsWith("/")) {
    return "/";
  }
  return style.endsWith(":output_ext") ? ".html" : "";
};

// --- Paths and routes -------------------------------------------------------------

const ORDERING_PREFIX = /^(?<order>\d+)[-_.]/u;
const NOT_AN_ORDER = /^(?:\d+\.\d|\d{4}-\d{2}-\d{2}(?:[-_.]|$))/u;
const GROUP_FOLDER = /^\((?<label>.+)\)$/u;
const DOC_EXT = /\.(?:md|mdx|markdown)$/u;

const stripOrderingPrefix = (name) =>
  NOT_AN_ORDER.test(name) ? name : name.replace(ORDERING_PREFIX, "");

const groupLabelOf = (segment) =>
  segment.match(GROUP_FOLDER)?.groups?.label ??
  stripOrderingPrefix(segment).match(GROUP_FOLDER)?.groups?.label;

/** The label Blume gives a folder group without a `meta.ts` title. */
const humanize = (segment) =>
  stripOrderingPrefix(groupLabelOf(segment) ?? segment)
    .split(/[-_]/u)
    .filter(Boolean)
    .map(
      (word) =>
        WORD_FORMS.get(word) ?? word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");

const stripExt = (rel) => rel.replace(DOC_EXT, "");

/** The slug a `meta.ts` `pages` array names a child by. */
const entrySlug = (name) =>
  stripOrderingPrefix(groupLabelOf(name) ?? stripExt(name));

/** The route Blume serves a content file at (no `slug`). */
const blumeRoute = (rel) => {
  const segments = stripExt(rel)
    .split("/")
    .filter((segment) => !groupLabelOf(segment))
    .map(stripOrderingPrefix);
  if (segments.at(-1) === "index") {
    segments.pop();
  }
  return `/${segments.join("/")}`;
};

/** An old URL or path → the slashless route it names. */
const normalizeRoute = (url) => {
  const route = safeDecode(url.replace(/[?#].*$/u, ""))
    .replace(/\/index\.html?$/u, "/")
    .replace(/\.html?$/u, "")
    .replace(/\/+$/u, "");
  return route === "" ? "/" : route;
};

const encodePath = (value) => encodeURI(value).replaceAll("%25", "%");

const isWithin = (dir, rel) => dir === "" || rel.startsWith(`${dir}/`);

// --- Files ----------------------------------------------------------------------

const ALWAYS_SKIP = new Set([
  "_site",
  "dist",
  "node_modules",
  "public",
  "vendor",
]);

const globToRegExp = (glob) =>
  new RegExp(
    `^${glob
      .replaceAll(/[.+^${}()|[\]\\]/gu, "\\$&")
      .replaceAll("**", "<GLOBSTAR>")
      .replaceAll("*", "[^/]*")
      .replaceAll("<GLOBSTAR>", ".*")
      .replaceAll("?", "[^/]")}$`,
    "u"
  );

const excludedBy = (patterns) => {
  const tests = patterns.map((raw) => {
    const pattern = String(raw).replace(/^\.\//u, "").replace(/\/$/u, "");
    const regex = globToRegExp(pattern);
    return (rel) =>
      rel === pattern || rel.startsWith(`${pattern}/`) || regex.test(rel);
  });
  return (rel) => tests.some((test) => test(rel));
};

const walk = (root, dir, skip) => {
  const out = [];
  for (const name of readdirSync(path.join(root, dir)).toSorted()) {
    const rel = dir ? `${dir}/${name}` : name;
    if (skip(rel, name)) {
      continue;
    }
    if (statSync(path.join(root, rel)).isDirectory()) {
      out.push(...walk(root, rel, skip));
    } else {
      out.push(rel);
    }
  }
  return out;
};

const splitFrontmatter = (text) => {
  const match = /^---[ \t]*\n(?<raw>[\s\S]*?)\n?---[ \t]*(?:\n|$)/u.exec(text);
  return match
    ? { body: text.slice(match[0].length), raw: match.groups.raw }
    : { body: text, raw: null };
};

// --- Old build -----------------------------------------------------------------

/**
 * `text` without `pattern`'s matches, removed again until none is left;
 * `removed`, if given, runs once per match.
 */
const removeAll = (text, pattern, removed) => {
  let out = text;
  let previous;
  do {
    previous = out;
    out = out.replaceAll(pattern, () => {
      removed?.();
      return "";
    });
  } while (out !== previous);
  return out;
};

const decodeEntities = (text) =>
  text
    .replaceAll(
      /&#(?<num>\d+);/gu,
      byGroups(({ num }) => String.fromCodePoint(Number(num)))
    )
    .replaceAll(
      /&#x(?<hex>[0-9a-f]+);/giu,
      byGroups(({ hex }) => String.fromCodePoint(Number.parseInt(hex, 16)))
    )
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&");

/** The built HTML file that served `url`, if the old build has one. */
const oldFileFor = (oldDir, url) => {
  const decoded = safeDecode(url.replace(/[?#].*$/u, ""));
  const base = path.join(oldDir, decoded);
  const candidates = decoded.endsWith("/")
    ? [path.join(base, "index.html")]
    : [base, `${base}.html`, path.join(base, "index.html")];
  return candidates.find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile()
  );
};

/** The URL the old build served a route at: slashed, `.html`, or bare. */
const builtUrl = (oldDir, route) => {
  const forms = route === "/" ? ["/"] : [`${route}/`, `${route}.html`, route];
  return forms.find((form) => {
    const base = path.join(oldDir, safeDecode(form));
    const file = form.endsWith("/") ? path.join(base, "index.html") : base;
    return existsSync(file) && statSync(file).isFile();
  });
};

/** Just the Docs' sidebar, as the old build rendered it: { title, href, children }. */
const readOldNav = (oldDir) => {
  for (const name of ["index.html", "404.html"]) {
    const file = path.join(oldDir, name);
    const html = existsSync(file) ? readFileSync(file, "utf-8") : "";
    const start = html.search(/<nav[^>]*id="site-nav"/u);
    if (start !== -1) {
      const nav = html.slice(start, html.indexOf("</nav>", start));
      const root = { children: [] };
      const stack = [];
      let last = root;
      for (const token of nav.matchAll(
        /<ul[^>]*>|<\/ul>|<a href="(?<href>[^"]*)" class="nav-list-link"[^>]*>(?<label>[\s\S]*?)<\/a>/gu
      )) {
        if (token[0].startsWith("<ul")) {
          stack.push(last);
        } else if (token[0] === "</ul>") {
          stack.pop();
        } else {
          last = {
            children: [],
            href: decodeEntities(token.groups.href),
            title: decodeEntities(
              removeAll(token.groups.label, /<[^>]+>/gu)
            ).trim(),
          };
          (stack.at(-1) ?? root).children.push(last);
        }
      }
      return root.children;
    }
  }
  return null;
};

/** The first link of the child list Just the Docs put at the end of a parent page. */
const oldChildList = (html) => {
  const main =
    html.match(/<main[^>]*>(?<main>[\s\S]*?)<\/main>/u)?.groups?.main ?? html;
  const match =
    /<hr\s*\/?>\s*<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>\s*<ul>\s*<li>\s*<a href="(?<href>[^"]+)"/u.exec(
      main
    );
  return match ? decodeEntities(match.groups.href) : null;
};

// --- Text helpers -----------------------------------------------------------------

const isBlank = (line) => line === undefined || line.trim() === "";
const FENCE = /^\s*(?<fence>`{3,}|~{3,})/u;
const HEADING = /^ {0,3}#{1,6}(?:\s|$)/u;
const IAL_LINE = /^ {0,3}\{:(?![:\w-]+:)(?<spec>[^}]*)\}\s*$/u;
const ALD_LINE = /^ {0,3}\{:[\w-]+:[^}]*\}\s*$/u;
const TOC_IAL = /^\s*\{:\s*toc\s*\}\s*$/u;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/u;
const DIRECTIVE_LINE = /^\s*:{3,}/u;

/** Which lines are inside fenced code (fences included). */
const fenceMask = (lines) => {
  const mask = [];
  let open = null;
  for (const line of lines) {
    const fence = line.match(FENCE)?.groups?.fence;
    if (open) {
      mask.push(true);
      if (
        fence &&
        fence[0] === open[0] &&
        fence.length >= open.length &&
        line.trim() === fence
      ) {
        open = null;
      }
    } else if (fence) {
      open = fence;
      mask.push(true);
    } else {
      mask.push(false);
    }
  }
  return mask;
};

/** Apply `transform` to the runs of lines outside fenced code. */
const mapProse = (text, transform) => {
  const lines = text.split("\n");
  const mask = fenceMask(lines);
  const out = [];
  let run = [];
  let [runIsCode] = mask;
  for (const [index, line] of lines.entries()) {
    if (mask[index] !== runIsCode) {
      out.push(runIsCode ? run.join("\n") : transform(run.join("\n")));
      run = [];
      runIsCode = mask[index];
    }
    run.push(line);
  }
  out.push(runIsCode ? run.join("\n") : transform(run.join("\n")));
  return out.join("\n");
};

/** Apply `transform` to the parts of a line outside inline code spans. */
const mapOutsideCode = (line, transform) => {
  const parts = [];
  let last = 0;
  for (const span of line.matchAll(/(?<ticks>`+)[\s\S]*?\k<ticks>/gu)) {
    parts.push(transform(line.slice(last, span.index)), span[0]);
    last = span.index + span[0].length;
  }
  parts.push(transform(line.slice(last)));
  return parts.join("");
};

const SPAN_OPEN = String.fromCodePoint(0xe0_10);
const SPAN_CLOSE = String.fromCodePoint(0xe0_11);
const SPAN_TOKEN = new RegExp(`${SPAN_OPEN}(?<index>\\d+)${SPAN_CLOSE}`, "gu");

/** Run `transform` with the inline code spans in `prose` held out of its reach. */
const outsideCodeSpans = (prose, transform) => {
  const spans = [];
  const masked = prose
    .split("\n")
    .map((line) =>
      line.replaceAll(/(?<ticks>`+)[\s\S]*?\k<ticks>/gu, (span) => {
        spans.push(span);
        return `${SPAN_OPEN}${spans.length - 1}${SPAN_CLOSE}`;
      })
    )
    .join("\n");
  return transform(masked).replaceAll(
    SPAN_TOKEN,
    byGroups(({ index }) => spans[Number(index)])
  );
};

/** Unwrap `{% raw %}` blocks, protecting what's inside from every later pass. */
const protectRaw = (text, report) =>
  text.replaceAll(
    /(?:^[ \t]*\{%-?\s*raw\s*-?%\}[ \t]*\n|\{%-?\s*raw\s*-?%\})(?<inner>[\s\S]*?)(?:^[ \t]*\{%-?\s*endraw\s*-?%\}[ \t]*(?:\n|$)|\{%-?\s*endraw\s*-?%\})/gmu,
    byGroups(({ inner }) => {
      edit(report, "{% raw %} unwrapped");
      return [...inner].map((char) => RAW_CHARS.get(char) ?? char).join("");
    })
  );

const restoreRaw = (text) => {
  let out = text;
  for (const [char, placeholder] of RAW_CHARS) {
    out = out.replaceAll(placeholder, char);
  }
  return out;
};

/** A heading's Markdown as plain text, for a front matter `title`. */
const plainText = (markdown) =>
  decodeEntities(
    removeAll(markdown, /<[^>]+>/gu)
      .replaceAll(
        /!?\[(?<label>[^\]]*)\]\([^)]*\)/gu,
        byGroups(({ label }) => label)
      )
      .replaceAll(
        /`(?<code>[^`]*)`/gu,
        byGroups(({ code }) => code)
      )
      .replaceAll(
        /(?<mark>\*\*|__)(?<inner>\S(?:.*?\S)?)\k<mark>/gu,
        byGroups(({ inner }) => inner)
      )
      .replaceAll(
        /(?<before>^|[^\w*])\*(?<inner>\S(?:.*?\S)?)\*(?=[^\w*]|$)/gu,
        byGroups(({ before, inner }) => `${before}${inner}`)
      )
      .replaceAll(
        /(?<before>^|\W)_(?<inner>\S(?:.*?\S)?)_(?=\W|$)/gu,
        byGroups(({ before, inner }) => `${before}${inner}`)
      )
      .replaceAll(
        /\\(?<char>[\\`*_{}[\]()#+\-.!|])/gu,
        byGroups(({ char }) => char)
      )
  )
    .replaceAll(/\s+/gu, " ")
    .trim();

/** Escape a directive title for its `[…]` label. */
const labelText = (text) => text.replaceAll(/[[\]]/gu, (char) => `\\${char}`);

// --- Liquid -------------------------------------------------------------------------

const INCLUDE_TAG =
  /^(?<indent>[ \t]*)\{%-?\s*(?<tag>include|include_relative|include_cached)\s+(?<rest>.*?)\s*-?%\}[ \t]*$/u;
const INCLUDE_PARAM =
  /(?<key>[\w-]+)\s*=\s*(?:"(?<dq>[^"]*)"|'(?<sq>[^']*)'|(?<bare>[^\s"']+))/gu;

/** An include tag's file and parameters, or why it can't be converted. */
const parseInclude = (rest) => {
  const file = rest.match(/^\S+/u)?.[0] ?? "";
  if (file.includes("{{")) {
    return { problem: "its file name is a Liquid expression" };
  }
  const params = [];
  const leftover = rest.slice(file.length).replaceAll(
    INCLUDE_PARAM,
    byGroups(({ bare, dq, key, sq }) => {
      // A bare `true`, `false`, or number is a Liquid literal, not a variable.
      const literal = /^(?:true|false|-?\d+(?:\.\d+)?)$/u.test(bare ?? "");
      params.push({
        bare: literal ? undefined : bare,
        key,
        value: dq ?? sq ?? (literal ? bare : undefined),
      });
      return "";
    })
  );
  if (leftover.trim() !== "") {
    return {
      problem: `it has parameters the codemod can't read (${leftover.trim()})`,
    };
  }
  const variable = params.find(({ bare }) => bare !== undefined);
  if (variable) {
    return {
      problem: `${variable.key}=${variable.bare} passes a variable: pass its value as quoted text`,
    };
  }
  const upper = params.find(({ key }) => key !== key.toLowerCase());
  if (upper) {
    return {
      problem: `parameter ${upper.key} isn't lowercase, which <include> props need`,
    };
  }
  return { file: file.replace(/^\/+/u, ""), params };
};

const attrValue = (value) =>
  value.includes('"') ? `'${value}'` : `"${value}"`;

const convertHighlight = (text, report) =>
  text.replaceAll(
    /^(?<indent>[ \t]*)\{%-?\s*highlight\s+(?<lang>[^\s%]+)(?<opts>[^%]*?)-?%\}[ \t]*\n?(?<code>[\s\S]*?)\n?[ \t]*\{%-?\s*endhighlight\s*-?%\}/gmu,
    byGroups(({ code, indent, lang, opts }) => {
      edit(report, "{% highlight %} → fence");
      const meta = [];
      const marks = opts.match(/mark_lines="(?<lines>[^"]*)"/u)?.groups?.lines;
      if (marks) {
        meta.push(`{${marks.trim().split(/\s+/u).join(",")}}`);
      }
      if (/\blinenos\b/u.test(opts)) {
        meta.push("lineNumbers");
      }
      const info = meta.length > 0 ? ` ${meta.join(" ")}` : "";
      return `${indent}\`\`\`${lang}${info}\n${code}\n${indent}\`\`\``;
    })
  );

/** `{{ site.x }}` → `{{x}}` where `_config.yml` holds a plain value. */
const convertSiteVariables = (text, file, ctx) =>
  text.replaceAll(
    /\{\{-?\s*site\.(?<key>[\w-]+)\s*-?\}\}/gu,
    byGroups(({ key }, whole) => {
      const value = textOf(ctx.config[key]);
      if (value === undefined || ctx.config.unreadable) {
        note(
          file.report,
          `${whole} isn't a plain value in _config.yml: inline it`
        );
        return whole;
      }
      ctx.variables.set(key, value);
      file.siteKeys.add(key);
      edit(file.report, "{{ site.x }} → {{x}} variable");
      return `{{${key}}}`;
    })
  );

/** `{{ site.baseurl }}`, `relative_url`, `absolute_url`, `{% link %}`. */
const convertUrls = (text, file, ctx) => {
  const { report } = file;
  return text
    .replaceAll(
      /\{\{-?\s*site\.url\s*-?\}\}\s*\{\{-?\s*site\.baseurl\s*-?\}\}|\{\{-?\s*site\.baseurl\s*-?\}\}/gu,
      () => {
        edit(report, "{{ site.baseurl }} removed");
        return "";
      }
    )
    .replaceAll(
      /(?<lead>\]\(|\b(?:href|src)=["'])\{\{-?\s*site\.url\s*-?\}\}(?=\/)/gu,
      byGroups(({ lead }) => {
        edit(report, "{{ site.url }} link → root-relative");
        return lead;
      })
    )
    .replaceAll(
      /\{\{-?\s*(?:"(?<dq>[^"]*)"|'(?<sq>[^']*)')\s*\|\s*(?:relative_url|absolute_url)\s*-?\}\}/gu,
      byGroups(({ dq, sq }) => {
        edit(report, "relative_url/absolute_url → root path");
        const value = dq ?? sq;
        return value.startsWith("/") ? value : `/${value}`;
      })
    )
    .replaceAll(
      /\{%-?\s*link\s+(?<target>[^%\s]+)\s*-?%\}/gu,
      byGroups(({ target }, whole) => {
        const rel = target.replace(/^\/+/u, "");
        const page = ctx.pagesBySource.get(rel);
        if (page) {
          edit(report, "{% link %} → route");
          return page.oldRoute;
        }
        if (existsSync(path.join(ctx.root, rel))) {
          edit(report, "{% link %} → file path");
          return `/${encodePath(rel)}`;
        }
        note(report, `${whole} names no page or file: fix it by hand`);
        return whole;
      })
    );
};

const removeComments = (text, report) =>
  text
    .replaceAll(
      /^[ \t]*\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}[ \t]*\n?/gmu,
      () => {
        edit(report, "{% comment %} removed");
        return "";
      }
    )
    .replaceAll(
      /\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/gu,
      () => {
        edit(report, "{% comment %} removed");
        return "";
      }
    );

const INCLUDE_VAR = /\{\{-?\s*include\.(?<key>[\w-]+)\s*-?\}\}/gu;

/** The `{{ include.x }}` parameters a partial reads, outside `{% raw %}`. */
const propsRead = (partial) => {
  partial.reads ??= new Set(
    [...protectRaw(partial.body, newReport()).matchAll(INCLUDE_VAR)].map(
      (match) => match.groups.key
    )
  );
  return partial.reads;
};

/** Include tags, one per line, outside fenced code → `<include>`. */
const convertIncludes = (text, file, ctx) => {
  const { report } = file;
  const lines = text.split("\n");
  const mask = fenceMask(lines);
  const kept = [];
  for (const [index, line] of lines.entries()) {
    const match = mask[index] ? null : line.match(INCLUDE_TAG);
    if (!match) {
      kept.push(line);
      continue;
    }
    const { indent, rest, tag } = match.groups;
    const parsed = parseInclude(rest);
    if (parsed.problem) {
      file.includeProblems.set(line.trim(), `left, because ${parsed.problem}`);
      kept.push(line);
      continue;
    }
    const target =
      tag === "include_relative"
        ? path.posix.normalize(path.posix.join(parentOf(file.rel), parsed.file))
        : `${ctx.includesDir}/${parsed.file}`;
    const partial = ctx.partials.get(target) ?? ctx.pagesBySource.get(target);
    if (!partial) {
      const reason = existsSync(path.join(ctx.root, target))
        ? `${target} isn't Markdown (an HTML partial is embedded as code, not spliced)`
        : `${target} isn't in this site (a theme include?)`;
      file.includeProblems.set(
        line.trim(),
        `left, because ${reason}: convert each use by hand`
      );
      kept.push(line);
      continue;
    }
    partial.includers?.add(file);
    file.includes.add(partial);
    if (partial.tocOnly) {
      edit(report, "include of a TOC-only partial removed");
      continue;
    }
    // A parameter the partial reads but this tag doesn't pass printed
    // nothing in Jekyll; unpassed, Blume would print `{{x}}` or a variable.
    const passed = new Set(parsed.params.map(({ key }) => key));
    const unpassed = [...propsRead(partial)].filter(
      (key) => !passed.has(key) && key === key.toLowerCase()
    );
    if (unpassed.length > 0) {
      edit(report, 'parameter the include left out → key=""');
    }
    const attrs = [
      ...parsed.params,
      ...unpassed.map((key) => ({ key, value: "" })),
    ]
      .map(({ key, value }) => ` ${key}=${attrValue(value)}`)
      .join("");
    // Root-relative, so a page the navigation moves still finds it.
    kept.push(`${indent}<include${attrs}>/${target}</include>`);
    edit(report, `{% ${tag} %} → <include>`);
  }
  return kept.join("\n");
};

/** Liquid that maps one-to-one, outside `{% raw %}`. */
const convertLiquid = (text, file, ctx) => {
  let out = convertHighlight(text, file.report);
  out = removeComments(out, file.report);
  out = convertUrls(out, file, ctx);
  out = convertSiteVariables(out, file, ctx);
  if (file.partial) {
    out = out.replaceAll(
      INCLUDE_VAR,
      byGroups(({ key }) => {
        edit(file.report, "{{ include.x }} → {{x}} prop");
        file.props.add(key);
        return `{{${key}}}`;
      })
    );
  }
  return convertIncludes(out, file, ctx);
};

// --- Kramdown -------------------------------------------------------------------------

const parseSpec = (spec) => {
  const out = { attrs: [], classes: [], id: undefined, words: [] };
  for (const token of spec.matchAll(
    /(?<cls>\.[\w-]+)|(?<id>#[\w-]+)|(?<attr>[\w-]+=(?:"[^"]*"|'[^']*'|\S+))|(?<word>\S+)/gu
  )) {
    const { attr, cls, id, word } = token.groups;
    if (cls) {
      out.classes.push(cls.slice(1));
    } else if (id) {
      out.id = id.slice(1);
    } else if (attr) {
      out.attrs.push(attr);
    } else {
      out.words.push(word);
    }
  }
  return out;
};

const blockKind = (lines) => {
  const [first] = lines;
  if (HEADING.test(first)) {
    return "heading";
  }
  if (/^ {0,3}>/u.test(first)) {
    return "blockquote";
  }
  if (LIST_ITEM.test(first)) {
    return "list";
  }
  if (/^ {0,3}\|/u.test(first)) {
    return "table";
  }
  if (/^ {0,3}</u.test(first)) {
    return "html";
  }
  return "paragraph";
};

/** The longest directive fence in `lines`, to nest a callout around them. */
const maxFence = (lines) =>
  Math.max(
    0,
    ...lines.map(
      (line) => line.match(/^\s*(?<colons>:{3,})/u)?.groups?.colons.length ?? 0
    )
  );

/** A heading line with markers appended (`[!toc]`, `[#id]`). */
const markHeading = (line, markers) => {
  const trimmed = line.replace(/\s+$/u, "");
  const extra = markers.filter((marker) => !trimmed.includes(marker));
  return extra.length > 0 ? `${trimmed} ${extra.join(" ")}` : trimmed;
};

const leadingSpace = (line) => line.match(/^\s*/u)[0];

/** A configured callout around a paragraph or blockquote → a directive. */
const calloutBlock = (block, callout, nest, context) => {
  const { classes, ctx, report } = context;
  const name = callout.replace(/-title$/u, "");
  const directive = calloutDirective(name, ctx.callouts);
  const indent = leadingSpace(block.lines[0]);
  let body = block.lines;
  if (block.kind === "blockquote") {
    body = nest(
      block.lines.map((line) =>
        line.replace(
          /^(?<lead>\s*)> ?/u,
          byGroups(({ lead }) => lead)
        )
      )
    );
  }
  let { title } = directive;
  if (callout.endsWith("-title") && block.kind === "blockquote") {
    const split = body.findIndex((line) => isBlank(line));
    const heading = split === -1 ? body : body.slice(0, split);
    title = heading.map((line) => line.trim()).join(" ");
    body = split === -1 ? [] : body.slice(split + 1);
    while (body.length > 0 && isBlank(body[0])) {
      body = body.slice(1);
    }
  }
  const colons = ":".repeat(Math.max(3, maxFence(body) + 1));
  const label = title ? `[${labelText(title)}]` : "";
  edit(report, `{: .${name} } → :::${directive.type}`);
  const others = classes.filter(
    (cls) => cls !== callout && !UTILITY_CLASS.test(cls)
  );
  if (others.length > 0) {
    note(report, `classes beside .${callout} dropped: .${others.join(" .")}`);
  }
  return [
    `${indent}${colons}${directive.type}${label}`,
    ...body,
    `${indent}${colons}`,
  ];
};

/** A heading's IAL → `[!toc]` and `[#id]` markers. */
const headingBlock = (block, context) => {
  const { classes, id, report } = context;
  const markers = [];
  if (classes.includes("no_toc")) {
    markers.push("[!toc]");
    edit(report, ".no_toc heading → [!toc]");
  }
  if (id) {
    markers.push(`[#${id}]`);
    edit(report, "heading IAL id → [#id]");
  }
  const other = classes.filter(
    (cls) => cls !== "no_toc" && !UTILITY_CLASS.test(cls)
  );
  if (other.length > 0) {
    note(report, `heading classes .${other.join(" .")} dropped`);
  }
  return [markHeading(block.lines[0], markers), ...block.lines.slice(1)];
};

/** A paragraph `.label` → `<Badge>`. */
const labelBlock = (block, context) => {
  const { classes, report } = context;
  const picked =
    classes
      .filter((cls) => cls.startsWith("label-"))
      .map((cls) => cls.slice("label-".length))
      .find((color) => LABEL_COLORS.has(color)) ?? "blue";
  if (block.lines.length > 1) {
    note(
      report,
      "a .label on a multi-line paragraph was dropped: make it a <Badge> by hand"
    );
    return block.lines;
  }
  edit(report, ".label → <Badge>");
  const [line] = block.lines;
  return [
    `${leadingSpace(line)}<Badge color="${picked}">${line.trim()}</Badge>`,
  ];
};

/** Classes that only styled the block: drop them, report the unknown ones. */
const dropClasses = (block, context) => {
  const { classes, id, report } = context;
  if (classes.some((cls) => cls === "btn" || cls.startsWith("btn-"))) {
    edit(report, ".btn IAL dropped (plain link)");
  }
  if (id) {
    edit(report, "block IAL id dropped");
    note(
      report,
      `id #${id} on a ${block.kind} dropped: link to a heading instead`
    );
  }
  const unknown = classes.filter(
    (cls) =>
      !UTILITY_CLASS.test(cls) &&
      cls !== "btn" &&
      !cls.startsWith("btn-") &&
      !cls.startsWith("label")
  );
  if (unknown.length === 0) {
    edit(report, "utility class IAL dropped");
    return block.lines;
  }
  edit(report, "unconfigured class IAL dropped (it rendered a plain block)");
  const where = `isn't a callout under callouts: in _config.yml, so it rendered a plain ${block.kind} (check _sass for a rule that styled it)`;
  note(report, `.${unknown.join(" .")} ${where}`);
  return block.lines;
};

/** Apply one IAL group to its block; returns the block's new lines. */
const applyIal = (block, specs, nest, ctx, report) => {
  const context = {
    classes: specs.flatMap((spec) => spec.classes),
    ctx,
    id: specs.map((spec) => spec.id).findLast(Boolean),
    report,
  };
  const words = specs.flatMap((spec) => spec.words);
  const attrs = specs.flatMap((spec) => spec.attrs);
  if (words.length > 0 && context.classes.length === 0 && !context.id) {
    edit(report, "malformed IAL dropped (Kramdown applied nothing)");
    note(
      report,
      `{: ${words.join(" ")} } is malformed or names an undefined ALD: Kramdown applied nothing, so it was dropped`
    );
    return block.lines;
  }
  if (attrs.length > 0) {
    edit(report, "IAL attribute dropped");
    note(report, `IAL attributes ${attrs.join(" ")} dropped`);
  }
  if (block.kind === "heading") {
    return headingBlock(block, context);
  }
  const callout = ctx.callouts
    ? context.classes.find((cls) =>
        ctx.callouts.has(cls.replace(/-title$/u, ""))
      )
    : undefined;
  if (callout && ["blockquote", "paragraph"].includes(block.kind)) {
    return calloutBlock(block, callout, nest, context);
  }
  if (callout && block.inItem) {
    edit(report, "callout IAL inside a list item dropped");
    note(
      report,
      `.${callout} sat inside a list item: where the old page shows <p class="${callout}"> in that item, Just the Docs boxed it, so write the callout inside the item by hand`
    );
    return block.lines;
  }
  if (callout) {
    edit(report, "callout IAL on a non-paragraph dropped");
    note(
      report,
      `.${callout} sat on a ${block.kind}: Just the Docs styles only paragraphs and blockquotes as callouts, so it rendered without a box; dropped`
    );
    return block.lines;
  }
  if (
    block.kind === "paragraph" &&
    context.classes.some((cls) => cls === "label" || cls.startsWith("label-"))
  ) {
    return labelBlock(block, context);
  }
  return dropClasses(block, context);
};

// A list or blockquote line ends a paragraph in Kramdown without a blank line.
const INTERRUPTS_PARAGRAPH = /^ {0,3}(?:(?:[-*+]|\d+[.)])\s|>)/u;

/** The end of the block a prefix IAL applies to, starting at `start`. */
const blockEnd = (lines, mask, start) => {
  if (mask[start]) {
    let end = start;
    while (end + 1 < lines.length && mask[end + 1]) {
      end += 1;
      if (FENCE.test(lines[end])) {
        break;
      }
    }
    return end;
  }
  if (HEADING.test(lines[start])) {
    return start;
  }
  // A paragraph ends at a list or blockquote line; those run to a blank.
  const stop = INTERRUPTS_PARAGRAPH.test(lines[start])
    ? () => false
    : (line) => INTERRUPTS_PARAGRAPH.test(line);
  let end = start;
  while (
    end + 1 < lines.length &&
    !isBlank(lines[end + 1]) &&
    !mask[end + 1] &&
    !IAL_LINE.test(lines[end + 1]) &&
    !HEADING.test(lines[end + 1]) &&
    !stop(lines[end + 1])
  ) {
    end += 1;
  }
  return end;
};

/** Where the block that ends at the tail of `out` starts (for a postfix IAL). */
const blockStart = (out, outMask) => {
  let start = out.length - 1;
  if (outMask[start]) {
    while (start > 0 && outMask[start - 1] && !FENCE.test(out[start])) {
      start -= 1;
    }
    return start;
  }
  if (HEADING.test(out[start])) {
    return start;
  }
  while (
    start > 0 &&
    !isBlank(out[start - 1]) &&
    !outMask[start - 1] &&
    !HEADING.test(out[start - 1]) &&
    !DIRECTIVE_LINE.test(out[start - 1])
  ) {
    start -= 1;
  }
  // A paragraph followed by a list or blockquote: the IAL is on the last one.
  if (!INTERRUPTS_PARAGRAPH.test(out[start])) {
    const interrupt = out.findIndex(
      (line, at) => at > start && INTERRUPTS_PARAGRAPH.test(line)
    );
    return interrupt === -1 ? start : interrupt;
  }
  return start;
};

const readSpecs = (lines, mask, from) => {
  const specs = [];
  let end = from;
  while (end < lines.length && !mask[end] && IAL_LINE.test(lines[end])) {
    specs.push(parseSpec(lines[end].match(IAL_LINE).groups.spec));
    end += 1;
  }
  return { end, specs };
};

/** Kramdown block IALs and ALDs, outside fenced code. */
/** Classes that may be callouts on a site whose `_config.yml` names none. */
const undeclaredCallout = (specs, ctx) =>
  !ctx.callouts &&
  specs.some((spec) =>
    spec.classes.some(
      (cls) =>
        !UTILITY_CLASS.test(cls) &&
        cls !== "btn" &&
        !cls.startsWith("btn-") &&
        !cls.startsWith("label")
    )
  );

const convertBlocks = (input, ctx, report) => {
  const lines = [...input];
  const mask = fenceMask(lines);
  const nest = (inner) => convertBlocks(inner, ctx, report);
  const out = [];
  const outMask = [];
  const push = (line, code) => {
    out.push(line);
    outMask.push(code);
  };
  const pushBlock = (result, code, next) => {
    if (
      DIRECTIVE_LINE.test(result[0]) &&
      out.length > 0 &&
      !isBlank(out.at(-1))
    ) {
      push("", false);
    }
    for (const line of result) {
      push(line, code);
    }
    if (DIRECTIVE_LINE.test(result.at(-1)) && !isBlank(next)) {
      push("", false);
    }
  };
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (mask[index] || (!IAL_LINE.test(line) && !ALD_LINE.test(line))) {
      push(line, mask[index]);
      index += 1;
      continue;
    }
    if (ALD_LINE.test(line)) {
      edit(report, "Kramdown ALD removed");
      index += 1;
      continue;
    }
    const { end, specs } = readSpecs(lines, mask, index);
    if (undeclaredCallout(specs, ctx)) {
      // No `callouts:` to say what these classes were: leave them for review.
      for (const kept of lines.slice(index, end)) {
        push(kept, false);
      }
      index = end;
    } else if (out.length > 0 && !isBlank(out.at(-1))) {
      // Postfix: the IAL applies to the block right above it.
      const start = blockStart(out, outMask);
      const code = outMask[start];
      const blockLines = out.splice(start);
      outMask.splice(start);
      const kind = code ? "code" : blockKind(blockLines);
      // Indented under a list item, the IAL sits inside that item.
      const inItem = kind === "list" && /^\s/u.test(line);
      const result = applyIal(
        { inItem, kind, lines: blockLines },
        specs,
        nest,
        ctx,
        report
      );
      pushBlock(result, code, lines[end]);
      index = end;
    } else {
      // Prefix: the next block, past any blank lines (Kramdown applies an IAL
      // that stands alone to the block after it), plus any IAL right after it.
      let first = end;
      while (first < lines.length && isBlank(lines[first])) {
        first += 1;
      }
      if (
        first >= lines.length ||
        IAL_LINE.test(lines[first]) ||
        ALD_LINE.test(lines[first])
      ) {
        edit(report, "orphan IAL dropped (Kramdown ignored it)");
        index = end;
        continue;
      }
      for (const blank of lines.slice(end, first)) {
        push(blank, false);
      }
      const last = blockEnd(lines, mask, first);
      const after = readSpecs(lines, mask, last + 1);
      const code = mask[first];
      const blockLines = lines.slice(first, last + 1);
      const kind = code ? "code" : blockKind(blockLines);
      const result = applyIal(
        { kind, lines: blockLines },
        [...specs, ...after.specs],
        nest,
        ctx,
        report
      );
      pushBlock(result, code, lines[after.end]);
      index = after.end;
    }
  }
  return out;
};

/** Kramdown's in-page TOC: the list, its `<details>` wrapper, its heading. */
const removeToc = (text, report) => {
  const lines = text.split("\n");
  const mask = fenceMask(lines);
  const drop = new Set();
  for (const [index, line] of lines.entries()) {
    if (mask[index] || drop.has(index)) {
      continue;
    }
    if (/^\s*<details\b/iu.test(line)) {
      const close = lines.findIndex(
        (other, at) => at >= index && /<\/details>/iu.test(other)
      );
      const inside = close === -1 ? [] : lines.slice(index, close);
      if (inside.some((other) => TOC_IAL.test(other))) {
        for (let at = index; at <= close; at += 1) {
          drop.add(at);
        }
        edit(report, "TOC <details> block removed");
      }
    } else if (
      /^\s*(?:[-*+]|\d+\.)\s+TOC\s*$/u.test(line) &&
      TOC_IAL.test(lines[index + 1] ?? "")
    ) {
      drop.add(index);
      drop.add(index + 1);
      edit(report, "TOC list removed");
      // Its "Table of contents" heading, marked .no_toc. An H1 there is the
      // page's own heading (kramdown's `# Title {: .no_toc } * TOC {:toc}`
      // pattern), which becomes the title, so it stays.
      let back = index - 1;
      while (back >= 0 && isBlank(lines[back])) {
        back -= 1;
      }
      if (
        back > 0 &&
        /\.no_toc/u.test(lines[back]) &&
        IAL_LINE.test(lines[back]) &&
        HEADING.test(lines[back - 1]) &&
        !/^ {0,3}#(?:\s|$)/u.test(lines[back - 1])
      ) {
        drop.add(back);
        drop.add(back - 1);
      }
    }
  }
  const kept = lines.filter((_, index) => !drop.has(index));
  const keptMask = fenceMask(kept);
  return kept
    .filter((line, index) => {
      if (!keptMask[index] && TOC_IAL.test(line)) {
        edit(report, "stray {:toc} removed");
        return false;
      }
      return true;
    })
    .join("\n");
};

/** Kramdown extensions: `{::comment}`, `{::options}`, `{::nomarkdown}`. */
const removeExtensions = (text, report) =>
  mapProse(text, (whole) =>
    outsideCodeSpans(whole, (prose) =>
      prose
        .replaceAll(/\{::comment\}[\s\S]*?\{:\/(?:comment)?\}\n?/gu, () => {
          edit(report, "{::comment} removed");
          return "";
        })
        .replaceAll(/\{::options[^}]*\/\}\n?/gu, () => {
          edit(report, "{::options} removed");
          return "";
        })
        .replaceAll(
          /\{::nomarkdown\}(?<inner>[\s\S]*?)\{:\/(?:nomarkdown)?\}/gu,
          byGroups(({ inner }) => {
            edit(report, "{::nomarkdown} unwrapped");
            return inner;
          })
        )
    )
  );

/** Which lines sit inside an HTML comment or a `<pre>`, where no heading renders. */
const htmlRawMask = (lines) => {
  const mask = [];
  let open = null;
  for (const line of lines) {
    let inside = open !== null;
    if (open === null && /<!--(?![\s\S]*-->)/u.test(line)) {
      open = "-->";
      inside = true;
    } else if (open === null && /^\s*<pre\b(?![\s\S]*<\/pre>)/iu.test(line)) {
      open = "</pre>";
      inside = true;
    } else if (open !== null && line.toLowerCase().includes(open)) {
      open = null;
    }
    mask.push(inside);
  }
  return mask;
};

/** The first H1 outside fences, comments, and `<pre>` (and its IALs) → `title`. */
const takeH1 = (text) => {
  const lines = text.split("\n");
  const mask = fenceMask(lines);
  const raw = htmlRawMask(lines);
  const index = lines.findIndex(
    (line, at) => !(mask[at] || raw[at]) && /^#(?:\s|$)/u.test(line)
  );
  if (index === -1) {
    return { text, title: undefined };
  }
  const heading = lines[index]
    .replace(/^#\s*/u, "")
    .replace(/\s+#+\s*$/u, "")
    .replace(/\s*\{#[\w-]+\}\s*$/u, "")
    .replace(/\s*\[(?:!toc|toc|#[\w-]+)\]\s*$/u, "");
  let end = index + 1;
  while (end < lines.length && IAL_LINE.test(lines[end])) {
    end += 1;
  }
  return {
    text: [...lines.slice(0, index), ...lines.slice(end)].join("\n"),
    title: plainText(heading),
  };
};

/** Span IALs: `[x](url){: .btn }`, `<span>New</span>{: .label .label-green }`. */
const convertSpanIals = (text, report) =>
  mapProse(text, (prose) =>
    prose
      .split("\n")
      .map((line) =>
        mapOutsideCode(line, (part) =>
          part
            .replaceAll(
              /<span>(?<inner>[^<]*)<\/span>\{:\s*(?<spec>[^}]*)\}/gu,
              byGroups(({ inner, spec }) => {
                const { classes } = parseSpec(spec);
                if (classes.some((cls) => cls.startsWith("label"))) {
                  const color =
                    classes
                      .map((cls) => cls.slice("label-".length))
                      .find((value) => LABEL_COLORS.has(value)) ?? "blue";
                  edit(report, ".label span → <Badge>");
                  return `<Badge color="${color}">${inner}</Badge>`;
                }
                edit(report, "span IAL dropped");
                return `<span>${inner}</span>`;
              })
            )
            // Kramdown reads a span IAL only after a span element (a link,
            // emphasis, code, or HTML); after plain text it printed it.
            .replaceAll(
              /(?<=[)*_`\]>])\{:\s*(?<spec>[^}]*)\}/gu,
              byGroups(({ spec }) => {
                edit(report, "span IAL dropped");
                const { attrs, id } = parseSpec(spec);
                if (attrs.length > 0 || id) {
                  note(
                    report,
                    `span IAL {: ${spec.trim()} } dropped: it sized or named the element, so check the old page`
                  );
                }
                return "";
              })
            )
        )
      )
      .join("\n")
  );

/** Heading `{#id}` → `[#id]`, which pins the anchor in `.md` and `.mdx` alike. */
const convertHeadingIds = (text, report) =>
  mapProse(text, (prose) =>
    prose.replaceAll(
      /^(?<heading> {0,3}#{1,6}\s.*?)\s*\{#(?<id>[\w-]+)\}[ \t]*$/gmu,
      byGroups(({ heading, id }) => {
        edit(report, "heading {#id} → [#id]");
        return `${heading} [#${id}]`;
      })
    )
  );

const MARKDOWN_ATTR = /\s+markdown=(?<q>["']?)(?:1|block|span|0)\k<q>/giu;

/** The line closing the element opened on `start`, if it closes alone. */
const closingLine = (lines, start, tag) => {
  let depth = 0;
  for (let at = start; at < lines.length; at += 1) {
    depth += (lines[at].match(new RegExp(`<${tag}\\b`, "giu")) ?? []).length;
    depth -= (lines[at].match(new RegExp(`</${tag}\\s*>`, "giu")) ?? []).length;
    if (depth <= 0) {
      return at > start &&
        new RegExp(`^\\s*</${tag}\\s*>\\s*$`, "iu").test(lines[at])
        ? at
        : -1;
    }
  }
  return -1;
};

/** `markdown="1"` attributes go; the element gets blank lines so `.md` parses inside. */
const convertMarkdownAttr = (text, report) => {
  const lines = text.split("\n");
  const mask = fenceMask(lines);
  const out = [];
  const closers = new Set();
  for (const [index, line] of lines.entries()) {
    if (mask[index]) {
      out.push(line);
      continue;
    }
    if (closers.has(index) && !isBlank(out.at(-1))) {
      out.push("");
    }
    const opener =
      /^\s*<(?<tag>[a-z][\w-]*)\b[^>]*\smarkdown=["']?(?:1|block|span|0)["']?[^>]*>\s*$/iu.exec(
        line
      );
    out.push(
      mapOutsideCode(line, (part) =>
        part.replaceAll(MARKDOWN_ATTR, () => {
          edit(report, 'markdown="1" attribute removed');
          return "";
        })
      )
    );
    if (opener) {
      if (!isBlank(lines[index + 1])) {
        out.push("");
      }
      const close = closingLine(lines, index, opener.groups.tag);
      if (close !== -1) {
        closers.add(close);
      }
    }
  }
  return out.join("\n");
};

// --- Links ----------------------------------------------------------------------------

const SKIP_HREF = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\{\{|\{%|<)/iu;

/** A link to the site's own origin → a root path; anything else unchanged. */
const stripOrigin = (value, ctx, report) => {
  if (!(ctx.origin && value.startsWith(ctx.origin))) {
    return value;
  }
  const rest = value.slice(ctx.origin.length);
  if (rest !== "" && !/^[/?#]/u.test(rest)) {
    return value;
  }
  edit(report, "own-origin link → root-relative");
  return rest === "" ? "/" : rest;
};

/** A file link (`page.md`) → its page, relative to the linking file. */
const fileLinkPage = (pathPart, link, ctx) =>
  ctx.pagesBySource.get(
    path.posix.normalize(
      path.posix.join(parentOf(link.sourceRel), safeDecode(pathPart))
    )
  );

/** The site path a link reached on the old site, or null if unknown. */
const oldPath = (pathPart, link, ctx) => {
  if (!pathPart.startsWith("/")) {
    return link.baseUrl
      ? new URL(pathPart, `https://jekyll.invalid${link.baseUrl}`).pathname
      : null;
  }
  const { baseurl } = ctx;
  if (baseurl && (pathPart === baseurl || pathPart.startsWith(`${baseurl}/`))) {
    return pathPart.slice(baseurl.length) || "/";
  }
  return pathPart;
};

/** A relative link to a file the site serves: images rebase, others go root. */
const assetHref = (asset, parts, link, report) => {
  const { href, pathPart, suffix } = parts;
  if (link.image) {
    const relative = path.posix.relative(parentOf(link.finalRel), asset);
    const out = encodePath(
      relative.startsWith(".") ? relative : `./${relative}`
    );
    if (out === pathPart) {
      return href;
    }
    edit(report, "relative image rebased");
    return `${out}${suffix}`;
  }
  edit(report, "relative file link → root path");
  note(report, `${href} → /${asset}: serve that file from public/${asset}`);
  return `/${encodePath(asset)}${suffix}`;
};

const isFile = (file) => existsSync(file) && statSync(file).isFile();

/** Rewrite one link target, or return it unchanged. */
/** A link target's path, and its `?query#fragment`. */
const splitHref = (value) => {
  const cut = value.search(/[?#]/u);
  return cut === -1
    ? { pathPart: value, suffix: "" }
    : { pathPart: value.slice(0, cut), suffix: value.slice(cut) };
};

/** A `.md` file link → its page's route. */
const mdLinkHref = (href, parts, link, ctx, report) => {
  const page = fileLinkPage(parts.pathPart, link, ctx);
  if (!page) {
    note(report, `link ${href} names no page`);
    return href;
  }
  edit(report, ".md link → route");
  return `${page.oldRoute}${parts.suffix}`;
};

/** Rewrite one link target, or return it unchanged. */
const rewriteHref = (href, link, file, ctx) => {
  const { report } = file;
  const inner = /^<(?<inner>.*)>$/u.exec(href)?.groups?.inner ?? href;
  const value = stripOrigin(inner, ctx, report);
  // Unchanged so far: hand back the target exactly as written.
  const kept = value === inner ? href : value;
  const parts = splitHref(value);
  const { pathPart, suffix } = parts;
  if (SKIP_HREF.test(value) || hasRawPlaceholder(value) || pathPart === "") {
    return kept;
  }
  const relative = !pathPart.startsWith("/");
  if (relative && /\.(?:md|markdown)$/iu.test(pathPart)) {
    return mdLinkHref(href, parts, link, ctx, report);
  }
  const absolute = oldPath(pathPart, link, ctx);
  if (absolute === null) {
    note(
      report,
      `relative link ${href} in a partial more than one page includes: make it root-relative by hand`
    );
    return href;
  }
  const route = normalizeRoute(absolute);
  if (ctx.pagesByRoute.has(route) || ctx.redirectFroms.has(route)) {
    const out = `${route}${suffix}`;
    if (out !== value) {
      edit(report, relative ? "relative link → route" : "link → route");
    }
    return out;
  }
  const asset = safeDecode(absolute).replace(/^\/+/u, "");
  if (asset !== "" && isFile(path.join(ctx.root, asset))) {
    return relative ? assetHref(asset, { href, ...parts }, link, report) : kept;
  }
  if (relative) {
    note(
      report,
      `relative link ${href} reached ${absolute} on the old site, which is no page or file here`
    );
  }
  return kept;
};

const INLINE_LINK =
  /(?<bang>!?)\[(?<label>(?:[^\][]|\[[^\]]*\])*)\]\((?<href><[^>]*>|[^\s)]+)(?<title>\s+(?:"[^"]*"|'[^']*'))?\)/gu;
const REF_DEFINITION = /^(?<lead>\s{0,3}\[[^\]]+\]:\s*)(?<href><[^>]*>|\S+)/gu;
const HTML_URL_ATTR =
  /(?<attr>\b(?:href|src))=(?<quote>["'])(?<value>[^"']*)\k<quote>/gu;

const convertLinks = (text, link, file, ctx) => {
  const rewrite = (href, image) =>
    rewriteHref(href, { ...link, image }, file, ctx);
  return mapProse(text, (prose) =>
    prose
      .split("\n")
      .map((line) =>
        mapOutsideCode(line, (part) =>
          part
            .replaceAll(
              INLINE_LINK,
              byGroups(({ bang, href, label, title }) => {
                const out = rewrite(href, bang === "!");
                return `${bang}[${label}](${out}${title ?? ""})`;
              })
            )
            .replaceAll(
              REF_DEFINITION,
              byGroups(({ href, lead }) => `${lead}${rewrite(href, false)}`)
            )
            .replaceAll(
              HTML_URL_ATTR,
              byGroups(({ attr, quote, value }) => {
                // A relative `src` was read against the page's old URL, which
                // the new folders don't mirror: a root path, not a rebase.
                // Blume adds deployment.base to it.
                const out = rewrite(value, false);
                return `${attr}=${quote}${out}${quote}`;
              })
            )
        )
      )
      .join("\n")
  );
};

// --- MDX ------------------------------------------------------------------------------

const MDX_FEATURE =
  /^\s*:{3,}[a-z]|<[A-Z][\w.]*[\s/>]|\$\$|^[ \t]+<include[\s>]/mu;
const MERMAID_FENCE = /^\s*(?:`{3,}|~{3,})mermaid\b/mu;

const needsMdxText = (text) => {
  let found = MERMAID_FENCE.test(text);
  mapProse(text, (prose) => {
    found ||= MDX_FEATURE.test(prose);
    return prose;
  });
  return found;
};

/** Prose (inline code masked) made MDX-safe where the fix is exact. */
const mdxSafeProse = (prose, report) => {
  const withoutScripts = removeAll(
    prose,
    /<script\b[\s\S]*?<\/script\b[^>]*>[ \t]*\n?/giu,
    () => {
      edit(report, "<script> removed (MDX)");
      note(
        report,
        "a <script> was removed: rebuild what it did as an island, a PageFooter slot, or static content"
      );
    }
  );
  const withoutStyles = removeAll(
    withoutScripts,
    /<style\b[\s\S]*?<\/style\b[^>]*>[ \t]*\n?/giu,
    () => {
      edit(report, "<style> removed (MDX)");
      note(
        report,
        "a <style> block was removed: move the rules that still matter to theme.css"
      );
    }
  );
  return withoutStyles
    .replaceAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>[ \t]*\n?/giu, () => {
      edit(report, "stylesheet <link> removed (MDX)");
      return "";
    })
    .replaceAll(
      /<!--(?<body>[\s\S]*?)-->/gu,
      byGroups(({ body }) => {
        edit(report, "HTML comment → {/* */}");
        return `{/* ${body.replaceAll("*/", "* /").replaceAll(/\s+/gu, " ").trim()} */}`;
      })
    )
    .replaceAll(
      new RegExp(
        `<(?<tag>${VOID_TAGS})\\b(?<attrs>(?:[^<>"']|"[^"]*"|'[^']*')*?)\\s*(?<!/)>`,
        "giu"
      ),
      byGroups(({ attrs, tag }) => {
        edit(report, `<${tag.toLowerCase()}> self-closed`);
        return `<${tag}${attrs} />`;
      })
    )
    .replaceAll(
      /<(?<url>https?:\/\/[^\s<>]+)>/gu,
      byGroups(({ url }) => {
        edit(report, "autolink → link");
        return `[${url}](${url})`;
      })
    )
    .replaceAll(/<(?![A-Za-z/!])/gu, () => {
      edit(report, "bare < → &lt;");
      return "&lt;";
    });
};

/** Make prose MDX-safe where the fix is exact; inline code stays as written. */
const makeMdxSafe = (text, report) =>
  mapProse(text, (whole) =>
    outsideCodeSpans(whole, (prose) => mdxSafeProse(prose, report))
  );

/** What MDX would choke on that the codemod can't fix exactly. */
const mdxHazards = (text, start) => {
  const found = [];
  const lines = text.split("\n");
  const mask = fenceMask(lines);
  for (const [index, line] of lines.entries()) {
    if (
      index < start ||
      mask[index] ||
      /\{%|\{\{(?!\s*[\w-]+\s*\}\})/u.test(line)
    ) {
      continue;
    }
    const prose = mapOutsideCode(line, (part) =>
      removeAll(
        part
          .replaceAll(/\{\/\*.*?\*\/\}/gu, "")
          .replaceAll(/\$\$.*?\$\$/gu, "")
          .replaceAll(/\{\{\s*[\w-]+\s*\}\}/gu, ""),
        /<[A-Za-z][^<>]*>/gu
      ).replaceAll(/\\[{}<]/gu, "")
    );
    if (/[{}]/u.test(prose)) {
      found.push({
        line: index + 1,
        message: "a brace in prose: escape it (\\{) or put it in backticks",
      });
    } else if (/<(?:[\s\d=<]|$)/u.test(prose)) {
      found.push({
        line: index + 1,
        message: "a bare < in prose: write &lt; or put it in backticks",
      });
    }
    if (
      /^(?: {4}|\t)\S/u.test(line) &&
      isBlank(lines[index - 1]) &&
      !LIST_ITEM.test(lines[index - 2] ?? "") &&
      !/^\s/u.test(lines[index - 2] ?? "")
    ) {
      found.push({
        line: index + 1,
        message:
          "an indented code block: MDX reads it as a paragraph, so fence it",
      });
    }
  }
  return found;
};

/** Liquid and Kramdown left over, for the review list. */
const leftovers = (text, start, problems) => {
  const found = [];
  const lines = text.split("\n");
  const mask = fenceMask(lines);
  const at = (index, message) => found.push({ line: index + 1, message });
  for (const [index, line] of lines.entries()) {
    const liquid = /\{%|\{\{(?!\s*[\w-]+\s*\}\})/u.test(line);
    if (index < start) {
      continue;
    }
    if (!mask[index] && problems.has(line.trim())) {
      at(index, `${line.trim().slice(0, 100)}: ${problems.get(line.trim())}`);
      continue;
    }
    if (mask[index]) {
      if (liquid) {
        at(
          index,
          "Liquid in a code block: Jekyll ran it (it wasn't in {% raw %}), so write what the old build shows"
        );
      }
      continue;
    }
    if (liquid) {
      at(index, `Liquid left: ${line.trim().slice(0, 100)}`);
    }
    if (/\{:/u.test(line)) {
      at(index, `Kramdown attribute list left: ${line.trim().slice(0, 100)}`);
    }
    if (/^#\s/u.test(line)) {
      at(
        index,
        "an H1: Blume renders the title as the page's H1, so demote this one"
      );
    }
    if (!isBlank(line) && /^=+\s*$/u.test(lines[index + 1] ?? "")) {
      at(index, "a setext heading: rewrite it with #");
    }
    if (/^:\s/u.test(line)) {
      at(
        index,
        "a definition list item: Blume shows it as text, so use a list or <dl>"
      );
    }
    if (/^\*\[[^\]]+\]:/u.test(line)) {
      at(
        index,
        "an abbreviation definition: Blume shows it as text, so remove it"
      );
    }
    if (/<i class="fa/u.test(line)) {
      at(
        index,
        "a Font Awesome icon: use <Icon icon> with a Lucide name, or drop it"
      );
    }
    if (/^\s*<details\b/iu.test(line)) {
      at(index, "a <details> block: in .mdx, use <Expandable title>");
    }
  }
  return found;
};

// --- Front matter -----------------------------------------------------------------------

const isoDate = (value) => {
  const text = textOf(value);
  if (text === undefined) {
    return;
  }
  return /^\d{4}-\d{2}-\d{2}/u.test(text) ? text.slice(0, 10) : text;
};

const seoOf = (data, report) => {
  const seo = {};
  for (const [key, value] of Object.entries(recordOf(data.seo))) {
    if (
      ["canonical", "description", "image", "noindex", "title", "x"].includes(
        key
      )
    ) {
      seo[key] = value;
    } else {
      edit(report, `jekyll-seo-tag seo.${key} removed`);
    }
  }
  const image = textOf(data.image) ?? textOf(recordOf(data.image).path);
  if (image !== undefined) {
    seo.image ??= image;
    edit(report, "image → seo.image");
  }
  const canonical = textOf(data.canonical_url);
  if (canonical !== undefined) {
    seo.canonical ??= canonical;
    edit(report, "canonical_url → seo.canonical");
  }
  return seo;
};

/** `title`, `description`, and the sidebar label a different old title becomes. */
const titleFields = (page, out, extra) => {
  const { data, report } = page;
  const oldTitle = textOf(data.title);
  const title = page.h1 ?? oldTitle;
  if (title !== undefined) {
    out.title = title;
  }
  if (page.h1 && oldTitle && oldTitle !== page.h1) {
    extra.sidebar.label ??= oldTitle;
    extra.seo.title ??= oldTitle;
    edit(report, "old title → sidebar.label + seo.title");
  }
  const description = textOf(data.description) ?? textOf(data.summary);
  if (description !== undefined) {
    out.description = description;
  }
  if ([oldTitle, description].some((value) => /\{\{|\{%/u.test(value ?? ""))) {
    note(
      report,
      "front matter title or description holds Liquid, which Jekyll printed as written there (and Blume shows the description under the title): check the old page"
    );
  }
  if (data.description === undefined && textOf(data.summary) !== undefined) {
    edit(report, "summary → description");
  }
};

/** Dates, drafts, search, and the layout → their Blume keys. */
const pageFields = (page, out, extra) => {
  const { data, report } = page;
  if (page.hidden) {
    extra.sidebar.hidden = true;
  }
  if (data.search_exclude === true) {
    extra.search.exclude = true;
    edit(report, "search_exclude → search.exclude");
  }
  out.lastModified =
    isoDate(data.last_modified_date) ?? isoDate(data.lastModified);
  if (data.published === false) {
    out.draft = true;
    edit(report, "published: false → draft: true");
  }
  const layout = textOf(data.layout);
  if (layout === "minimal" || data.nav_enabled === false) {
    out.mode = "center";
    edit(report, "no sidebar (minimal layout) → mode: center");
  } else if (layout !== undefined && !PLAIN_LAYOUTS.has(layout)) {
    note(
      report,
      `layout: ${layout} is a custom layout: read _layouts/${layout}.html and pick a mode or a custom page`
    );
  }
};

/** Keys the codemod doesn't map: kept, and reported unless Blume reads them. */
const otherFields = (page, out) => {
  const { data, report } = page;
  for (const [key, value] of Object.entries(data)) {
    if (HANDLED_KEYS.has(key) || Object.hasOwn(out, key)) {
      if (
        NAV_KEYS.has(key) ||
        ["layout", "nav_enabled", "permalink"].includes(key)
      ) {
        edit(report, `front matter ${key} removed`);
      }
      continue;
    }
    out[key] = value;
    if (!BLUME_KEYS.has(key)) {
      note(
        report,
        `front matter \`${key}\` isn't a Blume key (the schema is strict): map it or remove it`
      );
    }
  }
};

/** Jekyll and Just the Docs front matter → Blume's, in a stable key order. */
const convertFrontmatter = (page) => {
  const out = {};
  const extra = {
    search: { ...recordOf(page.data.search) },
    seo: seoOf(page.data, page.report),
    sidebar: { ...recordOf(page.data.sidebar) },
  };
  titleFields(page, out, extra);
  if (page.slug !== undefined) {
    out.slug = page.slug;
  }
  pageFields(page, out, extra);
  for (const [key, value] of Object.entries(extra)) {
    if (Object.keys(value).length > 0) {
      out[key] = value;
    }
  }
  otherFields(page, out);
  const ordered = {};
  for (const key of FRONTMATTER_ORDER) {
    if (out[key] !== undefined) {
      ordered[key] = out[key];
    }
  }
  for (const [key, value] of Object.entries(out)) {
    if (value !== undefined && !Object.hasOwn(ordered, key)) {
      ordered[key] = value;
    }
  }
  return ordered;
};

// --- Navigation ---------------------------------------------------------------------------

/** Plan a move of the page now planned at `from`. */
const planMove = (pages, from, to) => {
  for (const page of pages) {
    if (page.finalRel === from) {
      page.finalRel = to;
    }
  }
};

/** A nav link's page, through the site's origin and base. */
const navPage = (href, ctx) => {
  let value = href;
  if (ctx.origin && value.startsWith(ctx.origin)) {
    value = value.slice(ctx.origin.length) || "/";
  }
  if (/^[a-z][a-z0-9+.-]*:/iu.test(value)) {
    return null;
  }
  let route = normalizeRoute(value);
  if (
    ctx.baseurl &&
    (route === ctx.baseurl || route.startsWith(`${ctx.baseurl}/`))
  ) {
    route = route.slice(ctx.baseurl.length) || "/";
  }
  return ctx.pagesByRoute.get(route) ?? null;
};

const unitPath = (unit) => unit.folder ?? unit.page.finalRel;

/** Settle one nav section: its folder, and its children under it. */
const placeSection = (unit, pages, notes) => {
  const { children, page } = unit;
  const dir = parentOf(page.finalRel);
  const name = path.posix.basename(stripExt(page.finalRel));
  const ext = path.posix.extname(page.finalRel);
  if (name === "index") {
    unit.folder = dir;
  } else {
    const real = dir ? `${dir}/${name}` : name;
    const inside = children.every((child) => isWithin(real, unitPath(child)));
    const taken = pages.some(
      (other) => other !== page && stripExt(other.finalRel) === `${real}/index`
    );
    const group = dir ? `${dir}/(${name})` : `(${name})`;
    unit.folder = inside && !taken ? real : group;
    planMove(pages, page.finalRel, `${unit.folder}/index${ext}`);
  }
  for (const child of children) {
    const where = unitPath(child);
    if (isWithin(unit.folder, where)) {
      continue;
    }
    if (child.folder !== null) {
      notes.push(
        `section "${child.node.title}" (${child.folder}/) sits outside its parent's folder ${unit.folder || "(the root)"}: move it by hand`
      );
      continue;
    }
    const target = `${unit.folder}/${path.posix.basename(where)}`;
    if (pages.some((other) => other.finalRel === target)) {
      notes.push(
        `couldn't move ${where} under ${unit.folder}/: ${target} exists`
      );
      continue;
    }
    planMove(pages, where, target);
  }
};

/** Each folder's children, in nav order, by their first segment under it. */
const entriesUnder = (folder, units) => {
  const names = [];
  for (const child of units) {
    const where = unitPath(child);
    // A section left outside the folder is named as it will be once moved in.
    const inside = folder ? where.slice(folder.length + 1) : where;
    const [first] = (
      isWithin(folder, where) ? inside : path.posix.basename(where)
    ).split("/");
    const slug = entrySlug(first);
    if (slug !== "" && slug !== "index" && !names.includes(slug)) {
      names.push(slug);
    }
  }
  return names;
};

/** Folders between `folder` and its children that no nav section owns. */
const collectWrappers = (folder, unit, sections, wrappers) => {
  for (const child of unit.children) {
    let dir = child.folder ?? parentOf(child.page.finalRel);
    while (dir !== folder && dir !== "" && isWithin(folder, dir)) {
      if (dir !== child.folder && !sections.has(dir)) {
        const wrapper = wrappers.get(dir) ?? { children: [], folder: dir };
        wrapper.children.push(child);
        wrappers.set(dir, wrapper);
      }
      dir = parentOf(dir);
    }
  }
};

/** Whether the old page listed this section's children (`has_toc`). */
const showedChildList = (unit, ctx) => {
  const oldFile = oldFileFor(ctx.oldDir, unit.page.oldUrl);
  const first = oldFile ? oldChildList(readFileSync(oldFile, "utf-8")) : null;
  const page = first ? navPage(first, ctx) : null;
  return Boolean(page) && unit.children.some((child) => child.page === page);
};

/** `directory` inherits: stop it in a section whose page showed no list. */
const settleDirectories = (meta, sections) => {
  const byDepth = [...meta.keys()].toSorted(
    (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b)
  );
  const effective = new Map();
  for (const folder of byDepth) {
    const entry = meta.get(folder);
    let parent = folder === "" ? null : parentOf(folder);
    while (parent !== null && !effective.has(parent)) {
      parent = parent === "" ? null : parentOf(parent);
    }
    const inherited = parent === null ? undefined : effective.get(parent);
    if (!entry.directory && inherited === "accordion" && sections.has(folder)) {
      entry.directory = "none";
    }
    effective.set(folder, entry.directory ?? inherited);
  }
};

/** How many of the sidebar's own links match a page, and how many don't. */
const countMatches = (nodes, ctx) => {
  const total = { matched: 0, missed: 0 };
  for (const node of nodes) {
    const inner = countMatches(node.children, ctx);
    total.matched += inner.matched;
    total.missed += inner.missed;
    if (!/^[a-z][a-z0-9+.-]*:/iu.test(node.href)) {
      if (navPage(node.href, ctx) === null) {
        total.missed += 1;
      } else {
        total.matched += 1;
      }
    }
  }
  return total;
};

/** Folders and meta.ts files from the old sidebar. */
const planNavigation = (pages, ctx, nav) => {
  const { matched, missed } = countMatches(nav, ctx);
  if (missed > matched) {
    return {
      meta: new Map(),
      notes: [
        `${missed} of the old sidebar's ${matched + missed} links match no page (is baseurl in _config.yml right?), so the navigation is left for you`,
      ],
    };
  }
  const notes = [];
  const inNav = new Set();
  const sections = new Map();
  // Post-order: a parent moves its children only once their own units settle.
  const visit = (node) => {
    const page = navPage(node.href, ctx);
    if (!page) {
      notes.push(
        /^[a-z][a-z0-9+.-]*:/iu.test(node.href)
          ? `nav link "${node.title}" (${node.href}) is external: put it in navigation.featured`
          : `nav entry "${node.title}" (${node.href}) matches no page`
      );
      return null;
    }
    if (inNav.has(page)) {
      // Just the Docs matched a `parent` to every page with that title.
      notes.push(
        `${page.rel} ("${node.title}") is listed again under another section: its parent's title names more than one page (grand_parent or ancestor picks one). It stays under the first, since Blume lists a page once`
      );
      return null;
    }
    inNav.add(page);
    const children = node.children.map(visit).filter(Boolean);
    const unit = { children, folder: null, node, page };
    if (children.length > 0) {
      placeSection(unit, pages, notes);
      sections.set(unit.folder, unit);
    }
    return unit;
  };
  const top = nav.map(visit).filter(Boolean);
  const meta = new Map();
  const wrappers = new Map();
  const root = { children: top, folder: "" };
  meta.set("", { folder: "", pages: entriesUnder("", top) });
  // Just the Docs lets the home page head a section; Blume's content root
  // index heads no group, so its children list in their own folders.
  const home = sections.get("");
  if (home) {
    sections.delete("");
    collectWrappers("", home, sections, wrappers);
    notes.push(
      `${home.page.rel} (the home page) heads "${home.node.title}" in the old sidebar, but the content root's index heads no group in Blume: its pages stay where they are and list in their folders`
    );
  }
  collectWrappers("", root, sections, wrappers);
  for (const [folder, unit] of sections) {
    const entry = { folder, pages: entriesUnder(folder, unit.children) };
    meta.set(folder, entry);
    collectWrappers(folder, unit, sections, wrappers);
    const label = unit.node.title;
    const humanized = humanize(folder.split("/").at(-1));
    const oldTitle = textOf(unit.page.data.title);
    const pageTitle = unit.page.h1 ?? oldTitle;
    // The sidebar.label titleFields writes: the old title, where the H1 differs.
    const sidebarLabel =
      textOf(recordOf(unit.page.data.sidebar).label) ??
      (unit.page.h1 && oldTitle !== unit.page.h1 ? oldTitle : undefined);
    if (label !== humanized) {
      entry.title = label;
    }
    // Hide the duplicate index row where Blume won't flag the titles: the
    // index check passes when the title or sidebar.label is the folder title.
    if (pageTitle === label || label === humanized || sidebarLabel === label) {
      unit.page.hidden = true;
      edit(
        unit.page.report,
        "section index row hidden (the group row links it)"
      );
    } else {
      notes.push(
        `${unit.page.finalRel}: its title "${pageTitle}" differs from the section label "${label}", so its row stays visible (hidden, it would raise BLUME_NAV_INDEX_TITLE_MISMATCH): to hide it, set its sidebar.label to "${label}" too`
      );
    }
    if (showedChildList(unit, ctx)) {
      entry.directory = "accordion";
    }
  }
  // Just the Docs listed a wrapper's pages at the top of its nav, open
  // everywhere; Blume's group display opens one only on its own pages, or
  // when it's the sidebar's only top-level row.
  for (const [folder, wrapper] of wrappers) {
    if (!meta.has(folder)) {
      meta.set(folder, {
        collapsed: false,
        folder,
        pages: entriesUnder(folder, wrapper.children),
      });
      notes.push(
        `${folder}/ isn't a section in the old sidebar: it becomes one group, kept open (collapsed: false)`
      );
    }
  }
  settleDirectories(meta, sections);
  // A hidden page leaves search, the sitemap, and llms.txt too, unless a
  // group row links it or it's the home page, which the root URL serves.
  const outside = pages.filter(
    (page) => !(inNav.has(page) || page.redirectOnly)
  );
  for (const page of outside) {
    page.hidden = true;
    edit(page.report, "not in the old sidebar → sidebar.hidden");
  }
  const unlisted = outside.filter((page) => page.oldRoute !== "/");
  if (unlisted.length > 0) {
    notes.push(
      `${unlisted.length} page(s) outside the old sidebar are hidden, which also leaves them out of search, the sitemap, and llms.txt, where Just the Docs still searched them: set search: { indexing: { includeHiddenPages: true } } to keep them searchable`
    );
  }
  return { meta, notes };
};

const renderMeta = (entry) => {
  const lines = [
    META_HEADER,
    'import { defineMeta } from "blume";',
    "",
    "export default defineMeta({",
  ];
  if (entry.title) {
    lines.push(`  title: ${JSON.stringify(entry.title)},`);
  }
  if (entry.collapsed === false) {
    lines.push("  collapsed: false,");
  }
  if (entry.directory) {
    lines.push(`  directory: ${JSON.stringify(entry.directory)},`);
  }
  if (entry.pages.length > 1) {
    lines.push(
      "  pages: [",
      ...entry.pages.map((slug) => `    ${JSON.stringify(slug)},`),
      "  ],"
    );
  }
  lines.push("});", "");
  return lines.join("\n");
};

const worthWriting = (entry) =>
  Boolean(entry.title) ||
  Boolean(entry.directory) ||
  entry.collapsed === false ||
  entry.pages.length > 1;

// --- Run ------------------------------------------------------------------------------------

/** A page's old URL from Jekyll's rules: its permalink, or its path. */
const ruleUrl = (rel, data, style) => {
  const dir = parentOf(rel)
    .split("/")
    .filter((segment) => segment && !groupLabelOf(segment))
    .join("/");
  const name = path.posix.basename(stripExt(rel));
  const slug = textOf(data.slug);
  const permalink = textOf(data.permalink);
  if (slug !== undefined) {
    return `/${slug.replace(/^\/+/u, "")}`;
  }
  if (permalink !== undefined) {
    const expanded = permalink
      .replaceAll(":path", dir)
      .replaceAll(":basename", name)
      .replaceAll(":title", name)
      .replaceAll(":output_ext", ".html");
    return `/${expanded}`.replaceAll(/\/{2,}/gu, "/");
  }
  if (name === "index") {
    return dir ? `/${dir}/` : "/";
  }
  return `/${dir ? `${dir}/` : ""}${name}${permalinkSuffix(style)}`;
};

/** The permalink `defaults:` gives a page: the most specific scope wins. */
const defaultPermalink = (rel, defaults) => {
  let best;
  for (const entry of listOf(defaults)) {
    const scope = recordOf(recordOf(entry).scope);
    const permalink = textOf(recordOf(recordOf(entry).values).permalink);
    const type = textOf(scope.type);
    const where = (textOf(scope.path) ?? "").replaceAll(/^\.?\/+|\/+$/gu, "");
    if (
      permalink !== undefined &&
      (type === undefined || type === "pages") &&
      (where === "" || rel === where || rel.startsWith(`${where}/`)) &&
      (best === undefined || where.length >= best.where.length)
    ) {
      best = { permalink, where };
    }
  }
  return best?.permalink;
};

const readFile = (root, rel, ctx) => {
  const original = readFileSync(path.join(root, rel), "utf-8");
  const text = normalizeText(original);
  const { body, raw } = splitFrontmatter(text);
  let data = {};
  let fmError = null;
  if (raw !== null) {
    try {
      data = recordOf(parseYaml(raw));
    } catch (error) {
      fmError = error.message;
    }
  }
  const permalink =
    textOf(data.permalink) ?? defaultPermalink(rel, ctx.config.defaults);
  const fromRules = ruleUrl(
    rel,
    { ...data, permalink },
    textOf(ctx.config.permalink)
  );
  const route = normalizeRoute(fromRules);
  const oldUrl = (ctx.oldDir && builtUrl(ctx.oldDir, route)) || fromRules;
  return {
    body,
    data,
    finalRel: rel.replace(/\.markdown$/u, ".md"),
    fmError,
    hasFrontmatter: raw !== null,
    includeProblems: new Map(),
    includers: new Set(),
    includes: new Set(),
    oldRoute: route,
    oldUrl,
    partial: false,
    props: new Set(),
    raw,
    redirectOnly: textOf(data.redirect_to) !== undefined,
    rel,
    report: newReport(),
    siteKeys: new Set(),
    text: original,
  };
};

const convertFile = (file, ctx) => {
  const { report } = file;
  let text = protectRaw(file.body, report);
  text = convertLiquid(text, file, ctx);
  text = removeToc(text, report);
  if (!file.partial && !file.fmError) {
    const taken = takeH1(text);
    if (taken.title !== undefined) {
      // Blume leaves front matter as written, so a variable the H1 showed
      // goes into the title as its value.
      file.h1 = taken.title.replaceAll(
        /\{\{(?<key>[\w-]+)\}\}/gu,
        byGroups(({ key }, whole) => ctx.variables.get(key) ?? whole)
      );
      ({ text } = taken);
      edit(report, "body H1 → title");
      if (/\{\{|\{%/u.test(file.h1)) {
        note(
          report,
          `the H1 "${file.h1}" holds Liquid, which Blume shows as written in a title: write what the old page showed`
        );
      }
    }
  }
  text = removeExtensions(text, report);
  text = convertBlocks(text.split("\n"), ctx, report).join("\n");
  text = convertSpanIals(text, report);
  text = convertHeadingIds(text, report);
  file.converted = convertMarkdownAttr(text, report);
};

/** The one page a partial ends up in, through nested includes, or null. */
const onlyPage = (partial) => {
  const found = new Set();
  const seen = new Set();
  const climb = (file) => {
    if (seen.has(file)) {
      return;
    }
    seen.add(file);
    if (file.partial) {
      for (const includer of file.includers) {
        climb(includer);
      }
    } else {
      found.add(file);
    }
  };
  climb(partial);
  return found.size === 1 ? [...found][0] : null;
};

const finishLinks = (file, ctx) => {
  const page = file.partial ? onlyPage(file) : file;
  file.converted = convertLinks(
    file.converted,
    {
      baseUrl: page?.oldUrl ?? null,
      finalRel: file.partial ? file.rel : file.finalRel,
      sourceRel: file.rel,
    },
    file,
    ctx
  );
};

const tidy = (text) =>
  `${mapProse(text, (prose) => prose.replaceAll(/\n{3,}/gu, "\n\n"))
    .replace(/^\n+/u, "")
    .replace(/\s*$/u, "")}\n`;

/** Redirects a page's front matter and old URL call for, and its slug. */
const settleUrls = (page, redirects) => {
  const { report } = page;
  if (blumeRoute(page.finalRel) !== page.oldRoute) {
    if (page.oldRoute === "/") {
      note(
        report,
        "this page served / but isn't the content root's index: move it to index.md"
      );
    } else {
      page.slug = page.oldRoute.slice(1);
      edit(report, "slug pins the old URL");
    }
  }
  for (const from of listOf(page.data.redirect_from)) {
    const text = textOf(from);
    const source = text?.startsWith("/") ? text : `/${text}`;
    if (text === undefined || normalizeRoute(source) === page.oldRoute) {
      note(
        report,
        `redirect_from ${source} is empty or the page's own URL: skipped`
      );
      continue;
    }
    redirects.push({ from: source, to: page.oldRoute });
    edit(report, "redirect_from → redirects");
  }
  const target = textOf(page.data.redirect_to);
  if (target !== undefined) {
    const to = /^[a-z][a-z0-9+.-]*:/iu.test(target)
      ? target
      : normalizeRoute(target.startsWith("/") ? target : `/${target}`);
    redirects.push({ from: page.oldRoute, to });
    edit(report, "redirect_to → redirects");
  }
  if (
    page.oldUrl.endsWith(".html") &&
    !page.unbuilt &&
    !/(?:^|\/)(?:index|404)\.html$/u.test(page.oldUrl)
  ) {
    redirects.push({ from: page.oldUrl, to: page.oldRoute });
    edit(report, ".html URL → redirect");
  }
  if (page.oldRoute === "/404") {
    note(
      report,
      "a 404 page: delete it (Blume ships one; pages/404.astro replaces it)"
    );
  }
};

/** Which pages and partials need MDX: their own syntax, or a partial's. */
const settleMdx = (pages) => {
  const needs = new Map();
  const needsMdx = (file, seen) => {
    if (needs.has(file)) {
      return needs.get(file);
    }
    if (seen.has(file)) {
      return false;
    }
    seen.add(file);
    const result =
      needsMdxText(file.converted) ||
      file.rel.endsWith(".mdx") ||
      [...file.includes].some((partial) => needsMdx(partial, seen));
    needs.set(file, result);
    return result;
  };
  const mdxPartials = new Set();
  const markPartials = (file) => {
    for (const partial of file.includes) {
      if (!mdxPartials.has(partial)) {
        mdxPartials.add(partial);
        markPartials(partial);
      }
    }
  };
  for (const page of pages) {
    page.mdx = needsMdx(page, new Set());
    if (page.mdx) {
      page.finalRel = page.finalRel.replace(/\.(?:md|markdown)$/u, ".mdx");
      markPartials(page);
    }
  }
  return mdxPartials;
};

const RAW_REFERENCE = new RegExp(
  `${RAW_CHARS.get("{")}{2}\\s*(?<name>[\\w-]+)\\s*${RAW_CHARS.get("}")}{2}`,
  "gu"
);

/** `{{name}}` references Blume would fill in where Jekyll printed them as written. */
const variableClashes = (file, protectedText, ctx) => {
  for (const match of protectedText.matchAll(RAW_REFERENCE)) {
    const { name } = match.groups;
    if (ctx.variables.has(name) || file.props.has(name)) {
      note(
        file.report,
        `{{ ${name} }} sat in {% raw %}, so the old page printed it as written, but Blume fills in ${name} wherever {{${name}}} appears, code included: rename the ${ctx.variables.has(name) ? "variable (in jekyll-migration.json and the pages using it)" : "prop"}`
      );
    }
  }
  for (const key of file.siteKeys) {
    if (file.props.has(key)) {
      note(
        file.report,
        `{{${key}}} now reads both {{ site.${key} }} and {{ include.${key} }}, and a passed ${key} wins for both: rename one`
      );
    }
  }
};

/** The final text of a page or partial, and what's left to review. */
const finalText = (file, mdx, ctx) => {
  let body = file.converted;
  if (mdx) {
    body = makeMdxSafe(body, file.report);
  }
  let head = "";
  if (file.partial || file.fmError) {
    if (file.fmError) {
      note(file.report, `front matter: ${file.fmError}; left as written`);
    }
    head = file.raw === null ? "" : `---\n${file.raw}\n---\n\n`;
  } else {
    const yaml = emitYaml(convertFrontmatter(file));
    head = yaml ? `---\n${yaml}\n---\n\n` : "";
    if (file.h1 === undefined && textOf(file.data.title) === undefined) {
      note(file.report, "no title and no H1: give the page a title");
    }
  }
  // Reviews count lines in the file as written, front matter included.
  const protectedText = `${head}${tidy(body)}`;
  variableClashes(file, protectedText, ctx);
  const start = head.split("\n").length - 1;
  const reviews = leftovers(protectedText, start, file.includeProblems);
  const text = restoreRaw(protectedText);
  if (mdx) {
    reviews.push(...mdxHazards(text, start));
  }
  return { reviews, text };
};

const writeFile = (root, file, text, remove) => {
  if (remove) {
    rmSync(path.join(root, file.rel));
    return;
  }
  const target = path.join(root, file.finalRel);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text);
  if (file.finalRel !== file.rel) {
    rmSync(path.join(root, file.rel));
  }
};

/** Notes for theme files and settings the codemod leaves. */
const themeNotes = (files, ctx) => {
  const notes = [];
  for (const rel of files.filter((file) =>
    /^(?:_sass|assets\/css)\/.*\.s?css$/u.test(file)
  )) {
    const lines = readFileSync(path.join(ctx.root, rel), "utf-8").split("\n");
    for (const [index, line] of lines.entries()) {
      if (/display:\s*none|\bcontent:\s*["']/u.test(line)) {
        const rule =
          line.trim().length > 120
            ? `${line.trim().slice(0, 120)}…`
            : line.trim();
        notes.push(
          `${rel}:${index + 1}: \`${rule}\` hides or adds content: find what it targets in the pages and decide`
        );
      }
    }
  }
  const hookName = new RegExp(
    `^${ctx.includesDir}/(?:head_custom|header_custom|footer_custom|nav_footer_custom|title|search_placeholder_custom|toc_heading_custom)\\.html$|^_layouts/`,
    "u"
  );
  const hooks = files.filter((rel) => hookName.test(rel));
  if (hooks.length > 0) {
    notes.push(`Theme files to port or drop by hand: ${hooks.join(", ")}`);
  }
  for (const name of Object.keys(recordOf(ctx.config.collections))) {
    notes.push(
      `collection _${name}/ isn't converted: rename it ${name}/ (for a /:collection/:path/ permalink) and run again`
    );
  }
  return notes;
};

const writeMeta = (root, meta, write, notes) => {
  const written = [];
  for (const [folder, entry] of [...meta].toSorted(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const rel = folder ? `${folder}/meta.ts` : "meta.ts";
    const target = path.join(root, rel);
    const content = renderMeta(entry);
    const current = existsSync(target) ? readFileSync(target, "utf-8") : null;
    if (!worthWriting(entry) || current === content) {
      continue;
    }
    if (current !== null && !current.startsWith(META_HEADER)) {
      notes.push(
        `${rel} exists and wasn't written by this codemod: merge this by hand:\n${content}`
      );
      continue;
    }
    written.push(rel);
    if (write) {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
  }
  return written;
};

const collectFiles = (root, ctx) => {
  const exclude = excludedBy(listOf(ctx.config.exclude).map(String));
  const skip = (rel, name) =>
    ALWAYS_SKIP.has(rel) ||
    name.startsWith(".") ||
    (name.startsWith("_") &&
      rel !== ctx.includesDir &&
      !rel.startsWith("_sass") &&
      rel !== "_layouts") ||
    exclude(rel);
  return walk(root, "", skip);
};

const buildContext = (root, options, notes) => {
  const config = readConfig(root, notes);
  const url = textOf(config.url)?.replace(/\/+$/u, "");
  const baseurl = textOf(config.baseurl)?.replace(/\/+$/u, "") ?? "";
  return {
    baseurl,
    callouts: options.callouts
      ? new Map(options.callouts.map((name) => [name, {}]))
      : calloutConfig(config),
    config,
    includesDir: (textOf(config.includes_dir) ?? "_includes").replaceAll(
      /^\.?\/+|\/+$/gu,
      ""
    ),
    oldDir: options.old ? path.resolve(options.old) : null,
    origin: url ? `${url}${baseurl}` : null,
    pagesByRoute: new Map(),
    pagesBySource: new Map(),
    partials: new Map(),
    redirectFroms: new Set(),
    root,
    variables: new Map(),
  };
};

const addPage = (file, pages, ctx, notes) => {
  pages.push(file);
  ctx.pagesBySource.set(file.rel, file);
  const other = ctx.pagesByRoute.get(file.oldRoute);
  if (other) {
    notes.push(
      `${file.rel} and ${other.rel} both served ${file.oldUrl}: keep one`
    );
  }
  ctx.pagesByRoute.set(file.oldRoute, file);
  for (const from of listOf(file.data.redirect_from)) {
    const text = textOf(from);
    if (text !== undefined) {
      ctx.redirectFroms.add(
        normalizeRoute(text.startsWith("/") ? text : `/${text}`)
      );
    }
  }
};

/** The files a page or partial names in `{% include_relative %}` tags. */
const relativeTargets = (file) =>
  file.body.split("\n").flatMap((line) => {
    const match = line.match(INCLUDE_TAG);
    const parsed =
      match?.groups.tag === "include_relative"
        ? parseInclude(match.groups.rest)
        : {};
    return parsed.file
      ? [path.posix.normalize(path.posix.join(parentOf(file.rel), parsed.file))]
      : [];
  });

/** Pages and Markdown partials, read; files that aren't pages, noted. */
const readSite = (root, files, ctx, notes) => {
  const pages = [];
  const skipped = [];
  for (const rel of files.filter((file) => DOC_EXT.test(file))) {
    const file = readFile(root, rel, ctx);
    const built =
      file.hasFrontmatter ||
      Boolean(ctx.oldDir && oldFileFor(ctx.oldDir, file.oldUrl));
    if (rel.startsWith(`${ctx.includesDir}/`)) {
      file.partial = true;
      file.finalRel = rel;
      ctx.partials.set(rel, file);
    } else if (!rel.startsWith("_") && built) {
      addPage(file, pages, ctx, notes);
    } else if (!rel.startsWith("_")) {
      skipped.push(rel);
    }
  }
  // Markdown a page pulls in with include_relative is a partial too, even
  // without front matter or under an `_` folder.
  const queue = [...pages, ...ctx.partials.values()];
  for (const file of queue) {
    for (const target of relativeTargets(file)) {
      if (
        DOC_EXT.test(target) &&
        !ctx.pagesBySource.has(target) &&
        !ctx.partials.has(target) &&
        isFile(path.join(root, target))
      ) {
        const partial = readFile(root, target, ctx);
        partial.partial = true;
        partial.finalRel = target;
        ctx.partials.set(target, partial);
        queue.push(partial);
        if (!target.split("/").some((segment) => segment.startsWith("_"))) {
          notes.push(
            `${target} is included with include_relative: Blume would publish it as a page, so rename it with a leading underscore (and its <include> paths) or leave it out of content.include`
          );
        }
      }
    }
  }
  const unread = skipped.filter((rel) => !ctx.partials.has(rel));
  if (unread.length > 0) {
    notes.push(
      `Not pages (no front matter, so Jekyll copied them as files): ${unread.join(", ")}`
    );
  }
  // A partial that holds only a TOC is dropped where it's included.
  for (const partial of ctx.partials.values()) {
    partial.tocOnly =
      partial.body.split("\n").some((line) => TOC_IAL.test(line)) &&
      removeToc(partial.body, newReport()).trim() === "";
  }
  return pages;
};

/** The old sidebar → folders and meta.ts, and pages the old build lacks. */
const readNavigation = (pages, ctx, options, notes) => {
  if (!ctx.oldDir) {
    notes.push(
      "No --old build: URLs come from the permalink rules, and the navigation is left for you"
    );
    return { meta: new Map(), notes: [] };
  }
  for (const page of pages.filter((one) => !one.redirectOnly)) {
    if (!oldFileFor(ctx.oldDir, page.oldUrl)) {
      page.unbuilt = true;
      note(
        page.report,
        `${page.oldUrl} isn't in the old build: was it published? (check permalink, defaults, and published: false)`
      );
    }
  }
  const nav = readOldNav(ctx.oldDir);
  if (!nav) {
    notes.push(
      `${options.old} has no Just the Docs sidebar (nav#site-nav) in index.html, so the navigation is left for you`
    );
    return { meta: new Map(), notes: [] };
  }
  return planNavigation(pages, ctx, nav);
};

/** A page whose heading lives in the one partial it includes. */
const noteHeadingInPartial = (page) => {
  if (page.h1 !== undefined) {
    return;
  }
  const partial = [...page.includes].find(
    (one) => one.partial && takeH1(one.converted).title !== undefined
  );
  if (partial && onlyPage(partial) === page) {
    note(
      page.report,
      `its heading is the H1 in ${partial.rel}: move it into this page's title`
    );
  }
};

/** Write (or plan) one file; its entry in the report, or null. */
const finishFile = (file, mdx, ctx, write) => {
  const { root } = ctx;
  const { reviews, text } = finalText(file, mdx, ctx);
  const remove = file.redirectOnly && file.converted.trim() === "";
  if (file.redirectOnly && !remove) {
    note(
      file.report,
      "redirect_to on a page with content: the redirect replaces it, so delete the page if that's right"
    );
  }
  const changed = remove || text !== file.text || file.finalRel !== file.rel;
  for (const message of file.report.notes) {
    reviews.push({ line: 0, message });
  }
  if (write && changed) {
    writeFile(root, file, text, remove);
  }
  if (!(changed || reviews.length > 0)) {
    return null;
  }
  let moved;
  if (remove) {
    moved = "(removed)";
  } else if (file.finalRel !== file.rel) {
    moved = file.finalRel;
  }
  return {
    changed,
    edits: Object.fromEntries(
      [...file.report.edits].toSorted(([a], [b]) => a.localeCompare(b))
    ),
    file: file.rel,
    moved,
    reviews: reviews.toSorted((a, b) => a.line - b.line),
  };
};

/** Redirects and variables, for blume.config.ts to import. */
const writeMigration = (root, redirects, ctx, write) => {
  const migration = {
    redirects: redirects.toSorted((a, b) => a.from.localeCompare(b.from)),
    variables: Object.fromEntries(
      [...ctx.variables].toSorted(([a], [b]) => a.localeCompare(b))
    ),
  };
  // Written even when empty: it marks the folder as converted.
  const file = path.join(root, "jekyll-migration.json");
  const text = `${JSON.stringify(migration, null, 2)}\n`;
  const current = existsSync(file) ? readFileSync(file, "utf-8") : null;
  if (write && current !== text) {
    writeFileSync(file, text);
  }
  return migration;
};

const run = (root, options) => {
  const notes = [];
  const ctx = buildContext(root, options, notes);
  if (!ctx.callouts) {
    notes.push(
      "_config.yml declares no callouts:, so IALs with classes like .note were left: if _sass/custom styled them as callouts, pass --callouts note,warning on the write run (else delete them)"
    );
  }
  const files = collectFiles(root, ctx);
  const pages = readSite(root, files, ctx, notes);
  const everything = [...pages, ...ctx.partials.values()];
  for (const file of everything) {
    convertFile(file, ctx);
  }
  const navigation = readNavigation(pages, ctx, options, notes);
  const redirects = [];
  for (const page of pages) {
    settleUrls(page, redirects);
    noteHeadingInPartial(page);
  }
  for (const file of everything) {
    finishLinks(file, ctx);
  }
  const mdxPartials = settleMdx(pages);
  const results = everything
    .map((file) =>
      finishFile(
        file,
        file.partial ? mdxPartials.has(file) : file.mdx,
        ctx,
        options.write
      )
    )
    .filter(Boolean);
  return {
    files: results,
    meta: writeMeta(root, navigation.meta, options.write, navigation.notes),
    migration: writeMigration(root, redirects, ctx, options.write),
    notes: [...notes, ...navigation.notes, ...themeNotes(files, ctx)],
  };
};

const HELP = [
  "jekyll-codemod — the mechanical part of a Jekyll (Just the Docs) → Blume migration",
  "",
  "  node jekyll-codemod.mjs --old <built site> <jekyll dir>          dry run (report only)",
  "  node jekyll-codemod.mjs --old <built site> --write <jekyll dir>  apply in place",
  "  node jekyll-codemod.mjs --old <built site> --json <jekyll dir>   JSON report",
  "",
  "  --callouts a,b  the callout classes of a site whose _config.yml has no callouts:",
  "",
].join("\n");

const parseArgs = (argv) => {
  const options = {
    callouts: null,
    dir: null,
    help: false,
    json: false,
    old: null,
    write: false,
  };
  let pending = null;
  for (const arg of argv) {
    if (pending === "--old") {
      options.old = arg;
      pending = null;
    } else if (pending === "--callouts") {
      options.callouts = arg
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      pending = null;
    } else if (arg === "--old" || arg === "--callouts") {
      pending = arg;
    } else if (arg === "--write") {
      options.write = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      options.dir = arg;
    }
  }
  return options;
};

const printReport = (result, write) => {
  const totals = new Map();
  let reviewCount = 0;
  for (const file of result.files) {
    process.stdout.write(
      `\n${file.moved ? `${file.file} → ${file.moved}` : file.file}\n`
    );
    for (const [kind, count] of Object.entries(file.edits)) {
      process.stdout.write(`  ${count} × ${kind}\n`);
      totals.set(kind, (totals.get(kind) ?? 0) + count);
    }
    for (const { line, message } of file.reviews) {
      process.stdout.write(
        `  REVIEW${line ? ` line ${line}` : ""}: ${message}\n`
      );
    }
    reviewCount += file.reviews.length;
  }
  if (result.meta.length > 0) {
    process.stdout.write(`\nmeta.ts: ${result.meta.join(", ")}\n`);
  }
  if (result.migration) {
    const { redirects, variables } = result.migration;
    process.stdout.write(
      [
        "",
        `jekyll-migration.json: ${redirects.length} redirect(s), ${Object.keys(variables).length} variable(s). In blume.config.ts:`,
        '  import migration from "./jekyll-migration.json" with { type: "json" };',
        "  redirects: migration.redirects, variables: migration.variables,",
        "",
      ].join("\n")
    );
  }
  if (result.notes.length > 0) {
    process.stdout.write("\nNotes\n");
    for (const message of result.notes) {
      process.stdout.write(`  ${message}\n`);
    }
  }
  process.stdout.write("\nTotals\n");
  for (const [kind, count] of [...totals].toSorted(([a], [b]) =>
    a.localeCompare(b)
  )) {
    process.stdout.write(`  ${count} × ${kind}\n`);
  }
  const changed = result.files.filter((file) => file.changed).length;
  const verb = write ? "changed" : "would change";
  const hint = write ? "" : " Re-run with --write to apply.";
  process.stdout.write(
    `\n${result.files.length} file(s) with findings, ${changed} ${verb}, ${reviewCount} item(s) to review.${hint}\n`
  );
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.dir) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  const root = path.resolve(options.dir);
  if (!existsSync(path.join(root, "_config.yml"))) {
    process.stderr.write(
      `No _config.yml in ${root}: run the codemod from the Jekyll source directory, before deleting the Jekyll files.\n`
    );
    process.exitCode = 1;
    return;
  }
  if (options.write && existsSync(path.join(root, "jekyll-migration.json"))) {
    process.stderr.write(
      `${root} is already converted (it has jekyll-migration.json): a second --write would take each page's next H1 as its title and convert what {% raw %} protected. Run it once, on a fresh copy of the Jekyll source.\n`
    );
    process.exitCode = 1;
    return;
  }
  const result = run(root, options);
  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({ ...result, wrote: options.write }, null, 2)}\n`
    );
    return;
  }
  printReport(result, options.write);
};

main();
