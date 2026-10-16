#!/usr/bin/env node
// docus-codemod.mjs — the mechanical part of a Docus → Blume content
// migration. Point it at the Docus `content/` directory (Blume's
// `content.root`). It rewrites pages only where the mapping is exact, and
// reports everything it leaves for review:
//
//   - MDC block components, paired the way remark-mdc pairs them: every
//     `::name` opener nests, and a closer (a line of colons) closes the
//     innermost open block whose opener has exactly as many colons and isn't
//     indented less than it, with everything still open inside it. A closer
//     that matches nothing is text; an unclosed block runs to the end of its
//     parent. Closers inside code fences are code.
//   - Nuxt UI prose components → Blume:
//       note / tip / warning / caution / callout → `:::type` directives (or
//       `<Callout type icon>` for a non-default icon), card-group / card,
//       field-group / field → `<ResponseField>`, steps, tabs / tabs-item,
//       accordion / accordion-item, collapsible → `<Expandable>`,
//       code-group → `<CodeGroup>` (or one `package-install` fence),
//       code-collapse → `expandable` fences, code-tree, code-preview, prompt,
//       badge, and the inline `:icon`, `:kbd`, `:badge`, `:u-badge`, `:video`,
//       and `:u-color-mode-image`. `div` and `u-container` wrappers are removed.
//   - `[text]{.class}` spans and `{…}` attributes on Markdown are stripped;
//     `` `code`{lang="ts"} `` → `` `code{:ts}` ``.
//   - Fence labels: ` ```ts [file.ts]{2} ` → ` ```ts file.ts {2} `. Blume
//     reads the bracketed form too, range included, so this only tidies.
//   - Frontmatter: `navigation` → `sidebar`, `seo.ogImage` → `seo.image`,
//     `links` → `related`, `layout: docs` and `sitemap` removed, a body H1
//     → `title` when there's none.
//   - `.navigation.yml` → `meta.ts`, Iconify `i-lucide-*` icons → Lucide names.
//   - A page that now uses MDX-only syntax is renamed `.md` → `.mdx`, and its
//     prose made MDX-safe: `{` and `}` are escaped, every `<` that doesn't
//     open a real tag becomes `&lt;`, HTML comments become `{/* … */}`,
//     autolinks become links, and void tags close themselves.
//
// Everything else is a REVIEW line: custom and landing-page components, and
// blocks with a slot their conversion doesn't read (both left as written),
// unclosed blocks and stray closers, icons outside Lucide, dropped props,
// frontmatter keys Blume rejects, and file names whose route changes in Blume.
// CRLF pages are converted on LF and written back with CRLF.
//
// Design constraints (shared with the other codemods here):
//   - ZERO dependencies: runs with a bare `node`.
//   - Deterministic: files are processed in sorted order.
//   - Idempotent: a second run changes nothing. It converts `.md` pages;
//     `.mdx` files are its own output (Nuxt Content doesn't read MDX).
//   - Reports every change and every finding, so nothing is silent.
//
// Usage:
//   node docus-codemod.mjs <content-dir>                # dry run, report only
//   node docus-codemod.mjs --write <content-dir>        # apply in place
//   node docus-codemod.mjs --json <content-dir>         # machine-readable report
//   node docus-codemod.mjs --lucide <icons.json> <dir>  # check icon names
//
// Without `--lucide`, icon names are checked against `@iconify-json/lucide`
// when it resolves from the content directory (an installed `blume` brings it).

import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// --- Tables ---------------------------------------------------------------------

// Nuxt UI's callout shortcuts → Blume types. Docus's caution is red, which is
// Blume's danger (Blume's own `caution` alias is a warning).
const CALLOUT_NAMES = new Map([
  ["caution", "danger"],
  ["note", "note"],
  ["tip", "tip"],
  ["warning", "warning"],
]);

// `::callout{color}` → a Blume type. No color is Nuxt UI's neutral.
const CALLOUT_COLORS = new Map([
  ["error", "danger"],
  ["info", "info"],
  ["neutral", "note"],
  ["primary", "tip"],
  ["secondary", "note"],
  ["success", "success"],
  ["warning", "warning"],
]);

// The icons a callout type already shows: Blume's own, plus the one Nuxt UI
// gave the matching shortcut. Either is dropped instead of kept as `icon`.
const DEFAULT_ICONS = new Map([
  ["danger", new Set(["circle-alert", "circle-x"])],
  ["info", new Set(["info"])],
  ["note", new Set(["info"])],
  ["success", new Set(["circle-check"])],
  ["tip", new Set(["lightbulb"])],
  ["warning", new Set(["triangle-alert"])],
]);

// Nuxt UI's `useKbd` keys. `meta` is ⌘ on macOS and Ctrl elsewhere.
const KBD_KEYS = new Map([
  ["alt", "⌥"],
  ["arrowdown", "↓"],
  ["arrowleft", "←"],
  ["arrowright", "→"],
  ["arrowup", "↑"],
  ["backspace", "⌫"],
  ["capslock", "⇪"],
  ["command", "⌘"],
  ["control", "⌃"],
  ["ctrl", "Ctrl"],
  ["delete", "⌦"],
  ["end", "↘"],
  ["enter", "↵"],
  ["escape", "Esc"],
  ["home", "↖"],
  ["meta", "⌘"],
  ["option", "⌥"],
  ["pagedown", "⇟"],
  ["pageup", "⇞"],
  ["shift", "⇧"],
  ["tab", "⇥"],
  ["win", "⊞"],
]);

// Nuxt UI badge colors → Blume `variant` (the rest use Blume's default).
const BADGE_VARIANTS = new Map([
  ["error", "danger"],
  ["primary", "accent"],
  ["success", "success"],
  ["warning", "warning"],
]);

const PACKAGE_MANAGERS = new Set(["bun", "npm", "pnpm", "yarn"]);
const SHELL_LANGS = new Set(["", "bash", "sh", "shell", "zsh"]);

// Fence keywords Blume reads; never usable as a bare title.
const RESERVED_META = new Set([
  "expandable",
  "lineNumbers",
  "ts2js",
  "twoslash",
  "wrap",
]);

// Blume's page frontmatter keys (its schema is strict).
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

// The most entries Blume's `related` frontmatter takes.
const MAX_RELATED = 10;

const SEO_KEYS = new Set([
  "canonical",
  "description",
  "image",
  "noindex",
  "title",
]);

// Blume's no-import components: a `<Name>` with one of these names is a tag.
const COMPONENTS = new Set([
  "Accordion",
  "AccordionItem",
  "Badge",
  "Callout",
  "Card",
  "CardGroup",
  "CodeBlock",
  "CodeGroup",
  "Color",
  "Column",
  "Columns",
  "Component",
  "Diff",
  "Expandable",
  "FileTree",
  "Frame",
  "GithubInfo",
  "Icon",
  "Math",
  "Panel",
  "ParamField",
  "Prompt",
  "RequestExample",
  "ResponseExample",
  "ResponseField",
  "Step",
  "Steps",
  "Tab",
  "Tabs",
  "Tile",
  "Tooltip",
  "Tree",
  "TypeTable",
  "View",
  "Visibility",
  "YouTube",
]);

// HTML elements a page may write as tags. `script`, `style`, and `template`
// aren't here: in prose they're text, and MDX can't hold them.
const HTML_TAGS = new Set([
  "a",
  "abbr",
  "audio",
  "b",
  "blockquote",
  "br",
  "caption",
  "center",
  "code",
  "col",
  "dd",
  "del",
  "details",
  "div",
  "dl",
  "dt",
  "em",
  "embed",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "iframe",
  "img",
  "input",
  "ins",
  "kbd",
  "li",
  "mark",
  "ol",
  "p",
  "picture",
  "pre",
  "q",
  "s",
  "samp",
  "small",
  "source",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "track",
  "u",
  "ul",
  "var",
  "video",
  "wbr",
]);

const VOID_TAGS = new Set([
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "source",
  "track",
  "wbr",
]);

// Docus 1.x (Nuxt Elements) components: the reference maps them by hand.
const LEGACY = new Set([
  "alert",
  "block-hero",
  "button-link",
  "card-grid",
  "code-block",
  "list",
  "terminal",
]);

// Block components with a conversion (callouts are decided by name and color).
const CONVERTED = new Set([
  "accordion",
  "accordion-item",
  "badge",
  "card",
  "card-group",
  "code-collapse",
  "code-group",
  "code-preview",
  "code-tree",
  "collapsible",
  "div",
  "field",
  "field-group",
  "icon",
  "kbd",
  "prompt",
  "steps",
  "tabs",
  "tabs-item",
  "u-badge",
  "u-color-mode-image",
  "u-container",
  "video",
]);

// --- Patterns -------------------------------------------------------------------

// A backtick fence's info string holds no backtick: "```a``` b" is inline code.
const FENCE_RE =
  /^(?<indent>[ \t]*)(?<marker>`{3,}(?![^`]*`)|~{3,})(?<info>.*)$/u;
const OPEN_RE =
  /^(?<indent>[ \t]*)(?<colons>:{2,})(?<name>[A-Za-z][\w-]*)(?<label>\[[^\]]*\])?(?<attrs>\{.*\})?[ \t]*$/u;
const CLOSE_RE = /^(?<indent>[ \t]*)(?<colons>:{2,})[ \t]*$/u;
const SLOT_RE = /^[ \t]*#(?<name>[A-Za-z][\w-]*)(?<attrs>\{[^}]*\})?[ \t]*$/u;
const ATTR_TOKEN_RE =
  /^[ \t]*(?:(?<cls>\.[\w-]+(?:\.[\w-]+)*)|(?<id>#[\w-]+)|(?<key>:?[\w-]+)(?:=(?:"(?<dq>[^"]*)"|'(?<sq>[^']*)'|(?<bare>[^\s"'}]+)))?)/u;
// MDC attribute content that can't be anything else: a class, an id, or a
// `key=value`. A bare `{word}` after text is left alone (`$x_{i}$`, `[1]{2}`).
const MDC_ATTRS_RE = /^[ \t]*(?:[.#][\w-]|:?[\w-]+=)/u;
const INLINE_RE =
  /(?<![\w:/\\])(?<!\]):(?<name>[A-Za-z][\w-]*)(?<label>\[[^\]]*\])?(?<attrs>\{[^{}]*\})?/gu;

// A `$$` math block's opening and closing lines. Its LaTeX is left alone.
const MATH_OPEN_RE = /^[ \t]*\$\$(?!.*\$\$)/u;
const MATH_CLOSE_RE = /^[ \t]*\$\$[ \t]*$/u;

// --- Small helpers ----------------------------------------------------------------

const leading = (text) => /^[ \t]*/u.exec(text)[0].length;

const isFenceClose = (text, fence) => {
  const m = /^[ \t]*(?<marker>`{3,}|~{3,})[ \t]*$/u.exec(text);
  return (
    m !== null &&
    m.groups.marker[0] === fence.char &&
    m.groups.marker.length >= fence.length
  );
};

// An inline code span: a run of backticks, then the nearest run of exactly as
// many, so `` a `b` c `` is one span. An escaped backtick opens nothing.
const CODE_SPAN_RE =
  /(?<![`\\])(?<ticks>`+)(?!`)[\s\S]*?(?<!`)\k<ticks>(?!`)/gu;

// Apply `fn` to the text outside inline code spans.
const outsideCode = (text, fn) => {
  let result = "";
  let last = 0;
  for (const m of text.matchAll(CODE_SPAN_RE)) {
    result += fn(text.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return result + fn(text.slice(last));
};

// A JSX string attribute.
const jsxAttr = (key, value) => {
  if (value === true) {
    return key;
  }
  const text = String(value);
  return text.includes('"')
    ? `${key}={${JSON.stringify(text)}}`
    : `${key}="${text}"`;
};

// A fence title: a bare token when Blume reads one as a title, else `title="…"`.
const titleToken = (label) => {
  if (/^[^\s"'{}=[\]]+$/u.test(label) && !RESERVED_META.has(label)) {
    return label;
  }
  if (!label.includes('"')) {
    return `title="${label}"`;
  }
  return label.includes("'") ? null : `title='${label}'`;
};

// A YAML scalar as written in frontmatter, unquoted.
const unquote = (value) => {
  const text = value.trim();
  const double = /^"(?<inner>.*)"$/u.exec(text);
  if (double) {
    return double.groups.inner.replaceAll('\\"', '"');
  }
  const single = /^'(?<inner>.*)'$/u.exec(text);
  return single ? single.groups.inner.replaceAll("''", "'") : text;
};

// A YAML scalar's value: quotes removed, or a plain one's ` # comment`.
const yamlPlain = (value) =>
  unquote(/^\s*["']/u.test(value) ? value : value.replace(/[ \t]+#.*$/u, ""));

// A YAML scalar for output: plain when safe, else JSON-quoted.
const yamlScalar = (value) =>
  /^[A-Za-z0-9/][\w\s.,'()/&+?!-]*$/u.test(value) &&
  !/\s$/u.test(value) &&
  !/^(?:true|false|null|yes|no|on|off|~)$/iu.test(value)
    ? value
    : JSON.stringify(value);

// Plain text from a line of inline Markdown, for string props.
const plainText = (text) =>
  text
    .replaceAll(/\[(?<label>[^\]]*)\]\([^)]*\)/gu, "$<label>")
    .replaceAll(/\[(?<label>[^\]]*)\]\{[^}]*\}/gu, "$<label>")
    .replaceAll(/`|\*\*|__/gu, "")
    .trim();

// A scalar from a YAML props block: quoted, boolean, a flow list, or bare.
const yamlValue = (raw) => {
  const text = raw.trim();
  if (text === "true" || text === "false") {
    return text === "true";
  }
  const flow = /^\[(?<items>.*)\]$/u.exec(text);
  if (flow) {
    return flow.groups.items
      .split(",")
      .map((item) => unquote(item))
      .filter((item) => item !== "");
  }
  return unquote(text);
};

// The YAML props block MDC reads after an opener: top-level `key: value` lines
// and `key:` lists of scalars. Null for anything richer (nested maps, block
// scalars), which the codemod leaves for review.
const parseYamlProps = (lines) => {
  const out = {};
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (raw.trim() === "") {
      continue;
    }
    const kv = /^(?<key>[\w-]+):(?:[ \t]+(?<value>.*))?$/u.exec(raw.trim());
    if (!kv || leading(raw) > leading(lines[0])) {
      return null;
    }
    const value = kv.groups.value?.trim() ?? "";
    if (/^[|>]/u.test(value)) {
      return null;
    }
    if (value !== "") {
      out[kv.groups.key] = yamlValue(value);
      continue;
    }
    const items = [];
    while (i + 1 < lines.length && /^[ \t]*-[ \t]+/u.test(lines[i + 1])) {
      i += 1;
      const item = lines[i].replace(/^[ \t]*-[ \t]+/u, "");
      if (/^[\w-]+:/u.test(item)) {
        return null;
      }
      items.push(unquote(item));
    }
    out[kv.groups.key] = items;
  }
  return out;
};

// MDC inline attributes: `{key="v" key='v' key=v flag .class #id :json='[…]'}`.
const parseAttrs = (raw) => {
  const out = {};
  if (!raw) {
    return out;
  }
  let rest = raw.slice(1, -1);
  while (rest.trim() !== "") {
    const m = ATTR_TOKEN_RE.exec(rest);
    if (!m || m[0].trim() === "") {
      return null;
    }
    rest = rest.slice(m[0].length);
    const { bare, cls, dq, id, key, sq } = m.groups;
    if (cls) {
      out.class = cls.slice(1).split(".").join(" ");
    } else if (id) {
      out.id = id.slice(1);
    } else if (key.startsWith(":")) {
      try {
        out[key.slice(1)] = JSON.parse(dq ?? sq ?? bare ?? "null");
      } catch {
        return null;
      }
    } else {
      out[key] = dq ?? sq ?? bare ?? true;
    }
  }
  return out;
};

// --- Icons -------------------------------------------------------------------------

const readIconSet = (file) => {
  try {
    const set = JSON.parse(readFileSync(file, "utf-8"));
    return new Set([
      ...Object.keys(set.icons ?? {}),
      ...Object.keys(set.aliases ?? {}),
    ]);
  } catch {
    return null;
  }
};

// The Lucide icon names Blume resolves, or null when the set isn't found.
const loadLucide = (root, explicit) => {
  if (explicit) {
    return readIconSet(path.resolve(explicit));
  }
  const require = createRequire(path.join(root, "index.js"));
  const attempts = [
    () => require.resolve("@iconify-json/lucide/icons.json"),
    () =>
      createRequire(require.resolve("blume/package.json")).resolve(
        "@iconify-json/lucide/icons.json"
      ),
  ];
  for (const attempt of attempts) {
    try {
      return readIconSet(attempt());
    } catch {
      // Try the next location.
    }
  }
  return null;
};

// An Iconify name → its Lucide name, or null (reported) when it isn't one.
const lucideName = (value, ctx, line, where) => {
  const m = /^(?:i-lucide-|lucide:|lucide-)(?<name>[a-z0-9-]+)$/u.exec(
    String(value).trim()
  );
  if (!m) {
    ctx.review(
      line,
      `${where} icon \`${value}\` isn't a Lucide icon: pick the closest Lucide name, or save the SVG under public/ and use its path`
    );
    return null;
  }
  if (ctx.lucide && !ctx.lucide.has(m.groups.name)) {
    ctx.review(
      line,
      `${where} icon \`${m.groups.name}\` isn't in Blume's Lucide set`
    );
    return null;
  }
  return m.groups.name;
};

// --- Body parsing ------------------------------------------------------------------

// Parse body lines into blocks the way remark-mdc does. Text is kept as line
// indexes; blocks keep their source span so one left as written can be
// copied back verbatim.
const parseBody = (lines, toLine, review) => {
  const root = { kind: "root", sections: [{ children: [], name: "default" }] };
  const stack = [root];
  let fence = null;
  const children = () => stack.at(-1).sections.at(-1).children;
  const addText = (i) => {
    const kids = children();
    const last = kids.at(-1);
    if (last?.kind === "text") {
      last.lines.push(i);
    } else {
      kids.push({ kind: "text", lines: [i] });
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const text = lines[i];
    if (fence) {
      fence = isFenceClose(text, fence) ? null : fence;
      addText(i);
      continue;
    }
    const f = FENCE_RE.exec(text);
    if (f) {
      fence = { char: f.groups.marker[0], length: f.groups.marker.length };
      addText(i);
      continue;
    }
    const close = CLOSE_RE.exec(text);
    if (close) {
      const colons = close.groups.colons.length;
      const target = stack.findLastIndex(
        (entry, index) => index > 0 && entry.colons === colons
      );
      if (target === -1 || leading(text) > stack[target].indent) {
        review(
          toLine(i),
          target === -1
            ? `stray \`${text.trim()}\`: it matches no open block, and MDC showed it as text too`
            : `\`${text.trim()}\` is indented deeper than its opener, so MDC read it as text`
        );
        addText(i);
        continue;
      }
      for (const inner of stack.slice(target + 1)) {
        inner.end = i - 1;
        review(
          inner.line,
          `\`::${inner.name}\` has no closer of its own: the closer on line ${toLine(i)} ends it`
        );
      }
      stack[target].end = i;
      stack.length = target;
      continue;
    }
    const open = OPEN_RE.exec(text);
    if (open) {
      const block = {
        attrs: parseAttrs(open.groups.attrs),
        colons: open.groups.colons.length,
        end: lines.length - 1,
        indent: open.groups.indent.length,
        indentText: open.groups.indent,
        kind: "block",
        label: open.groups.label,
        line: toLine(i),
        name: open.groups.name,
        props: {},
        propsLines: 0,
        sections: [{ children: [], name: "default" }],
        start: i,
      };
      if (lines[i + 1]?.trim() === "---") {
        const endProps = lines.findIndex(
          (line, j) => j > i + 1 && line.trim() === "---"
        );
        if (endProps === -1) {
          block.props = null;
        } else {
          block.props = parseYamlProps(lines.slice(i + 2, endProps));
          block.propsLines = endProps - i;
          i = endProps;
        }
      }
      children().push(block);
      stack.push(block);
      continue;
    }
    const slot = stack.length > 1 ? SLOT_RE.exec(text) : null;
    if (slot) {
      stack.at(-1).sections.push({
        attrs: slot.groups.attrs,
        children: [],
        line: toLine(i),
        name: slot.groups.name,
      });
      continue;
    }
    if (/^[ \t]*>[ \t>]*:{2,}[A-Za-z]/u.test(text)) {
      review(
        toLine(i),
        "an MDC block inside a blockquote isn't converted: convert it by hand"
      );
    }
    addText(i);
  }
  for (const open of stack.slice(1)) {
    review(
      open.line,
      `\`::${open.name}\` is never closed: MDC runs it to the end of the page, and so does this conversion`
    );
  }
  return root;
};

// --- Inline conversion --------------------------------------------------------------

// `[text]{…}` spans and `{…}` attributes on Markdown, which MDX can't parse.
const stripAttributes = (text, edit) => {
  let out = text.replaceAll(
    /`(?<code>[^`]+)`\{(?<attrs>[^{}]*)\}/gu,
    (match, code, attrs) => {
      if (!MDC_ATTRS_RE.test(attrs)) {
        return match;
      }
      edit("inline code attributes");
      const lang = /\blang=["']?(?<lang>[\w-]+)/u.exec(attrs)?.groups.lang;
      return lang
        ? `\`${code}{:${lang.replace(/-type$/u, "")}}\``
        : `\`${code}\``;
    }
  );
  out = outsideCode(out, (part) =>
    part
      .replaceAll(
        /(?<link>\]\([^)]*\))\{(?<attrs>[^{}]*)\}/gu,
        (match, link, attrs) => {
          if (!MDC_ATTRS_RE.test(attrs)) {
            return match;
          }
          edit("link and image attributes removed");
          return link;
        }
      )
      .replaceAll(
        // Not an image's, and not an inline component's label (`:badge[x]{…}`).
        /(?<!!|:[A-Za-z][\w-]*)\[(?<span>[^\]]*)\]\{(?<attrs>[^{}]*)\}/gu,
        (match, span, attrs) => {
          if (!MDC_ATTRS_RE.test(attrs)) {
            return match;
          }
          edit("[span]{…} → text");
          return span;
        }
      )
      .replaceAll(
        /(?<mark>\*\*|__|\*|_)\{(?<attrs>[^{}]*)\}/gu,
        (match, mark, attrs) => {
          if (!MDC_ATTRS_RE.test(attrs)) {
            return match;
          }
          edit("emphasis attributes removed");
          return mark;
        }
      )
  );
  return out;
};

// The `<img>` pair for `u-color-mode-image`, or null without both images.
const colorModeImages = (attrs) => {
  if (!(attrs?.light && attrs?.dark)) {
    return null;
  }
  const extra = ["alt", "width", "height"]
    .filter((key) => attrs[key] !== undefined)
    .map((key) => ` ${jsxAttr(key, attrs[key])}`)
    .join("");
  return `<img src="${attrs.light}"${extra} class="dark:hidden" /> <img src="${attrs.dark}"${extra} class="hidden dark:block" />`;
};

const inlineIcon = (text, attrs, ctx, line) => {
  const icon = attrs.name ? lucideName(attrs.name, ctx, line, "`:icon`") : null;
  if (!icon) {
    return null;
  }
  ctx.mdx();
  ctx.edit(":icon → <Icon />");
  return `<Icon icon="${icon}" />`;
};

const inlineKbd = (text, attrs, ctx) => {
  const value = String(attrs.value ?? text ?? "");
  if (value === "") {
    return null;
  }
  ctx.edit(":kbd → <kbd>");
  return `<kbd>${KBD_KEYS.get(value.toLowerCase()) ?? value}</kbd>`;
};

const inlineBadge = (text, attrs, ctx) => {
  const content = String(text ?? attrs.label ?? "");
  if (content === "") {
    return null;
  }
  const variant = BADGE_VARIANTS.get(String(attrs.color ?? ""));
  ctx.mdx();
  ctx.edit("badge → <Badge>");
  return `<Badge${variant ? ` variant="${variant}"` : ""}>${content}</Badge>`;
};

const inlineVideo = (text, attrs, ctx) => {
  if (!attrs.src) {
    return null;
  }
  ctx.edit(":video → <video>");
  const parts = Object.entries(attrs)
    .filter(([key]) => key !== "class")
    .map(([key, value]) => jsxAttr(key, value));
  return `<video ${parts.join(" ")}></video>`;
};

const inlineColorModeImage = (text, attrs, ctx) => {
  const images = colorModeImages(attrs);
  if (images) {
    ctx.edit(":u-color-mode-image → light and dark <img>");
  }
  return images;
};

// Each inline component the codemod converts → its Blume form, or null to
// leave it as written (reported).
const INLINE_CONVERTERS = new Map([
  ["badge", inlineBadge],
  ["icon", inlineIcon],
  ["kbd", inlineKbd],
  ["u-badge", inlineBadge],
  ["u-color-mode-image", inlineColorModeImage],
  ["video", inlineVideo],
]);

const inlineComponent = (name, label, attrs, ctx, line) => {
  if (attrs === null) {
    ctx.review(line, `\`:${name}\` has attributes this can't read`);
    return null;
  }
  const text = label ? label.slice(1, -1) : undefined;
  return INLINE_CONVERTERS.get(name)(text, attrs, ctx, line);
};

// Inline components, spans, and attributes on one prose line.
const convertInline = (text, ctx, line) => {
  if (/\{\{.*\}\}/u.test(text.replaceAll(CODE_SPAN_RE, ""))) {
    ctx.review(
      line,
      "`{{ … }}` binding: substitute the value (Blume `variables` for shared ones)"
    );
  }
  const stripped = stripAttributes(text, ctx.edit);
  return outsideCode(stripped, (part) =>
    part.replaceAll(INLINE_RE, (match, name, label, attrs) => {
      if (!(label || attrs)) {
        return match;
      }
      const lower = name.toLowerCase();
      if (!INLINE_CONVERTERS.has(lower)) {
        ctx.review(
          line,
          `inline component \`:${name}\` left as written: read its SFC and convert it by hand`
        );
        return match;
      }
      const converted = inlineComponent(
        lower,
        label,
        parseAttrs(attrs),
        ctx,
        line
      );
      if (converted === null) {
        ctx.review(line, `\`:${name}\` left as written`);
        return match;
      }
      return converted;
    })
  );
};

// One fence opener's info string, or null to leave it as written.
const convertFenceInfo = (info, ctx, line) => {
  const m = /^(?<lang>[^\s[{]*)(?<rest>.*)$/u.exec(info);
  const { lang, rest } = m.groups;
  const glued = /^[[{]/u.test(rest);
  const label = /\[(?<label>.*)\]/u.exec(rest);
  // A `title="…"` is Blume's form already (this codemod's own output).
  if (!(label || glued) || /\btitle=["']/u.test(rest)) {
    return null;
  }
  const withoutLabel = label ? rest.replace(label[0], "") : rest;
  const highlight = /\{(?<lines>[^}]*)\}/u.exec(withoutLabel);
  const meta = (
    highlight ? withoutLabel.replace(highlight[0], "") : withoutLabel
  ).trim();
  const parts = [lang || "text"];
  if (label) {
    // MDC unescapes `\]` and the like in a label (`[pages/[slug\].vue]`).
    const title = titleToken(
      label.groups.label.replaceAll(/\\(?<char>[[\]{}().*+?^$|])/gu, "$<char>")
    );
    if (title === null) {
      ctx.review(line, "fence label holds both quote kinds: title it by hand");
      return null;
    }
    parts.push(title);
    ctx.edit("fence [label] → title");
  }
  if (highlight) {
    parts.push(`{${highlight.groups.lines}}`);
  }
  if (meta) {
    parts.push(meta);
  }
  return parts.join(" ");
};

// --- Rendering --------------------------------------------------------------------

// Output lines carry `src` (prose from the page, which the MDX pass may escape),
// the source line they came from, and `pad` for a blank line added around a
// converted block.
const out = (text, line, src = false) => ({ line, pad: false, src, text });
const pad = (line) => ({ line, pad: true, src: false, text: "" });

// Remove up to `n` leading whitespace characters from each line.
const shift = (rendered, n) =>
  n <= 0
    ? rendered
    : rendered.map((item) => ({
        ...item,
        text: item.text.slice(Math.min(n, leading(item.text))),
      }));

const trimBlank = (rendered) => {
  let start = 0;
  let end = rendered.length;
  while (start < end && rendered[start].text.trim() === "") {
    start += 1;
  }
  while (end > start && rendered[end - 1].text.trim() === "") {
    end -= 1;
  }
  return rendered.slice(start, end);
};

// A block's merged props: its YAML block, then its inline attributes, with
// kebab-case names (`default-value`) camel-cased as Vue reads them.
const propsOf = (block) =>
  Object.fromEntries(
    Object.entries({ ...block.props, ...block.attrs }).map(([key, value]) => [
      key.replaceAll(/-(?<char>[a-z])/gu, (_, char) => char.toUpperCase()),
      value,
    ])
  );

const calloutType = (block) => {
  const name = block.name.replace(/^prose-/u, "");
  if (CALLOUT_NAMES.has(name)) {
    return CALLOUT_NAMES.get(name);
  }
  if (name !== "callout") {
    return null;
  }
  const { color } = propsOf(block);
  return color === undefined
    ? "note"
    : (CALLOUT_COLORS.get(String(color)) ?? null);
};

const canonicalName = (block) => block.name.replace(/^prose-/u, "");

// The named slots a conversion reads, besides `default`.
const SLOTS = new Map([
  ["card", new Set(["default", "description", "title"])],
  ["code-preview", new Set(["code", "default"])],
]);

// Whether a slot holds one line of text and nothing else.
const oneLine = (entry, ctx) =>
  entry.children.every((child) => child.kind === "text") &&
  entry.children
    .flatMap((child) => child.lines)
    .filter((i) => ctx.lines[i].trim() !== "").length === 1;

// How a block converts, decided before rendering so callout fences can be
// lengthened around nested ones.
const classify = (block, ctx) => {
  if (block.attrs === null || block.props === null || block.label) {
    return "verbatim";
  }
  const name = canonicalName(block);
  if (calloutType(block) !== null) {
    if (block.sections.length > 1) {
      return "verbatim";
    }
    const { icon } = propsOf(block);
    const type = calloutType(block);
    if (icon === undefined) {
      return "directive";
    }
    const lucide = /^(?:i-lucide-|lucide:|lucide-)(?<name>[a-z0-9-]+)$/u.exec(
      String(icon)
    );
    if (lucide && DEFAULT_ICONS.get(type).has(lucide.groups.name)) {
      return "directive";
    }
    return lucide && (!ctx.lucide || ctx.lucide.has(lucide.groups.name))
      ? "callout-jsx"
      : "directive";
  }
  if (!CONVERTED.has(name)) {
    return "verbatim";
  }
  // A slot the conversion doesn't read would vanish: keep the block instead.
  const slots = SLOTS.get(name) ?? new Set(["default"]);
  const other = block.sections.find((entry) => !slots.has(entry.name));
  const title = block.sections.find((entry) => entry.name === "title");
  if (other || (title && !oneLine(title, ctx))) {
    block.reason = other
      ? `\`::${block.name}\` has a \`#${other.name}\` slot this can't map: convert it by hand`
      : `\`::${block.name}\` has a \`#title\` slot that isn't one line of text: convert it by hand`;
    return "verbatim";
  }
  return name;
};

// The longest run of colons that starts a line outside code, not counting
// an opener's (`:::name`).
const longestColonRun = (rendered) => {
  let longest = 0;
  let fence = null;
  for (const { text } of rendered) {
    if (fence) {
      fence = isFenceClose(text, fence) ? null : fence;
      continue;
    }
    const f = FENCE_RE.exec(text);
    if (f) {
      fence = { char: f.groups.marker[0], length: f.groups.marker.length };
      continue;
    }
    const run = /^[ \t]*(?<colons>:{3,})(?![A-Za-z])/u.exec(text);
    longest = Math.max(longest, run ? run.groups.colons.length : 0);
  }
  return longest;
};

const directiveDepth = (node) => {
  let depth = 0;
  for (const section of node.sections ?? []) {
    for (const child of section.children) {
      if (child.kind === "block") {
        const own = child.convert === "directive" ? 1 : 0;
        depth = Math.max(depth, own + directiveDepth(child));
      }
    }
  }
  return depth;
};

const markBlocks = (node, ctx) => {
  for (const section of node.sections ?? []) {
    for (const child of section.children) {
      if (child.kind === "block") {
        child.convert = classify(child, ctx);
        if (child.convert !== "verbatim") {
          markBlocks(child, ctx);
        }
      }
    }
  }
};

// Report props a conversion doesn't carry over. `class` and `ui` are styling.
const dropProps = (block, kept, ctx) => {
  for (const key of Object.keys(propsOf(block)).toSorted()) {
    if (kept.includes(key)) {
      continue;
    }
    if (key === "class" || key === "ui" || key === "id") {
      ctx.edit("styling props removed");
    } else {
      ctx.review(
        block.line,
        `\`::${block.name}\` prop \`${key}\` has no Blume equivalent and was dropped`
      );
    }
  }
};

// Wrap `inner` in JSX tags at the block's indentation, with blank lines so MDX
// parses the content as Markdown.
const wrapJsx = (block, open, inner, close) => {
  const ind = block.indentText;
  const body = trimBlank(inner);
  return [
    out(`${ind}${open}`, block.line),
    ...(body.length > 0
      ? [out("", block.line), ...body, out("", block.line)]
      : []),
    out(`${ind}${close}`, block.line),
  ];
};

// How far a block's content is indented past its opener.
const contentShift = (block, lines) => {
  let min = Number.POSITIVE_INFINITY;
  for (let i = block.start + 1; i < block.end; i += 1) {
    if (lines[i].trim() !== "") {
      min = Math.min(min, leading(lines[i]));
    }
  }
  return Number.isFinite(min) ? Math.max(0, min - block.indent) : 0;
};

const section = (block, name) =>
  block.sections.find((entry) => entry.name === name);

const renderSection = (block, name, ctx) => {
  const entry = section(block, name);
  if (!entry) {
    return [];
  }
  return shift(
    ctx.renderChildren(entry.children, ctx),
    contentShift(block, ctx.lines)
  );
};

// The text of a one-line slot, or null.
const slotText = (block, name, ctx) => {
  const lines = trimBlank(renderSection(block, name, ctx));
  return lines.length === 1 ? plainText(lines[0].text) : null;
};

// The non-blank source lines inside a block, after its props.
const sourceContent = (block, ctx) =>
  ctx.lines
    .slice(block.start + 1, block.end)
    .filter((line, i) => line.trim() !== "" && i >= block.propsLines);

const verbatim = (block, ctx, reason) => {
  const message = (() => {
    if (reason ?? block.reason) {
      return reason ?? block.reason;
    }
    const name = canonicalName(block);
    if (block.attrs === null || block.props === null) {
      return `\`::${block.name}\` has props this can't read: convert it by hand`;
    }
    if (name.startsWith("u-")) {
      return `\`::${block.name}\` is a Nuxt UI page component: rebuild it by hand (references/docus.md, Landing page)`;
    }
    if (name === "callout") {
      return `callout color \`${propsOf(block).color}\` has no Blume type: pick one by hand`;
    }
    if (LEGACY.has(name)) {
      return `\`::${block.name}\` is a Docus 1.x component: convert it by hand (references/docus.md, Docus 1.x)`;
    }
    if (calloutType(block) !== null || block.label) {
      return `\`::${block.name}\` has slots or a label this can't map: convert it by hand`;
    }
    return `\`::${block.name}\` isn't a Nuxt UI prose component: read its SFC (app/components/content/ or a module) and convert it by hand`;
  })();
  ctx.review(block.line, `${message}. It's left as written`);
  const lines = [];
  for (let i = block.start; i <= block.end; i += 1) {
    lines.push(out(ctx.lines[i], ctx.toLine(i)));
  }
  return lines;
};

const renderCallout = (block, ctx) => {
  const type = calloutType(block);
  const props = propsOf(block);
  if (props.to) {
    ctx.review(
      block.line,
      `callout linked to \`${props.to}\`: add the link to its text if it isn't there`
    );
  }
  if (props.icon !== undefined && block.convert === "directive") {
    const name = /^(?:i-lucide-|lucide:|lucide-)(?<name>[a-z0-9-]+)$/u.exec(
      String(props.icon)
    )?.groups.name;
    if (!(name && DEFAULT_ICONS.get(type).has(name))) {
      lucideName(props.icon, ctx, block.line, "callout");
    }
  }
  dropProps(block, ["color", "icon", "target", "to"], ctx);
  ctx.mdx();
  const inner = renderSection(block, "default", ctx);
  if (block.convert === "callout-jsx") {
    const icon = lucideName(props.icon, ctx, block.line, "callout");
    ctx.edit("callout → <Callout> with its icon");
    return wrapJsx(
      block,
      `<Callout type="${type}" icon="${icon}">`,
      inner,
      "</Callout>"
    );
  }
  ctx.edit(`callout → :::${type}`);
  // Longer than any colon line inside, a nested directive's or a stray one
  // MDC showed as text, which would otherwise close this one early.
  const colons = ":".repeat(
    Math.max(3 + directiveDepth(block), longestColonRun(inner) + 1)
  );
  return [
    out(`${block.indentText}${colons}${type}`, block.line),
    ...trimBlank(inner),
    out(`${block.indentText}${colons}`, block.line),
  ];
};

const renderCard = (block, ctx) => {
  const props = propsOf(block);
  // Nuxt UI renders a `#title` slot in place of the `title` prop.
  const title = slotText(block, "title", ctx) ?? props.title;
  const attrs = [];
  if (title) {
    attrs.push(jsxAttr("title", title));
  }
  if (props.to) {
    attrs.push(jsxAttr("href", props.to));
  }
  if (props.icon) {
    attrs.push(
      jsxAttr(
        "icon",
        lucideName(props.icon, ctx, block.line, "card") ?? props.icon
      )
    );
  }
  if (props.color) {
    ctx.edit("card color removed");
  }
  dropProps(
    block,
    ["color", "description", "icon", "target", "title", "to"],
    ctx
  );
  const description = [
    ...(props.description
      ? [out(`${block.indentText}${props.description}`, block.line, true)]
      : []),
    ...renderSection(block, "description", ctx),
  ];
  if (trimBlank(description).length > 0) {
    ctx.review(
      block.line,
      "card description: Nuxt UI's prose card renders neither the `description` prop nor a `#description` slot, so the live page likely didn't show this text. It's now the card's body: check the live page, and delete it if it never showed"
    );
  }
  const body = [
    ...trimBlank(description),
    ...(description.length > 0 ? [out("", block.line)] : []),
    ...renderSection(block, "default", ctx),
  ];
  ctx.edit("card → <Card>");
  ctx.mdx();
  return wrapJsx(
    block,
    `<Card${attrs.length > 0 ? ` ${attrs.join(" ")}` : ""}>`,
    body,
    "</Card>"
  );
};

const renderField = (block, ctx) => {
  const props = propsOf(block);
  const attrs = [
    jsxAttr("name", plainText(String(props.name ?? ""))),
    ...(props.type ? [jsxAttr("type", props.type)] : []),
    ...(props.required === true || props.required === "true"
      ? ["required"]
      : []),
  ];
  dropProps(block, ["description", "name", "required", "type"], ctx);
  const body = [
    ...(props.description
      ? [
          out(`${block.indentText}${props.description}`, block.line, true),
          out("", block.line),
        ]
      : []),
    ...renderSection(block, "default", ctx),
  ];
  ctx.edit("field → <ResponseField>");
  ctx.mdx();
  return wrapJsx(
    block,
    `<ResponseField ${attrs.join(" ")}>`,
    body,
    "</ResponseField>"
  );
};

// A code group that only repeats one install command per package manager.
const packageInstall = (block, ctx) => {
  const entry = section(block, "default");
  if (
    block.sections.length > 1 ||
    entry.children.some((c) => c.kind !== "text")
  ) {
    return null;
  }
  const lines = entry.children.flatMap((child) =>
    child.lines.map((i) => ctx.lines[i])
  );
  const commands = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() === "") {
      continue;
    }
    const f = FENCE_RE.exec(lines[i]);
    const label = f ? /\[(?<label>[^\]]*)\]/u.exec(f.groups.info) : null;
    const lang = f ? /^[^\s[{]*/u.exec(f.groups.info)[0] : "";
    if (!(f && label && SHELL_LANGS.has(lang))) {
      return null;
    }
    const manager = label.groups.label.toLowerCase();
    const command =
      /^[ \t]*(?<pm>bun|npm|pnpm|yarn)[ \t]+(?:add|install|i)[ \t]+(?<args>\S.*?)[ \t]*$/u.exec(
        lines[i + 1] ?? ""
      );
    if (
      !(
        PACKAGE_MANAGERS.has(manager) &&
        command?.groups.pm === manager &&
        lines[i + 2] !== undefined &&
        isFenceClose(lines[i + 2], {
          char: f.groups.marker[0],
          length: f.groups.marker.length,
        })
      )
    ) {
      return null;
    }
    commands.push(command.groups.args);
    i += 2;
  }
  if (commands.length < 2 || new Set(commands).size !== 1) {
    return null;
  }
  ctx.mdx();
  ctx.edit("code-group → package-install fence");
  const ind = block.indentText;
  return [
    out(`${ind}\`\`\`package-install`, block.line),
    out(`${ind}npm install ${commands[0]}`, block.line),
    out(`${ind}\`\`\``, block.line),
  ];
};

const renderCodeGroup = (block, ctx) => {
  const install = packageInstall(block, ctx);
  if (install) {
    return install;
  }
  dropProps(block, ["defaultValue", "sync"], ctx);
  if (canonicalName(block) === "code-tree") {
    ctx.review(
      block.line,
      "code-tree → <CodeGroup>: the file-tree view is gone (a <FileTree> before it can show the layout)"
    );
  }
  ctx.edit(`${canonicalName(block)} → <CodeGroup>`);
  ctx.mdx();
  return wrapJsx(
    block,
    "<CodeGroup>",
    renderSection(block, "default", ctx),
    "</CodeGroup>"
  );
};

const renderCodeCollapse = (block, ctx) => {
  dropProps(block, ["closeText", "icon", "name", "openText"], ctx);
  const rendered = renderSection(block, "default", ctx);
  let fence = null;
  const lines = rendered.map((item) => {
    if (fence) {
      fence = isFenceClose(item.text, fence) ? null : fence;
      return item;
    }
    const f = FENCE_RE.exec(item.text);
    if (!f) {
      return item;
    }
    fence = { char: f.groups.marker[0], length: f.groups.marker.length };
    const info = f.groups.info.trim() === "" ? "text" : f.groups.info.trimEnd();
    return {
      ...item,
      text: `${f.groups.indent}${f.groups.marker}${info} expandable`,
    };
  });
  ctx.edit("code-collapse → expandable fence");
  return trimBlank(lines);
};

const renderSteps = (block, ctx) => {
  const props = propsOf(block);
  const level = Number(props.level ?? 3);
  dropProps(block, ["level"], ctx);
  const marker = new RegExp(`^[ \\t]{0,3}#{${level}}[ \\t]`, "u");
  const offset = contentShift(block, ctx.lines);
  const steps = [];
  const before = [];
  let fence = null;
  for (const child of section(block, "default").children) {
    if (child.kind !== "text") {
      (steps.at(-1) ?? before).push(child);
      continue;
    }
    for (const i of child.lines) {
      const text = ctx.lines[i];
      if (fence) {
        fence = isFenceClose(text, fence) ? null : fence;
      } else {
        const f = FENCE_RE.exec(text);
        if (f) {
          fence = { char: f.groups.marker[0], length: f.groups.marker.length };
        } else if (
          marker.test(
            text.slice(Math.min(block.indent + offset, leading(text)))
          )
        ) {
          steps.push([]);
        }
      }
      const target = steps.at(-1) ?? before;
      const last = target.at(-1);
      if (last?.kind === "text") {
        last.lines.push(i);
      } else {
        target.push({ kind: "text", lines: [i] });
      }
    }
  }
  if (steps.length === 0) {
    return verbatim(
      block,
      ctx,
      `\`::steps\` has no level-${level} headings: convert it by hand`
    );
  }
  const head = trimBlank(shift(ctx.renderChildren(before, ctx), offset));
  if (head.length > 0) {
    ctx.review(
      block.line,
      "content before the first step heading was kept above <Steps>"
    );
  }
  ctx.mdx();
  ctx.edit("steps → <Steps>");
  ctx.edit("step heading → <Step>", steps.length);
  const ind = block.indentText;
  const body = steps.flatMap((step) => [
    ...wrapJsx(
      block,
      "<Step>",
      shift(ctx.renderChildren(step, ctx), offset),
      "</Step>"
    ),
    out("", block.line),
  ]);
  return [
    ...head,
    ...(head.length > 0 ? [out("", block.line)] : []),
    out(`${ind}<Steps>`, block.line),
    out("", block.line),
    ...trimBlank(body),
    out("", block.line),
    out(`${ind}</Steps>`, block.line),
  ];
};

const renderTabs = (block, ctx) => {
  const props = propsOf(block);
  const attrs = [];
  if (props.sync) {
    attrs.push(jsxAttr("syncKey", props.sync));
  }
  if (/^\d+$/u.test(String(props.defaultValue ?? ""))) {
    attrs.push(`defaultTabIndex={${props.defaultValue}}`);
  }
  dropProps(block, ["defaultValue", "hash", "sync"], ctx);
  const stray = section(block, "default").children.some(
    (child) =>
      (child.kind === "block" && canonicalName(child) !== "tabs-item") ||
      (child.kind === "text" &&
        child.lines.some((i) => ctx.lines[i].trim() !== ""))
  );
  if (stray) {
    ctx.review(block.line, "`::tabs` holds content outside its items");
  }
  ctx.mdx();
  ctx.edit("tabs → <Tabs>");
  return wrapJsx(
    block,
    `<Tabs${attrs.length > 0 ? ` ${attrs.join(" ")}` : ""}>`,
    renderSection(block, "default", ctx),
    "</Tabs>"
  );
};

// `tabs-item` and `accordion-item`: a `label`, an optional icon, the body.
const renderItem = (block, ctx, tag) => {
  const props = propsOf(block);
  const attrs = [jsxAttr("title", String(props.label ?? ""))];
  if (props.icon) {
    attrs.push(
      jsxAttr(
        "icon",
        lucideName(props.icon, ctx, block.line, `\`::${block.name}\``) ??
          props.icon
      )
    );
  }
  if (tag === "AccordionItem" && props.description) {
    attrs.push(jsxAttr("description", props.description));
  }
  dropProps(
    block,
    tag === "AccordionItem"
      ? ["description", "icon", "label"]
      : ["icon", "label"],
    ctx
  );
  ctx.mdx();
  ctx.edit(`${canonicalName(block)} → <${tag}>`);
  return wrapJsx(
    block,
    `<${tag} ${attrs.join(" ")}>`,
    renderSection(block, "default", ctx),
    `</${tag}>`
  );
};

const renderCodePreview = (block, ctx) => {
  dropProps(block, [], ctx);
  ctx.mdx();
  if (!section(block, "code")) {
    ctx.edit("code-preview without code → its preview");
    return trimBlank(renderSection(block, "default", ctx));
  }
  ctx.edit("code-preview → Preview and Code tabs");
  const ind = block.indentText;
  return [
    out(`${ind}<Tabs>`, block.line),
    out("", block.line),
    ...wrapJsx(
      block,
      '<Tab title="Preview">',
      renderSection(block, "default", ctx),
      "</Tab>"
    ),
    out("", block.line),
    ...wrapJsx(
      block,
      '<Tab title="Code">',
      renderSection(block, "code", ctx),
      "</Tab>"
    ),
    out("", block.line),
    out(`${ind}</Tabs>`, block.line),
  ];
};

const renderPrompt = (block, ctx) => {
  const props = propsOf(block);
  const requested = Array.isArray(props.actions) ? props.actions : [];
  const actions = ["copy", ...(requested.includes("cursor") ? ["cursor"] : [])];
  for (const action of requested) {
    if (action !== "copy" && action !== "cursor") {
      ctx.edit(`prompt action \`${action}\` removed`);
    }
  }
  if (props.icon) {
    ctx.edit("prompt icon removed");
  }
  dropProps(block, ["actions", "description", "icon"], ctx);
  const attrs = [jsxAttr("description", String(props.description ?? ""))];
  if (actions.length > 1) {
    attrs.push(
      `actions={[${actions.map((action) => JSON.stringify(action)).join(", ")}]}`
    );
  }
  ctx.mdx();
  ctx.edit("prompt → <Prompt>");
  return wrapJsx(
    block,
    `<Prompt ${attrs.join(" ")}>`,
    renderSection(block, "default", ctx),
    "</Prompt>"
  );
};

const renderCollapsible = (block, ctx) => {
  const props = propsOf(block);
  const title = `${props.openText ?? "Show"} ${props.name ?? "properties"}`;
  dropProps(block, ["closeText", "icon", "name", "openText"], ctx);
  ctx.mdx();
  ctx.edit("collapsible → <Expandable>");
  return wrapJsx(
    block,
    `<Expandable ${jsxAttr("title", title)}>`,
    renderSection(block, "default", ctx),
    "</Expandable>"
  );
};

const renderBadge = (block, ctx) => {
  const lines = sourceContent(block, ctx);
  if (lines.length !== 1 || block.sections.length > 1) {
    return verbatim(
      block,
      ctx,
      "`::badge` holds more than one line: convert it by hand"
    );
  }
  const variant = BADGE_VARIANTS.get(String(propsOf(block).color ?? ""));
  dropProps(block, ["color"], ctx);
  ctx.mdx();
  ctx.edit("badge → <Badge>");
  return [
    out(
      `${block.indentText}<Badge${variant ? ` variant="${variant}"` : ""}>${convertInline(lines[0].trim(), ctx, block.line)}</Badge>`,
      block.line,
      true
    ),
  ];
};

// A block written for an inline component (`::icon{name}` alone).
const renderInlineBlock = (block, ctx) => {
  const empty =
    sourceContent(block, ctx).length === 0 && block.sections.length === 1;
  const converted = empty
    ? inlineComponent(
        canonicalName(block),
        undefined,
        block.attrs,
        ctx,
        block.line
      )
    : null;
  if (converted === null) {
    return verbatim(
      block,
      ctx,
      `\`::${block.name}\` can't be converted as written: convert it by hand`
    );
  }
  return [out(`${block.indentText}${converted}`, block.line, true)];
};

const renderWrapper = (block, ctx) => {
  const inner = trimBlank(renderSection(block, "default", ctx));
  ctx.edit(
    inner.length === 0
      ? `empty \`::${block.name}\` removed`
      : `\`::${block.name}\` wrapper removed`
  );
  return shift(inner, 0);
};

// A container rendered as one JSX component around its content.
const renderContainer = (tag, kept) => (block, ctx) => {
  dropProps(block, kept, ctx);
  ctx.mdx();
  ctx.edit(`${canonicalName(block)} → <${tag}>`);
  return wrapJsx(
    block,
    `<${tag}>`,
    renderSection(block, "default", ctx),
    `</${tag}>`
  );
};

const renderFieldGroup = (block, ctx) => {
  ctx.edit("field-group wrapper removed");
  return trimBlank(renderSection(block, "default", ctx));
};

// Each conversion kind `classify` picks → its renderer.
const RENDERERS = new Map([
  ["accordion", renderContainer("Accordion", ["type"])],
  ["accordion-item", (block, ctx) => renderItem(block, ctx, "AccordionItem")],
  ["badge", renderBadge],
  ["callout-jsx", renderCallout],
  ["card", renderCard],
  ["card-group", renderContainer("CardGroup", [])],
  ["code-collapse", renderCodeCollapse],
  ["code-group", renderCodeGroup],
  ["code-preview", renderCodePreview],
  ["code-tree", renderCodeGroup],
  ["collapsible", renderCollapsible],
  ["directive", renderCallout],
  ["div", renderWrapper],
  ["field", renderField],
  ["field-group", renderFieldGroup],
  ["prompt", renderPrompt],
  ["steps", renderSteps],
  ["tabs", renderTabs],
  ["tabs-item", (block, ctx) => renderItem(block, ctx, "Tab")],
  ["u-container", renderWrapper],
  ["verbatim", verbatim],
]);

const renderBlock = (block, ctx) =>
  (RENDERERS.get(block.convert) ?? renderInlineBlock)(block, ctx);

// Pad a converted block with blank lines so it never runs into a paragraph.
const pushBlock = (lines, rendered) => {
  if (rendered.length === 0) {
    return;
  }
  if (lines.length > 0 && lines.at(-1).text.trim() !== "") {
    lines.push(pad(rendered[0].line));
  }
  lines.push(...rendered, pad(rendered.at(-1).line));
};

// A section's children, rendered: blocks converted, prose lines converted inline.
const renderChildren = (children, ctx) => {
  const lines = [];
  for (const child of children) {
    if (child.kind === "block") {
      pushBlock(lines, renderBlock(child, ctx));
      continue;
    }
    let fence = null;
    let math = false;
    for (const i of child.lines) {
      const text = ctx.lines[i];
      const line = ctx.toLine(i);
      if (fence) {
        fence = isFenceClose(text, fence) ? null : fence;
        lines.push(out(text, line, true));
        continue;
      }
      if (math || MATH_OPEN_RE.test(text)) {
        math = math ? !MATH_CLOSE_RE.test(text) : true;
        lines.push(out(text, line, true));
        continue;
      }
      const f = FENCE_RE.exec(text);
      if (f) {
        fence = { char: f.groups.marker[0], length: f.groups.marker.length };
        const info = convertFenceInfo(f.groups.info, ctx, line);
        lines.push(
          out(
            info === null
              ? text
              : `${f.groups.indent}${f.groups.marker}${info}`,
            line,
            true
          )
        );
        continue;
      }
      if (text.trim() === "" && lines.at(-1)?.pad) {
        continue;
      }
      lines.push(out(convertInline(text, ctx, line), line, true));
    }
  }
  return lines;
};

// --- MDX safety ---------------------------------------------------------------------

// Where a tag that opened earlier ends in `text`: the index of its `>`, or -1.
// `state.quote` carries an open attribute quote from line to line.
const tagEnd = (text, state) => {
  for (let j = 0; j < text.length; j += 1) {
    const c = text[j];
    if (state.quote) {
      state.quote = c === state.quote ? null : state.quote;
    } else if (c === '"' || c === "'") {
      state.quote = c;
    } else if (c === ">") {
      return j;
    }
  }
  return -1;
};

// A tag at `s[i]` (`<name …>` or `</name>`): its end index and name, or null.
const readTag = (s, i) => {
  const m = /^<(?<close>\/)?(?<name>[A-Za-z][\w.-]*)/u.exec(s.slice(i));
  if (!m) {
    return null;
  }
  let quote = null;
  for (let j = i + m[0].length; j < s.length; j += 1) {
    const c = s[j];
    if (quote) {
      quote = c === quote ? null : quote;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ">") {
      return {
        close: m.groups.close === "/",
        end: j,
        name: m.groups.name,
        selfClosing: s[j - 1] === "/",
      };
    }
  }
  return null;
};

// Case matters, as in JSX: `<input>` is HTML, but `useTool<Input>()` names a
// component MDX would look up, so it's text.
const isKnownTag = (name) => COMPONENTS.has(name) || HTML_TAGS.has(name);

// A real tag at `s[i]`, kept (or closed, for a void tag); null otherwise,
// with a review line when it looked like markup.
const keepTag = (s, i, ctx, line, rest) => {
  const tag = readTag(s, i);
  if (!tag) {
    return null;
  }
  const raw = s.slice(i, tag.end + 1);
  const closes = new RegExp(`</${tag.name.replaceAll(".", "\\.")}\\s*>`, "u");
  const closed =
    tag.close || tag.selfClosing || closes.test(s.slice(tag.end) + rest);
  const known = isKnownTag(tag.name);
  if (known && closed) {
    return { end: tag.end, text: raw };
  }
  if (known && VOID_TAGS.has(tag.name.toLowerCase())) {
    ctx.edit("void tag closed (<br />)");
    return { end: tag.end, text: `${raw.slice(0, -1).trimEnd()} />` };
  }
  if (
    /^(?:script|style|template)$/iu.test(tag.name) ||
    (closed && !tag.close)
  ) {
    ctx.review(
      line,
      `\`<${tag.name}>\` isn't a Blume component or an HTML tag MDX can hold: it's now text`
    );
  } else if (known && !tag.close) {
    ctx.review(line, `\`<${tag.name}>\` has no closing tag: it's now text`);
  }
  return null;
};

// What a `<` at `s[i]` becomes: a comment, a link, a kept tag, or `&lt;`.
const angle = (s, i, ctx, line, rest) => {
  if (s.startsWith("<!--", i)) {
    const end = s.indexOf("-->", i + 4);
    if (end !== -1) {
      ctx.edit("HTML comment → {/* */}");
      return { end: end + 2, text: `{/*${s.slice(i + 4, end)}*/}` };
    }
    ctx.review(line, "an HTML comment spans lines: rewrite it as {/* … */}");
  }
  const autolink = /^<(?<url>(?:https?:\/\/|mailto:)[^\s<>]+)>/u.exec(
    s.slice(i)
  );
  if (autolink) {
    ctx.edit("autolink → link");
    const { url } = autolink.groups;
    return {
      end: i + autolink[0].length - 1,
      text: `[${url.replace(/^mailto:/u, "")}](${url})`,
    };
  }
  const tag = keepTag(s, i, ctx, line, rest);
  if (tag) {
    return tag;
  }
  // A known tag whose `>` is on a later line (`<iframe` then its attributes)
  // stays a tag: the lines up to its `>` pass through as written.
  const open = /^<(?<name>[A-Za-z][\w.-]*)(?=\s|$)/u.exec(s.slice(i));
  if (open && isKnownTag(open.groups.name) && readTag(s, i) === null) {
    const state = { name: open.groups.name, quote: null };
    tagEnd(s.slice(i + open[0].length), state);
    ctx.openTag = state;
    ctx.edit("tag across lines kept");
    return { end: s.length - 1, text: s.slice(i) };
  }
  if (/^\S/u.test(s.slice(i + 1, i + 2))) {
    ctx.edit("`<` escaped as &lt;");
    return { end: i, text: "&lt;" };
  }
  return { end: i, text: "<" };
};

// Escape what MDX can't parse in one prose segment (no inline code in it).
const escapeSegment = (s, ctx, line, rest) => {
  let result = "";
  let start = 0;
  if (ctx.openTag) {
    const end = tagEnd(s, ctx.openTag);
    if (end === -1) {
      return s;
    }
    const closeVoid =
      VOID_TAGS.has(ctx.openTag.name.toLowerCase()) && s[end - 1] !== "/";
    result = closeVoid
      ? `${s.slice(0, end).trimEnd()} />`
      : s.slice(0, end + 1);
    start = end + 1;
    ctx.openTag = null;
  }
  for (let i = start; i < s.length; i += 1) {
    const c = s[i];
    if (c === "\\") {
      result += s.slice(i, i + 2);
      i += 1;
    } else if (c === "{" || c === "}") {
      ctx.edit("`{`/`}` escaped");
      result += `\\${c}`;
    } else if (c === "<") {
      const converted = angle(s, i, ctx, line, rest);
      result += converted.text;
      i = converted.end;
    } else {
      result += c;
    }
  }
  return result;
};

// Apply `fn` to the text outside `$$…$$` math, whose braces are LaTeX.
const outsideMath = (text, fn) =>
  text
    .split(/(?<math>\$\$[^$]+\$\$)/u)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join("");

// Make the page's own prose MDX-safe, skipping code, generated tags, and
// blocks left as written.
const mdxPass = (lines, ctx) => {
  let fence = null;
  let math = false;
  const texts = lines.map((item) => item.text);
  return lines.map((item, index) => {
    if (fence) {
      fence = isFenceClose(item.text, fence) ? null : fence;
      return item;
    }
    if (math || MATH_OPEN_RE.test(item.text)) {
      math = math ? !MATH_CLOSE_RE.test(item.text) : true;
      return item;
    }
    const f = FENCE_RE.exec(item.text);
    if (f) {
      fence = { char: f.groups.marker[0], length: f.groups.marker.length };
      return item;
    }
    if (!item.src) {
      return item;
    }
    const rest = texts.slice(index + 1).join("\n");
    return {
      ...item,
      text: outsideCode(item.text, (part) =>
        outsideMath(part, (prose) => escapeSegment(prose, ctx, item.line, rest))
      ),
    };
  });
};

// --- Frontmatter --------------------------------------------------------------------

// Top-level frontmatter keys, each with its lines.
const fmBlocks = (fm) => {
  const blocks = [];
  for (const line of fm) {
    const key = /^(?<key>[A-Za-z_][\w-]*):(?<value>.*)$/u.exec(line);
    if (key) {
      blocks.push({
        key: key.groups.key,
        lines: [line],
        value: key.groups.value.trim(),
      });
    } else if (blocks.length > 0 && line.trim() !== "") {
      blocks.at(-1).lines.push(line);
    } else {
      blocks.push({ key: null, lines: [line], value: "" });
    }
  }
  return blocks;
};

const convertNavigation = (block, ctx) => {
  if (block.value === "false") {
    ctx.edit("navigation: false → sidebar.hidden");
    return ["  hidden: true"];
  }
  if (block.value !== "" && block.value !== "true") {
    ctx.review(
      1,
      "`navigation` is written inline: map it to `sidebar` by hand"
    );
    return null;
  }
  const lines = [];
  for (const line of block.lines.slice(1)) {
    const m = /^[ \t]+(?<key>[\w-]+):[ \t]*(?<value>.*)$/u.exec(line);
    if (!m) {
      ctx.review(1, "`navigation` has a value this can't read");
      return null;
    }
    const { key, value } = m.groups;
    if (key === "title") {
      ctx.edit("navigation.title → sidebar.label");
      lines.push(`  label: ${value}`);
    } else if (key === "icon") {
      const icon = lucideName(unquote(value), ctx, 1, "`navigation.icon`");
      ctx.edit("navigation.icon → sidebar.icon");
      lines.push(`  icon: ${icon ?? value}`);
    } else if (key === "description") {
      ctx.edit("navigation.description removed");
    } else {
      ctx.review(1, `\`navigation.${key}\` has no Blume equivalent: dropped`);
    }
  }
  return lines;
};

// `links` items → `related` entries (`- "Label": /to`).
const convertLinks = (block, ctx) => {
  if (block.value !== "" && block.value !== "[]") {
    ctx.review(1, "`links` is written inline: map it to `related` by hand");
    return null;
  }
  const items = [];
  for (const line of block.lines.slice(1)) {
    const item = /^[ \t]*-[ \t]+(?<key>[\w-]+):[ \t]*(?<value>.*)$/u.exec(line);
    const field = /^[ \t]+(?<key>[\w-]+):[ \t]*(?<value>.*)$/u.exec(line);
    if (item) {
      items.push({ [item.groups.key]: unquote(item.groups.value) });
    } else if (field && items.length > 0) {
      items.at(-1)[field.groups.key] = unquote(field.groups.value);
    } else {
      ctx.review(1, "`links` has a value this can't read: map it by hand");
      return null;
    }
  }
  const lines = [];
  for (const item of items) {
    if (!item.to) {
      ctx.review(1, "a `links` item has no `to`: dropped");
      continue;
    }
    if (!/^(?:\/|https?:\/\/)/u.test(item.to)) {
      ctx.review(
        1,
        `\`links\` target \`${item.to}\`: Blume's \`related\` takes a root-relative path or a URL, so rewrite it`
      );
    }
    lines.push(
      item.label
        ? `  - ${JSON.stringify(item.label)}: ${yamlScalar(item.to)}`
        : `  - ${yamlScalar(item.to)}`
    );
  }
  if (lines.length > MAX_RELATED) {
    ctx.review(
      1,
      `\`links\` has ${lines.length} entries and Blume's \`related\` holds at most ${MAX_RELATED}: keep the ones that matter, and link the rest from the page`
    );
  }
  ctx.edit("links → related", lines.length);
  return lines;
};

const convertSeo = (block, ctx) =>
  block.lines.map((line, i) => {
    const m = /^(?<indent>[ \t]+)(?<key>[\w-]+):(?<value>.*)$/u.exec(line);
    if (i === 0 || !m) {
      return line;
    }
    if (m.groups.key === "ogImage") {
      ctx.edit("seo.ogImage → seo.image");
      return `${m.groups.indent}image:${m.groups.value}`;
    }
    if (!SEO_KEYS.has(m.groups.key)) {
      ctx.review(
        1,
        `\`seo.${m.groups.key}\` isn't a Blume key: map or drop it`
      );
    }
    return line;
  });

// A converted key's lines under its new name: none when nothing carried over,
// the original lines when the conversion gave up (null).
const replacement = (block, key, lines) => {
  if (lines === null) {
    return block.lines;
  }
  return lines.length > 0 ? [`${key}:`, ...lines] : [];
};

const convertFrontmatter = (fm, ctx) => {
  const blocks = fmBlocks(fm);
  const output = [];
  const keys = new Set(blocks.map((block) => block.key));
  for (const block of blocks) {
    switch (block.key) {
      case "navigation": {
        if (keys.has("sidebar")) {
          ctx.review(1, "both `navigation` and `sidebar`: merge them by hand");
          output.push(...block.lines);
          break;
        }
        output.push(
          ...replacement(block, "sidebar", convertNavigation(block, ctx))
        );
        break;
      }
      case "links": {
        output.push(...replacement(block, "related", convertLinks(block, ctx)));
        break;
      }
      case "seo": {
        output.push(...convertSeo(block, ctx));
        break;
      }
      case "sitemap": {
        ctx.review(
          1,
          "`sitemap` removed: Blume has no sitemap-only switch; add `seo: { noindex: true }` if the page should leave search engines"
        );
        break;
      }
      case "icon": {
        ctx.review(
          1,
          "top-level `icon`: Docus ignored it, and Blume shows it in the sidebar; make it a Lucide name or remove it"
        );
        output.push(...block.lines);
        break;
      }
      case "layout": {
        if (block.value === "docs") {
          ctx.edit("layout: docs removed");
        } else {
          ctx.review(
            1,
            `\`layout: ${block.value}\`: pick a Blume \`mode\` and remove it`
          );
          output.push(...block.lines);
        }
        break;
      }
      default: {
        if (block.key !== null && !BLUME_KEYS.has(block.key)) {
          ctx.review(
            1,
            `frontmatter \`${block.key}\` isn't a Blume key: map or drop it`
          );
        }
        output.push(...block.lines);
      }
    }
  }
  return output;
};

// A body `# H1` → frontmatter `title`, when the page has none.
const moveH1 = (fm, body, offset, ctx) => {
  const first = body.findIndex((line) => line.trim() !== "");
  const h1 =
    first === -1
      ? null
      : /^#[ \t]+(?<text>.+?)[ \t]*#*[ \t]*$/u.exec(body[first]);
  if (!h1) {
    return { body, fm };
  }
  const hasTitle = fm.some((line) => line.startsWith("title:"));
  const { text } = h1.groups;
  if (hasTitle || /[`*_[\]<{]/u.test(text)) {
    ctx.review(
      offset + first + 1,
      hasTitle
        ? "body H1 beside a frontmatter title: Docus showed both, so delete one"
        : "body H1 has inline markup: move it into `title` by hand"
    );
    return { body, fm };
  }
  ctx.edit("body H1 → title");
  const rest = body.slice(first + 1);
  while (rest.length > 0 && rest[0].trim() === "") {
    rest.shift();
  }
  // One blank line between the frontmatter and what follows.
  return {
    body: rest.length > 0 ? ["", ...rest] : rest,
    fm: [`title: ${yamlScalar(text)}`, ...fm],
  };
};

// --- Files ---------------------------------------------------------------------------

const SKIP_DIRS = new Set(["node_modules", "public"]);

const collectFiles = (root) => {
  const pages = [];
  const navs = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).toSorted()) {
      const abs = path.join(dir, name);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (statSync(abs).isDirectory()) {
        if (!(name.startsWith(".") || SKIP_DIRS.has(name))) {
          walk(abs);
        }
      } else if (name === ".navigation.yml" || name === ".navigation.yaml") {
        navs.push(rel);
      } else if (/\.mdx?$/u.test(name)) {
        pages.push(rel);
      }
    }
  };
  walk(root);
  return { navs, pages };
};

const newReport = () => {
  const edits = new Map();
  const reviews = [];
  return {
    edit: (kind, count = 1) => {
      if (count > 0) {
        edits.set(kind, (edits.get(kind) ?? 0) + count);
      }
    },
    edits,
    review: (line, message) => reviews.push({ line, message }),
    reviews,
  };
};

// Route segments Docus and Blume map differently.
const reviewRoute = (file, report) => {
  for (const segment of file.replace(/\.mdx?$/u, "").split("/")) {
    if (/^\d+[-_]/u.test(segment)) {
      report.review(
        1,
        `\`${segment}\`: Docus keeps a dash or underscore prefix in the URL and Blume strips it; pin \`slug\` or add a redirect`
      );
    } else if (/^\d+(?:\.\d+)*\.(?:\d+|x)$/u.test(segment)) {
      report.review(
        1,
        `\`${segment}\`: Docus keeps a version name whole and Blume strips \`${segment.split(".")[0]}.\`; pin \`slug\``
      );
    } else if (segment.startsWith("_")) {
      report.review(
        1,
        `\`${segment}\`: Docus publishes \`_\` files and Blume excludes them; rename it`
      );
    } else if (/[A-Z\s]/u.test(segment)) {
      report.review(
        1,
        `\`${segment}\`: Docus lowercased and slugified this name in the URL; rename the file`
      );
    }
  }
};

const convertPage = (file, project) => {
  const report = newReport();
  const before = readFileSync(path.join(project.root, file), "utf-8");
  reviewRoute(file, report);
  if (file.endsWith(".mdx")) {
    return { before, file, report, skipped: true };
  }
  // Pages checked out on Windows have CRLF endings: convert on LF, write CRLF.
  const crlf = before.includes("\r\n");
  const source = crlf ? before.replaceAll("\r\n", "\n") : before;
  const all = source.split("\n");
  let fm = null;
  let bodyStart = 0;
  if (all[0] === "---") {
    const end = all.indexOf("---", 1);
    if (end !== -1) {
      fm = all.slice(1, end);
      bodyStart = end + 1;
    }
  }
  let mdx = false;
  const ctx = {
    edit: report.edit,
    lucide: project.lucide,
    mdx: () => {
      mdx = true;
    },
    renderChildren,
    review: report.review,
  };
  let fmOut = fm === null ? null : convertFrontmatter(fm, ctx);
  const moved = moveH1(fmOut ?? [], all.slice(bodyStart), bodyStart, ctx);
  const removed = all.length - bodyStart - moved.body.length;
  fmOut = fm === null && moved.fm.length === 0 ? null : moved.fm;
  ctx.lines = moved.body;
  ctx.toLine = (i) => bodyStart + removed + i + 1;
  const tree = parseBody(moved.body, ctx.toLine, report.review);
  markBlocks(tree, ctx);
  let lines = renderChildren(tree.sections[0].children, ctx);
  if (mdx) {
    lines = mdxPass(lines, ctx);
  }
  const text = [
    ...(fmOut === null ? [] : ["---", ...fmOut, "---"]),
    ...lines.map((item) => item.text),
  ].join("\n");
  const lf = source.endsWith("\n") && !text.endsWith("\n") ? `${text}\n` : text;
  const after = crlf ? lf.replaceAll("\n", "\r\n") : lf;
  return { after, before, file, mdx, report };
};

const metaFor = (title, icon) => {
  const fields = [
    ...(title ? [`  title: ${JSON.stringify(title)},`] : []),
    ...(icon ? [`  icon: ${JSON.stringify(icon)},`] : []),
  ];
  return [
    'import { defineMeta } from "blume";',
    "",
    "export default defineMeta({",
    ...fields,
    "});",
    "",
  ].join("\n");
};

// Why a `.navigation.yml` line can't move to `meta.ts`.
const navReview = (key, value, line) =>
  key === "navigation" && value === "false"
    ? "`navigation: false` hides the folder: set `sidebar.hidden: true` on each of its pages"
    : `\`${line.trim()}\` has no meta.ts equivalent`;

// A `.navigation.yml`'s `title` and `icon`, and whether it held nothing else.
// Nuxt Content reads them at the top level or under a `navigation:` map,
// which wins.
const readNav = (text, ctx) => {
  const fields = { nav: {}, top: {} };
  let complete = true;
  let nested = false;
  for (const [index, line] of text.split("\n").entries()) {
    const m = /^(?<indent>[ \t]*)(?<key>[\w-]+):[ \t]*(?<value>.*)$/u.exec(
      line
    );
    if (line.trim() === "" || line.trim().startsWith("#")) {
      continue;
    }
    const top = m?.groups.indent === "";
    nested = top
      ? m.groups.key === "navigation" && m.groups.value === ""
      : nested;
    const key = m && (top || nested) ? m.groups.key : null;
    const value = m ? yamlPlain(m.groups.value) : "";
    const into = top ? fields.top : fields.nav;
    if (key === "title") {
      into.title = value;
    } else if (key === "icon") {
      into.icon = lucideName(value, ctx, index + 1, "folder");
      complete &&= into.icon !== null;
    } else if (!(top && nested)) {
      complete = false;
      ctx.review(index + 1, navReview(key, value, line));
    }
  }
  return {
    complete,
    icon: fields.nav.icon ?? fields.top.icon,
    title: fields.nav.title ?? fields.top.title,
  };
};

const convertNav = (file, project) => {
  const report = newReport();
  const dir = path.posix.dirname(file);
  const target = `${dir === "." ? "" : `${dir}/`}meta.ts`;
  const text = readFileSync(path.join(project.root, file), "utf-8").replaceAll(
    "\r\n",
    "\n"
  );
  if (existsSync(path.join(project.root, target))) {
    report.review(
      1,
      `${target} already exists: merge this file into it by hand`
    );
    return { file, report, target: null };
  }
  const { complete, icon, title } = readNav(text, {
    edit: report.edit,
    lucide: project.lucide,
    review: report.review,
  });
  report.edit(".navigation.yml → meta.ts");
  return {
    complete,
    file,
    meta: metaFor(title, icon),
    report,
    target,
  };
};

// `x.md` → `x.mdx` when the page now needs MDX and the name is free.
const renameTarget = (page, pages) => {
  if (!page.mdx) {
    return page.file;
  }
  const wanted = `${page.file}x`;
  if (pages.includes(wanted)) {
    page.report.review(1, `${wanted} already exists: not renamed`);
    return page.file;
  }
  return wanted;
};

const finish = (result) => ({
  edits: Object.fromEntries([...result.report.edits].toSorted()),
  reviews: result.report.reviews.toSorted((a, b) => a.line - b.line),
});

const run = (root, write, lucidePath) => {
  const lucide = loadLucide(root, lucidePath);
  const project = { lucide, root };
  const { navs, pages } = collectFiles(root);
  const results = [];
  for (const file of pages) {
    const page = convertPage(file, project);
    if (page.skipped) {
      if (page.report.reviews.length > 0) {
        results.push({ changed: false, file, ...finish(page) });
      }
      continue;
    }
    const target = renameTarget(page, pages);
    const changed = page.after !== page.before || target !== file;
    if (write && page.after !== page.before) {
      writeFileSync(path.join(root, file), page.after, "utf-8");
    }
    if (write && target !== file) {
      renameSync(path.join(root, file), path.join(root, target));
    }
    if (changed || page.report.reviews.length > 0) {
      results.push({
        changed,
        file,
        renamed: target === file ? undefined : target,
        ...finish(page),
      });
    }
  }
  for (const file of navs) {
    const nav = convertNav(file, project);
    if (write && nav.target) {
      writeFileSync(path.join(root, nav.target), nav.meta, "utf-8");
      if (nav.complete) {
        unlinkSync(path.join(root, file));
      }
    }
    results.push({
      changed: nav.target !== null,
      file,
      renamed: nav.target ?? undefined,
      ...finish(nav),
    });
  }
  return { lucide: lucide !== null, results };
};

const HELP = [
  "docus-codemod — the mechanical part of a Docus → Blume migration",
  "",
  "  node docus-codemod.mjs <content-dir>                dry run (report only)",
  "  node docus-codemod.mjs --write <content-dir>        apply in place",
  "  node docus-codemod.mjs --json <content-dir>         JSON report",
  "  node docus-codemod.mjs --lucide <icons.json> <dir>  check icon names",
  "",
].join("\n");

const main = () => {
  const argv = process.argv.slice(2);
  const lucideAt = argv.indexOf("--lucide");
  const lucidePath = lucideAt === -1 ? null : argv[lucideAt + 1];
  const dir = argv.find(
    (arg, i) =>
      !arg.startsWith("--") && !(lucideAt !== -1 && i === lucideAt + 1)
  );
  if (argv.includes("--help") || argv.includes("-h") || !dir) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  const write = argv.includes("--write");
  const { lucide, results } = run(path.resolve(dir), write, lucidePath);
  if (argv.includes("--json")) {
    process.stdout.write(
      `${JSON.stringify({ files: results, iconsChecked: lucide, wrote: write }, null, 2)}\n`
    );
    return;
  }
  const totals = new Map();
  let reviewCount = 0;
  for (const result of results) {
    const name = result.renamed
      ? `${result.file} → ${result.renamed}`
      : result.file;
    process.stdout.write(`\n${name}\n`);
    for (const [kind, count] of Object.entries(result.edits)) {
      process.stdout.write(`  ${count} × ${kind}\n`);
      totals.set(kind, (totals.get(kind) ?? 0) + count);
    }
    for (const { line, message } of result.reviews) {
      process.stdout.write(`  REVIEW line ${line}: ${message}\n`);
    }
    reviewCount += result.reviews.length;
  }
  process.stdout.write("\nTotals\n");
  for (const [kind, count] of [...totals].toSorted()) {
    process.stdout.write(`  ${count} × ${kind}\n`);
  }
  if (!lucide) {
    process.stdout.write(
      "\nIcon names weren't checked: no @iconify-json/lucide found (install blume, or pass --lucide <icons.json>).\n"
    );
  }
  const changed = results.filter((result) => result.changed).length;
  const verb = write ? "changed" : "would change";
  const hint = write ? "" : " Re-run with --write to apply.";
  process.stdout.write(
    `\n${results.length} file(s) with findings, ${changed} ${verb}, ${reviewCount} item(s) to review.${hint}\n`
  );
};

main();
