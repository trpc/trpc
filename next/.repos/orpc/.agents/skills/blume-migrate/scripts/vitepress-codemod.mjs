#!/usr/bin/env node
// vitepress-codemod.mjs — the mechanical part of a VitePress → Blume content
// migration. Point it at the VitePress source directory (`srcDir`, which
// becomes Blume's `content.root`). It rewrites page bodies only where the
// mapping is exact, and reports everything it leaves for review:
//
//   - `::: tip` / `::: tip Title` → `:::tip` / `:::tip[Title]`, paired the way
//     markdown-it-container pairs them (a bare `:::` closes the outermost open
//     container whose fence is no longer than it, and everything nested in
//     it; an unclosed container runs to the end of its parent). Nested
//     callouts get the longer outer fence Blume needs.
//   - `::: code-group` → `<CodeGroup>` (a code group ends at its last code
//     block when its closer is missing), `::: details` → `<Expandable>`,
//     `::: raw` / `::: v-pre` wrappers removed.
//   - GitHub alerts (`> [!NOTE]`) → directives, when the blockquote is
//     unambiguous. (Blume renders GitHub's own five in `.mdx` as written, but
//     not VitePress's `[!INFO]` and `[!DANGER]`, nor any alert in `.md`.)
//   - Fence meta: `[label]` → a title, `js{1,3}` → `js {1,3}` (Blume reads
//     a lone `[label]` and `js{1,3}` as written too; those two only normalize),
//     `:line-numbers` → `lineNumbers`, and a title for every block in a code
//     group (VitePress labels an unlabeled one with its language).
//   - `<<< @/file [Label]` snippet imports and `<!--@include: ./part.md-->`
//     → `<include>`, when there's no region or line range and the file is
//     inside the source directory.
//   - Links: `/x.html`, `/x.md`, `/x/index.html`, `/x/` → `/x`, and relative
//     `.html` links → their route, when a page backs the route.
//   - `<Badge type text />` → `<Badge variant>text</Badge>` (a badge in a
//     heading also pins the heading's VitePress anchor), `{#id}` → `[#id]`,
//     `[[toc]]` removed, and the body H1 → frontmatter `title`.
//   - A page that now uses MDX-only syntax is renamed `.md` → `.mdx`, with
//     its HTML comments and `<br>` made MDX-safe. What still can't compile as
//     MDX (Vue syntax, `{{ }}`, unclosed tags, autolinks) is reported.
//
// Design constraints (shared with mintlify-codemod.mjs):
//   - ZERO dependencies: runs with a bare `node`.
//   - Deterministic: files are processed in sorted order.
//   - Idempotent: a second run changes nothing.
//   - Reports every change and every finding, so nothing is silent.
//
// Usage:
//   node vitepress-codemod.mjs <srcDir>              # dry run, report only
//   node vitepress-codemod.mjs --write <srcDir>      # apply in place
//   node vitepress-codemod.mjs --json <srcDir>       # machine-readable report
//   node vitepress-codemod.mjs --redirects <distDir> # print `.html` redirects
//
// `--redirects` reads a VitePress build output (`.vitepress/dist`) and prints
// one `{ from: "/x.html", to: "/x" }` per built page (index pages and 404
// excluded), for `redirects` in blume.config.ts.

import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

// --- Tables -----------------------------------------------------------------

// VitePress container (and alert) names → Blume callout types. Blume's own
// names map to themselves, so a second pass over converted output is a no-op.
const CALLOUTS = new Map([
  ["caution", "danger"],
  ["danger", "danger"],
  ["error", "danger"],
  ["important", "note"],
  ["info", "info"],
  ["note", "note"],
  ["success", "success"],
  ["tip", "tip"],
  ["warn", "warning"],
  ["warning", "warning"],
]);

// Containers VitePress 1.x doesn't register (2.0 does): 1.x showed them as text.
const NEW_IN_2 = new Set(["caution", "important", "note"]);

const ALERTS = new Map([
  ["caution", "danger"],
  ["danger", "danger"],
  ["important", "note"],
  ["info", "info"],
  ["note", "note"],
  ["tip", "tip"],
  ["warning", "warning"],
]);

// The alerts GitHub defines, which Blume itself renders as callouts in `.mdx`
// (a `.md` page shows them as quotes, with a BLUME_MD_GITHUB_ALERT warning).
const GITHUB_ALERTS = new Set([
  "caution",
  "important",
  "note",
  "tip",
  "warning",
]);

// VitePress `<Badge type>` → Blume `variant` (`default` is Blume's default).
const BADGE_VARIANTS = new Map([
  ["caution", "danger"],
  ["danger", "danger"],
  ["important", "accent"],
  ["info", "default"],
  ["note", "default"],
  ["tip", "accent"],
  ["warning", "warning"],
]);

// Fence keywords Blume reads; never usable as a bare title.
const RESERVED_META = new Set([
  "expandable",
  "lineNumbers",
  "ts2js",
  "twoslash",
  "wrap",
]);

// Blume's page frontmatter keys (its schema is strict: any other key fails the
// build). Reported, not rewritten: mapping them takes judgment.
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

// Components this codemod writes itself; every other capitalized tag is
// reported for review.
const PRODUCED = new Set(["Badge", "CodeGroup", "Expandable"]);

// --- Patterns -----------------------------------------------------------------

const FENCE_RE = /^(?<indent>\s*)(?<marker>`{3,}|~{3,})(?<info>.*)$/u;
const OPEN_RE =
  /^(?<indent>\s*)(?<colons>:{3,})\s*(?<name>[A-Za-z][\w-]*)(?<rest>.*)$/u;
const CLOSE_RE = /^\s*(?<colons>:{3,})\s*$/u;
const SNIPPET_RE = /^(?<indent>\s*)<<<\s*(?<raw>\S.*?)\s*$/u;
// VitePress 1.6's snippet grammar (src/node/markdown/plugins/snippet.ts).
const RAW_PATH_RE =
  /^(?<file>.+?(?:\.[a-z0-9]+)?)(?<region>#[\w-]+)?(?: ?\{(?<lines>\d+(?:[,-]\d+)*)? ?(?<lang>\S+)? ?(?<attrs>\S+)?\})? ?(?:\[(?<title>.+)\])?$/u;
const INCLUDE_LINE_RE =
  /^(?<indent>\s*)<!--\s*@include:\s*(?<target>.*?)\s*-->\s*$/u;
const INCLUDE_ANY_RE = /<!--\s*@include:/u;
const BLUME_INCLUDE_RE =
  /^\s*<include(?<attrs>[^>]*)>\s*(?<target>[^<\s]+)\s*<\/include>\s*$/u;
const ALERT_RE = /^>\s?\[!(?<type>[A-Za-z]+)\](?<title>[^\n]*)$/u;
const HEADING_RE = /^(?<hashes>#{1,6})\s+(?<text>.*?)\s*$/u;
const CURLY_ID_RE = /^(?<head>#{1,6}\s.*?)\s*\{#(?<id>[\w-]+)\}\s*$/u;
const PIN_RE = /\[#[\w-]+\]\s*$/u;
const LINE_NUMBERS_RE = /:(?<no>no-)?line-numbers(?:=(?<start>\d*))?/u;

// --- Small helpers ---------------------------------------------------------------

const isFenceClose = (text, fence) => {
  const m = /^\s*(?<marker>`{3,}|~{3,})\s*$/u.exec(text);
  return (
    m !== null &&
    m.groups.marker[0] === fence.char &&
    m.groups.marker.length >= fence.length
  );
};

// Apply `fn` to the text outside inline code spans.
const outsideCode = (text, fn) =>
  text
    .split(/(?<code>`+[^`]*`+)/u)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join("");

// The text with its inline code spans removed.
const stripCode = (text) => text.replaceAll(/`+[^`]*`+/gu, "");

// VitePress's heading slugify (@mdit-vue/shared), for pinning old anchors.
const vitepressSlug = (text) =>
  text
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036F]/gu, "")
    .replaceAll(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/gu, "-")
    .replaceAll(/-{2,}/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .replace(/^(?<digit>\d)/u, "_$<digit>")
    .toLowerCase();

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

// The heading text markdown-it slugs: text and code, without HTML or markup.
const headingText = (text) =>
  removeAll(text, /<[^>]*>/gu)
    .replaceAll(/\[(?<label>[^\]]*)\]\([^)]*\)/gu, "$<label>")
    .replaceAll(/`|\*\*|__/gu, "")
    .trim();

// A fence or include title: a bare token when Blume reads one as a title,
// otherwise `title="…"`.
const titleToken = (label) => {
  if (/^[^\s"'{}=[\]]+$/u.test(label) && !RESERVED_META.has(label)) {
    return label;
  }
  if (!label.includes('"')) {
    return `title="${label}"`;
  }
  return label.includes("'") ? null : `title='${label}'`;
};

// A JSX string attribute value.
const jsxString = (value) =>
  value.includes('"') ? `{${JSON.stringify(value)}}` : `"${value}"`;

// A YAML scalar for a frontmatter title.
const yamlScalar = (value) =>
  /^[A-Za-z0-9][\w\s.,'()/&+?!-]*$/u.test(value) &&
  !/\s$/u.test(value) &&
  !/^(?:true|false|null|yes|no|on|off|~)$/iu.test(value)
    ? value
    : JSON.stringify(value);

// VitePress's code-group tab label for an unlabeled fence: its language.
const languageTitle = (lang) => {
  if (lang === "" || lang === "ansi") {
    return "txt";
  }
  return lang === "vue-html" ? "template" : lang;
};

// --- Project model ----------------------------------------------------------------

const SKIP_DIRS = new Set(["node_modules", "public"]);

const collectFiles = (root) => {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).toSorted()) {
      const abs = path.join(dir, name);
      if (statSync(abs).isDirectory()) {
        if (!(name.startsWith(".") || (dir === root && SKIP_DIRS.has(name)))) {
          walk(abs);
        }
      } else if (/\.mdx?$/u.test(name)) {
        out.push(path.relative(root, abs).split(path.sep).join("/"));
      }
    }
  };
  walk(root);
  return out;
};

const routeOf = (rel) => {
  const route = `/${rel.replace(/\.mdx?$/u, "")}`.replace(/\/index$/u, "");
  return route === "" ? "/" : route;
};

// --- GitHub alerts → container items --------------------------------------------

// Replace each unambiguous alert blockquote with open/close marker items around
// its unquoted lines; the body pass turns them into a callout.
const expandAlerts = (items, review) => {
  const out = [];
  let fence = null;
  const leftAsQuote = (line, type) =>
    review(
      line,
      GITHUB_ALERTS.has(type.toLowerCase())
        ? "GitHub alert left as a blockquote: Blume renders it as a callout only in .mdx (a .md page warns BLUME_MD_GITHUB_ALERT), so check it there or convert it by hand"
        : "GitHub alert left as a blockquote: convert it by hand"
    );
  for (let i = 0; i < items.length; i += 1) {
    const { line, text } = items[i];
    if (fence) {
      fence = isFenceClose(text, fence) ? null : fence;
      out.push(items[i]);
      continue;
    }
    const f = FENCE_RE.exec(text);
    if (f) {
      fence = { char: f.groups.marker[0], length: f.groups.marker.length };
      out.push(items[i]);
      continue;
    }
    const indented = /^\s+>\s?\[!(?<type>\w+)\]/u.exec(text);
    const m = ALERT_RE.exec(text);
    if (indented) {
      leftAsQuote(line, indented.groups.type);
    } else if (m && !ALERTS.has(m.groups.type.toLowerCase())) {
      leftAsQuote(line, m.groups.type);
    }
    if (!m || !ALERTS.has(m.groups.type.toLowerCase())) {
      out.push(items[i]);
      continue;
    }
    let end = i + 1;
    while (end < items.length && items[end].text.startsWith(">")) {
      end += 1;
    }
    const block = items.slice(i + 1, end);
    const lazy = end < items.length && items[end].text.trim() !== "";
    if (lazy || block.some((item) => /^>\s?>/u.test(item.text))) {
      leftAsQuote(line, m.groups.type);
      out.push(items[i]);
      continue;
    }
    out.push({
      kind: "alert-open",
      line,
      title: m.groups.title.trim(),
      type: ALERTS.get(m.groups.type.toLowerCase()),
    });
    for (const item of block) {
      out.push({ line: item.line, text: item.text.replace(/^>\s?/u, "") });
    }
    out.push({ kind: "alert-close", line });
    i = end - 1;
  }
  return out;
};

// Resolve a snippet or include path from page `from`: `@` is the source
// directory (Blume's content root, written `/`); a relative path stays relative.
// Null when the path leaves the source directory.
const resolveSource = (from, target) => {
  if (target.startsWith("@")) {
    const rel = path.posix.normalize(target.slice(target[1] === "/" ? 2 : 1));
    return rel.startsWith("../") ? null : { rel, written: `/${rel}` };
  }
  const rel = path.posix.normalize(
    path.posix.join(path.posix.dirname(from), target)
  );
  return rel.startsWith("../") ? null : { rel, written: target };
};

// --- Body pass ----------------------------------------------------------------------

const parseTitle = (rest) => {
  const trimmed = rest.trim();
  const bracket = /^\[(?<title>.*)\]$/u.exec(trimmed);
  if (bracket) {
    return { attrs: "", title: bracket.groups.title };
  }
  const attr = /^\{.*\btitle="(?<title>[^"]*)".*\}$/u.exec(trimmed);
  if (attr) {
    return { attrs: "", title: attr.groups.title };
  }
  const attrs = /\{[^}]*\}$/u.exec(trimmed);
  return {
    attrs: attrs ? attrs[0] : "",
    title: (attrs ? trimmed.slice(0, attrs.index) : trimmed).trim(),
  };
};

// One page body: containers, alerts, fences, snippets, includes, inline syntax.
// `items` are `{ line, text }` (plus alert markers); returns output lines with
// the source line each came from.
const convertBody = (items, file, project, report) => {
  const out = [];
  const origin = [];
  const stack = [];
  const callouts = [];
  let fence = null;
  const { edit, review } = report;

  const emit = (text, line) => {
    out.push(text);
    origin.push(line);
  };
  // A blank line this pass adds around a block tag; a blank source line right
  // after one is dropped, so blocks don't gain double gaps.
  const padded = new Set();
  const pad = (line) => {
    emit("", line);
    padded.add(out.length - 1);
  };
  const blank = (line) => {
    if (out.length > 0 && out.at(-1).trim() !== "") {
      emit("", line);
    }
  };
  // The stack depth a code group that lost its closer was ended at, until the
  // next container line.
  let endedGroup = -1;
  const inCodeGroup = () => stack.at(-1)?.kind === "codegroup";
  const floor = () => stack.findLastIndex((entry) => entry.barrier) + 1;

  const close = (entry, line, closer) => {
    if (entry.kind === "codegroup" || entry.kind === "details") {
      blank(line);
      emit(
        `${entry.indent}</${entry.kind === "codegroup" ? "CodeGroup" : "Expandable"}>`,
        line
      );
      pad(line);
    } else if (entry.kind === "callout") {
      entry.closeIndex = out.length;
      emit("", line);
      callouts.push(entry);
      let depth = 1;
      for (let p = entry.parent; p; p = p.parent) {
        p.depth = Math.max(p.depth, depth);
        depth += 1;
      }
    } else if (entry.kind === "custom") {
      if (closer !== undefined) {
        emit(closer, line);
      }
      // Left as written, its `:::` lines still end a callout around it whose
      // fence is no longer, so each enclosing callout needs a longer fence.
      let depth = entry.colons - 2;
      for (let p = entry.parent; p; p = p.parent) {
        p.depth = Math.max(p.depth, depth);
        depth += 1;
      }
    }
  };

  // Close the entries above `index` (they had no closer of their own), then
  // the one at `index` with the closer line itself.
  const closeTo = (index, line, closer) => {
    while (stack.length > index + 1) {
      const inner = stack.pop();
      if (inner.kind !== "custom" && inner.kind !== "wrapper") {
        review(
          inner.line,
          `container has no closer of its own; VitePress ended it on line ${line}, and so does the output`
        );
      }
      close(inner, line);
    }
    close(stack.pop(), line, closer);
  };

  const href = (value, line) => {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/iu.test(value)) {
      return value;
    }
    const cut = value.search(/[?#]/u);
    const target = cut === -1 ? value : value.slice(0, cut);
    const suffix = cut === -1 ? "" : value.slice(cut);
    const ext = /\.(?:html|md)$/u.exec(target);
    const slash = target.length > 1 && target.endsWith("/");
    if (!(ext || slash) || (!target.startsWith("/") && ext?.[0] === ".md")) {
      return value;
    }
    if (target.startsWith("/") && project.publicFiles.has(target)) {
      return value;
    }
    let route = target.startsWith("/")
      ? target
      : path.posix.join("/", path.posix.dirname(file), target);
    route = route.slice(0, ext ? -ext[0].length : -1);
    route = route.replace(/\/index$/u, "") || "/";
    if (!project.routes.has(route)) {
      review(line, `link ${target}: no page backs ${route}; left as written`);
      return value;
    }
    edit("link → route");
    return `${route}${suffix}`;
  };

  // Markdown links, `href`s, and link reference definitions.
  const links = (text, line) => {
    const result = outsideCode(text, (part) =>
      part
        .replaceAll(
          /(?<!!)\]\((?<target>[^)\s]+)(?<title>\s+"[^"]*")?\)(?<attrs>\{[^}]*\})?/gu,
          (_, target, title, attrs) => {
            if (attrs) {
              edit("link attributes {…} removed");
            }
            return `](${href(target, line)}${title ?? ""})`;
          }
        )
        .replaceAll(
          /\bhref="(?<target>[^"]+)"/gu,
          (_, target) => `href="${href(target, line)}"`
        )
    );
    const definition =
      /^(?<head>\s*\[[^\]]+\]:\s*)(?<target>\S+)(?<tail>.*)$/u.exec(result);
    if (!definition) {
      return result;
    }
    const { head, tail } = definition.groups;
    return `${head}${href(definition.groups.target, line)}${tail}`;
  };

  const open = (m, line) => {
    endedGroup = -1;
    const { colons, indent, name } = m.groups;
    const lower = name.toLowerCase();
    const { attrs, title } = parseTitle(m.groups.rest);
    const base = { colons: colons.length, indent, line };
    if (lower === "code-group") {
      blank(line);
      emit(`${indent}<CodeGroup>`, line);
      pad(line);
      stack.push({ ...base, kind: "codegroup" });
      edit("::: code-group → <CodeGroup>");
      return;
    }
    if (lower === "details") {
      blank(line);
      const opened = /\bopen\b/u.test(attrs) ? " defaultOpen" : "";
      emit(
        `${indent}<Expandable title=${jsxString(title || "Details")}${opened}>`,
        line
      );
      pad(line);
      stack.push({ ...base, kind: "details" });
      edit("::: details → <Expandable>");
      return;
    }
    if (lower === "raw" || lower === "v-pre") {
      stack.push({ ...base, kind: "wrapper" });
      edit(`::: ${lower} wrapper removed`);
      if (lower === "v-pre") {
        review(
          line,
          "`::: v-pre` removed: any `{{ }}` inside it is literal in .md but an expression in .mdx"
        );
      }
      return;
    }
    const type = CALLOUTS.get(lower);
    if (type) {
      if (attrs) {
        review(line, `container attributes ${attrs} dropped`);
      }
      if (/[[\]]/u.test(title)) {
        review(line, "callout title contains brackets: check the `[…]` label");
      }
      stack.push({
        ...base,
        depth: 0,
        kind: "callout",
        name: lower,
        openIndex: out.length,
        parent: stack.findLast((entry) => entry.kind === "callout"),
        source: m.input,
        title: links(title, line),
        type,
      });
      emit("", line);
      return;
    }
    stack.push({
      ...base,
      kind: "custom",
      parent: stack.findLast((entry) => entry.kind === "callout"),
    });
    emit(m.input, line);
    review(
      line,
      `\`${name}\` isn't a VitePress built-in container: it was paired as one and left as written; convert it by hand`
    );
  };

  const snippet = (m, line) => {
    const p = RAW_PATH_RE.exec(m.groups.raw);
    if (!p) {
      review(line, "`<<<` import not understood: convert it by hand");
      return false;
    }
    const { attrs, lines, region, title } = p.groups;
    const file0 = p.groups.file;
    if (region) {
      review(
        line,
        `\`<<<\` region ${region}: <include> has no region selection; move the region into its own file`
      );
      return false;
    }
    const source = resolveSource(file, file0);
    if (!source) {
      review(
        line,
        `\`<<< ${file0}\` is outside the source directory: copy it in (e.g. under _snippets/) and include the copy`
      );
      return false;
    }
    if (!existsSync(path.join(project.root, source.rel))) {
      review(line, `\`<<< ${file0}\`: file not found`);
      return false;
    }
    let numbered = false;
    // `{2 ts:line-numbers}` or `{2 ts :line-numbers}`: either slot.
    const withoutLineNumbers = (value = "") => {
      const ln = LINE_NUMBERS_RE.exec(value);
      if (!ln) {
        return value;
      }
      numbered = !ln.groups.no;
      if (ln.groups.start) {
        review(
          line,
          `line numbers started at ${ln.groups.start}: Blume starts at 1`
        );
      }
      return `${value.slice(0, ln.index)}${value.slice(ln.index + ln[0].length)}`;
    };
    let lang = withoutLineNumbers(p.groups.lang);
    const extra = withoutLineNumbers(attrs);
    if (!lang && /\.mdx?$/u.test(source.rel)) {
      lang = "md";
    }
    const label =
      title ?? (inCodeGroup() ? path.posix.basename(file0) : undefined);
    const titlePart = label === undefined ? undefined : titleToken(label);
    if (titlePart === null) {
      review(line, "label holds both quote kinds: set its title by hand");
    }
    const meta = [
      titlePart,
      lines ? `{${lines}}` : undefined,
      numbered ? "lineNumbers" : undefined,
      extra.trim(),
    ]
      .filter(Boolean)
      .join(" ");
    let metaAttr = "";
    if (meta) {
      metaAttr = meta.includes('"') ? ` meta='${meta}'` : ` meta="${meta}"`;
    }
    const langAttr = lang ? ` lang="${lang}"` : "";
    blank(line);
    emit(
      `${m.groups.indent}<include${langAttr}${metaAttr}>${source.written}</include>`,
      line
    );
    pad(line);
    edit("<<< import → <include>");
    return true;
  };

  const include = (m, line) => {
    const { target } = m.groups;
    if (/\{\d*,\d*\}$/u.test(target) || /#[\w-]+/u.test(target)) {
      review(
        line,
        "`<!--@include:-->` with a region or line range: split the partial and include the piece"
      );
      return false;
    }
    const source = resolveSource(file, target);
    if (!source) {
      review(
        line,
        `\`<!--@include: ${target}-->\` is outside the source directory: move the partial in`
      );
      return false;
    }
    if (!/\.mdx?$/u.test(source.rel)) {
      review(
        line,
        `\`<!--@include: ${target}-->\` splices a non-Markdown file; Blume shows one as a code block: convert it by hand`
      );
      return false;
    }
    if (!existsSync(path.join(project.root, source.rel))) {
      review(
        line,
        `\`<!--@include: ${target}-->\`: file not found (VitePress skipped it silently)`
      );
      return false;
    }
    blank(line);
    emit(`${m.groups.indent}<include>${source.written}</include>`, line);
    pad(line);
    project.includes.get(file).add(source.rel);
    edit("<!--@include:--> → <include>");
    return true;
  };

  const fenceInfo = (m, line) => {
    const { indent, marker } = m.groups;
    const raw = m.groups.info.trim();
    const parts = /^(?<lang>[^\s{[:]*)(?<rest>.*)$/u.exec(raw).groups;
    let { lang, rest } = parts;
    const glued = rest.startsWith("{");
    let changed = false;
    let label;
    const bracket = /\[(?<label>.*)\]/u.exec(rest);
    if (bracket) {
      label = bracket.groups.label.trim();
      rest = rest.replace(bracket[0], " ");
      changed = true;
      edit("fence [label] → title");
    }
    // Anywhere outside the label: VitePress reads `ts{1}:line-numbers` too.
    let numbered = false;
    const ln = LINE_NUMBERS_RE.exec(rest);
    if (ln) {
      rest = `${rest.slice(0, ln.index)} ${rest.slice(ln.index + ln[0].length)}`;
      numbered = !ln.groups.no;
      changed = true;
      edit("fence :line-numbers → lineNumbers");
      if (ln.groups.start) {
        review(
          line,
          `line numbers started at ${ln.groups.start}: Blume starts at 1`
        );
      }
    }
    if (lang.endsWith("-vue")) {
      lang = lang.slice(0, -4);
      changed = true;
      review(
        line,
        "`-vue` fence became a plain fence: resolve any `{{ }}` in it by hand"
      );
    }
    const group = inCodeGroup() && !label;
    if (!(changed || glued || group)) {
      return `${indent}${marker}${m.groups.info}`;
    }
    const ranges = [];
    rest = rest.replaceAll(/\{(?<inside>[^}]*)\}/gu, (all, inside) => {
      if (/^[\d,\s-]*$/u.test(inside)) {
        ranges.push(`{${inside.replaceAll(/\s+/gu, "")}}`);
      } else {
        review(line, `fence attributes ${all} dropped`);
      }
      return " ";
    });
    if (glued) {
      edit("fence lang{lines} → lang {lines}");
    }
    if (group) {
      label = languageTitle(lang);
      edit("code group block titled with its language");
    }
    let titlePart;
    if (label) {
      titlePart = titleToken(label);
      if (titlePart === null) {
        review(line, "label holds both quote kinds: set its title by hand");
      }
    }
    const tokens = [
      lang || "txt",
      titlePart,
      ...ranges,
      numbered ? "lineNumbers" : undefined,
      ...rest.trim().split(/\s+/u),
    ].filter(Boolean);
    return `${indent}${marker}${tokens.join(" ")}`;
  };

  const badge = (attrs, children, line) => {
    const pairs = [
      ...attrs.matchAll(/(?<key>[:@]?[\w-]+)(?:="(?<value>[^"]*)")?/gu),
    ];
    if (pairs.some((p) => !["text", "type"].includes(p.groups.key))) {
      review(
        line,
        "`<Badge>` with bindings or other props: convert it by hand"
      );
      return null;
    }
    const props = Object.fromEntries(
      pairs.map((p) => [p.groups.key, p.groups.value ?? ""])
    );
    const variant = BADGE_VARIANTS.get(props.type ?? "tip") ?? "accent";
    const text = children ?? props.text ?? "";
    edit("<Badge type text> → <Badge variant>");
    const variantAttr = variant === "default" ? "" : ` variant="${variant}"`;
    return `<Badge${variantAttr}>${text}</Badge>`;
  };

  const inline = (text, line) => {
    let result = links(text, line);
    let converted = false;
    result = outsideCode(result, (part) =>
      part
        .replaceAll(/<Badge\b(?<attrs>[^>]*?)\/>/gu, (all, attrs) => {
          const out2 = badge(attrs, undefined, line);
          converted ||= out2 !== null;
          return out2 ?? all;
        })
        .replaceAll(
          /<Badge\b(?<attrs>(?:(?!variant=)[^>])*)>(?<children>.*?)<\/Badge>/gu,
          (all, attrs, children) => {
            if (!/\btype=/u.test(attrs)) {
              return all;
            }
            const out2 = badge(attrs, children, line);
            converted ||= out2 !== null;
            return out2 ?? all;
          }
        )
    );
    const curly = CURLY_ID_RE.exec(result);
    if (curly) {
      result = `${curly.groups.head} [#${curly.groups.id}]`;
      edit("heading {#id} → [#id]");
    }
    // VitePress slugged the source heading: a self-closing badge added no
    // text, a badge with children added its children. Blume leaves a badge's
    // text out of the id, so the pin only changes the id for the second kind;
    // for the first it repeats Blume's own.
    const heading = HEADING_RE.exec(text);
    if (
      converted &&
      heading &&
      heading.groups.hashes.length > 1 &&
      !PIN_RE.test(result)
    ) {
      const slug = vitepressSlug(
        headingText(heading.groups.text.replace(/\s*\{#[\w-]+\}$/u, ""))
      );
      if (slug) {
        result = `${result} [#${slug}]`;
        edit("badge heading pinned to its VitePress anchor");
      }
    }
    return result;
  };

  const openAlert = (item) => {
    stack.push({
      barrier: true,
      colons: Number.POSITIVE_INFINITY,
      depth: 0,
      indent: "",
      kind: "callout",
      line: item.line,
      name: item.type,
      openIndex: out.length,
      parent: stack.findLast((entry) => entry.kind === "callout"),
      source: "",
      title: item.title,
      type: item.type,
    });
    emit("", item.line);
    edit("GitHub alert → directive");
  };

  // A line inside a code fence: VitePress's container scan doesn't skip
  // fences, so a bare `:::` here would have closed an open container.
  const fenced = (text, line) => {
    if (isFenceClose(text, fence)) {
      fence = null;
    } else if (CLOSE_RE.test(text) && stack.length > floor()) {
      review(
        line,
        "VitePress ends the open `:::` container on this line, inside a code fence: check the block"
      );
    } else if (INCLUDE_ANY_RE.test(text)) {
      // VitePress splices includes into the raw source, fences included.
      review(
        line,
        "`<!--@include:-->` inside a code fence: VitePress showed the file's text here, Blume shows the comment; use an <include> of the file instead"
      );
    }
    emit(text, line);
  };

  // A code group only holds code: the first other content ends one whose
  // closer is missing (VitePress let it swallow what followed).
  const endOpenCodeGroup = (text, line) => {
    const trimmed = text.trim();
    if (
      !inCodeGroup() ||
      trimmed === "" ||
      SNIPPET_RE.test(text) ||
      /^<!--[\s\S]*-->$/u.test(trimmed)
    ) {
      return;
    }
    review(
      stack.at(-1).line,
      `code group has no closer before line ${line}; it now ends at its last code block (VitePress swallowed what followed)`
    );
    edit("unclosed code group ended at its last code block");
    closeTo(stack.length - 1, line);
    endedGroup = stack.length;
  };

  // A bare `:::` closes the outermost open container whose fence is no
  // longer than it (and everything nested in it), as markdown-it-container
  // pairs them; alerts are a boundary it can't close across.
  const closeLine = (closer, text, line) => {
    // The first closer after a code group ended early, with nothing opened
    // since, was that group's closer in VitePress.
    const groupCloser = endedGroup === stack.length;
    endedGroup = -1;
    const size = closer.groups.colons.length;
    const start = floor();
    const index = stack.findIndex(
      (entry, k) => k >= start && entry.colons <= size
    );
    if (index === -1) {
      review(
        line,
        groupCloser
          ? "`:::` closed the code group above in VitePress, which now ends at its last code block: removed"
          : "stray `:::` (VitePress showed it as text) removed"
      );
      edit("stray ::: removed");
      return;
    }
    closeTo(index, line, text);
  };

  // Snippet imports, includes, and `[[toc]]`; true when the line was consumed.
  const blockLine = (text, line) => {
    const snip = SNIPPET_RE.exec(text);
    if (snip && snippet(snip, line)) {
      return true;
    }
    const inc = INCLUDE_LINE_RE.exec(text);
    if (inc && include(inc, line)) {
      return true;
    }
    if (!inc && INCLUDE_ANY_RE.test(text)) {
      review(line, "`<!--@include:-->` inside a line: convert it by hand");
    }
    const existing = BLUME_INCLUDE_RE.exec(text);
    if (existing && !/\blang=/u.test(existing.groups.attrs)) {
      const source = resolveSource(file, existing.groups.target);
      if (source) {
        project.includes.get(file).add(source.rel);
      }
    }
    if (text.trim() === "[[toc]]") {
      edit("[[toc]] removed");
      return true;
    }
    return text.trim() === "" && padded.has(out.length - 1);
  };

  const step = (item) => {
    if (item.kind === "alert-open") {
      openAlert(item);
      return;
    }
    if (item.kind === "alert-close") {
      closeTo(
        stack.findLastIndex((entry) => entry.barrier),
        item.line
      );
      return;
    }
    const { line, text } = item;
    if (fence) {
      fenced(text, line);
      return;
    }
    const f = FENCE_RE.exec(text);
    if (f) {
      fence = { char: f.groups.marker[0], length: f.groups.marker.length };
      emit(fenceInfo(f, line), line);
      return;
    }
    const closer = CLOSE_RE.exec(text);
    if (closer) {
      closeLine(closer, text, line);
      return;
    }
    endOpenCodeGroup(text, line);
    const opener = OPEN_RE.exec(text);
    if (opener) {
      open(opener, line);
      return;
    }
    if (!blockLine(text, line)) {
      emit(inline(text, line), line);
    }
  };

  // Write each callout's fences once its nesting depth is known: Blume needs
  // an outer fence longer than any fence nested in it.
  const finish = () => {
    const last = items.at(-1)?.line ?? 1;
    while (stack.length > 0) {
      const entry = stack.at(-1);
      if (entry.kind !== "custom" && entry.kind !== "wrapper") {
        review(
          entry.line,
          "container is never closed; VitePress ran it to the end of the page, and so does the output"
        );
      }
      close(stack.pop(), last);
    }
    for (const entry of callouts) {
      const fenceText = ":".repeat(3 + entry.depth);
      const label = entry.title ? `[${entry.title}]` : "";
      out[entry.openIndex] = `${entry.indent}${fenceText}${entry.type}${label}`;
      out[entry.closeIndex] = `${entry.indent}${fenceText}`;
      if (entry.source && entry.source !== out[entry.openIndex]) {
        edit(
          entry.title ? "::: type Title → :::type[Title]" : "::: type → :::type"
        );
        if (NEW_IN_2.has(entry.name) && /^\s*:{3,}\s/u.test(entry.source)) {
          review(
            entry.line,
            `\`::: ${entry.name}\` is a container only in VitePress 2.0; 1.x showed it as text. It is now a callout`
          );
        }
      }
    }
  };

  for (const item of items) {
    step(item);
  }
  finish();
  return { lines: out, origin };
};

// --- H1 → title ---------------------------------------------------------------------

const splitFrontmatter = (text) => {
  const lines = text.split("\n");
  if (lines[0] !== "---") {
    return { body: lines, fm: null, offset: 0 };
  }
  const end = lines.indexOf("---", 1);
  if (end === -1) {
    return { body: lines, fm: null, offset: 0 };
  }
  return {
    body: lines.slice(end + 1),
    fm: lines.slice(1, end),
    offset: end + 1,
  };
};

// The H1 line, plus the blank after it when a blank also precedes it (so the
// body keeps one gap below the frontmatter).
const removedLines = (lines, i) =>
  i > 0 && lines[i - 1] === "" && lines[i + 1] === "" ? 2 : 1;

const moveH1 = (doc, report) => {
  let fence = null;
  for (let i = 0; i < doc.lines.length; i += 1) {
    const text = doc.lines[i];
    if (fence) {
      fence = isFenceClose(text, fence) ? null : fence;
      continue;
    }
    const f = FENCE_RE.exec(text);
    if (f) {
      fence = { char: f.groups.marker[0], length: f.groups.marker.length };
      continue;
    }
    const h1 = /^#\s+(?<text>.+?)\s*$/u.exec(text);
    if (!h1) {
      continue;
    }
    const title = h1.groups.text.replace(
      /\s*(?:\{#[\w-]+\}|\[#[\w-]+\])$/u,
      ""
    );
    const line = doc.origin[i];
    const existing = (doc.fm ?? [])
      .map((l) => /^title:\s*(?<value>.*)$/u.exec(l))
      .find(Boolean);
    if (existing) {
      const value = existing.groups.value.replace(
        /^(?<q>["'])(?<v>.*)\k<q>$/u,
        "$<v>"
      );
      if (value === title) {
        const count = removedLines(doc.lines, i);
        doc.lines.splice(i, count);
        doc.origin.splice(i, count);
        report.edit("duplicate body H1 removed");
      } else {
        report.review(
          line,
          "frontmatter `title` differs from the body H1: make the H1 the `title` and keep the old value as `seo.title`"
        );
      }
      return;
    }
    if (/[`<[*_{]/u.test(title)) {
      report.review(
        line,
        "body H1 has inline markup: move it into frontmatter `title` by hand"
      );
      return;
    }
    doc.fm = [`title: ${yamlScalar(title)}`, ...(doc.fm ?? [])];
    const count = removedLines(doc.lines, i);
    doc.lines.splice(i, count);
    doc.origin.splice(i, count);
    report.edit("body H1 → frontmatter title");
    return;
  }
};

// --- MDX safety ------------------------------------------------------------------------

const MDX_ONLY_RE = /^\s*:{3,}[a-z]|<(?:CodeGroup|Expandable|Badge)\b/u;

const needsMdx = (lines) => {
  let fence = null;
  for (const text of lines) {
    if (fence) {
      fence = isFenceClose(text, fence) ? null : fence;
      continue;
    }
    const f = FENCE_RE.exec(text);
    if (f) {
      fence = { char: f.groups.marker[0], length: f.groups.marker.length };
      continue;
    }
    if (MDX_ONLY_RE.test(stripCode(text))) {
      return true;
    }
  }
  return false;
};

const HAZARDS = [
  [/\{\{/u, "`{{ }}` is a JSX expression in .mdx: substitute the value"],
  [/<script\b|<style\b/u, "`<script>`/`<style>` block: remove it"],
  [
    /\s(?::[\w.-]+|v-[\w-]+|@[\w.-]+)="/u,
    "Vue binding or directive: rewrite the props in JSX form",
  ],
  [
    /<https?:\/\//u,
    "`<https://…>` autolink fails in .mdx: write a Markdown link",
  ],
  [
    /<(?:img|input|source|col|wbr)\b(?:[^>/]|\/(?!>))*>/u,
    "unclosed void tag: self-close it",
  ],
  [
    /<img\b[^>]*\ssrc="\.{1,2}\//u,
    "raw `<img>` with a relative src: Blume publishes the file but doesn't optimize it, so use a Markdown image",
  ],
  [
    /<!--/u,
    "HTML comment left in place (multi-line, or an include this pass couldn't convert): .mdx can't compile it",
  ],
];

// Make what can be made MDX-safe, and report the rest. `apply` is false for a
// file that stays `.md` (then only components are worth reporting).
const mdxPass = (doc, apply, report) => {
  let fence = null;
  for (let i = 0; i < doc.lines.length; i += 1) {
    const text = doc.lines[i];
    const line = doc.origin[i];
    if (fence) {
      fence = isFenceClose(text, fence) ? null : fence;
      continue;
    }
    const f = FENCE_RE.exec(text);
    if (f) {
      fence = { char: f.groups.marker[0], length: f.groups.marker.length };
      continue;
    }
    let next = text;
    if (apply) {
      next = outsideCode(next, (part) =>
        part
          .replaceAll(/<!--(?<body>(?:(?!-->).)*?)-->/gu, (all, body) => {
            if (body.includes("*/") || /^\s*@include:/u.test(body)) {
              return all;
            }
            report.edit("<!-- --> → {/* */}");
            return `{/*${body}*/}`;
          })
          .replaceAll(/<(?<tag>br|hr)\s*>/gu, (_, tag) => {
            report.edit("<br> → <br />");
            return `<${tag} />`;
          })
      );
      doc.lines[i] = next;
    }
    const prose = stripCode(next);
    for (const tag of prose.matchAll(/<(?<name>[A-Z][\w.]*)/gu)) {
      if (!PRODUCED.has(tag.groups.name)) {
        report.review(
          line,
          `component <${tag.groups.name}>: map it to a Blume component, an island, or Markdown`
        );
      }
    }
    if (!apply) {
      continue;
    }
    for (const [pattern, message] of HAZARDS) {
      if (pattern.test(prose)) {
        report.review(line, message);
      }
    }
    const text2 = removeAll(
      removeAll(
        prose.replaceAll("{{", ""),
        /<!--[\s\S]*?-->|\{\/\*[\s\S]*?\*\/\}/gu
      ),
      /<[^>]*>/gu
    );
    if (/\{(?!\/\*)/u.test(text2)) {
      report.review(
        line,
        "`{` in prose is a JSX expression in .mdx: escape it or use inline code"
      );
    }
  }
};

// --- Driver -------------------------------------------------------------------------------

const newReport = () => {
  const edits = new Map();
  const reviews = [];
  return {
    edit: (kind) => edits.set(kind, (edits.get(kind) ?? 0) + 1),
    edits,
    review: (line, message) => reviews.push({ line, message }),
    reviews,
  };
};

// Every file under `public/`, as the URL it's served at.
const listPublic = (root) => {
  const publicDir = path.join(root, "public");
  const files = new Set();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = path.join(dir, name);
      if (statSync(abs).isDirectory()) {
        walk(abs);
      } else {
        files.add(
          `/${path.relative(publicDir, abs).split(path.sep).join("/")}`
        );
      }
    }
  };
  if (existsSync(publicDir)) {
    walk(publicDir);
  }
  return files;
};

// Report frontmatter keys Blume's strict schema would reject.
const reviewFrontmatter = (fm, report) => {
  for (const [i, text] of (fm ?? []).entries()) {
    const key = /^(?<key>[\w-]+):\s*(?<value>.*)$/u.exec(text);
    if (key && !BLUME_KEYS.has(key.groups.key)) {
      report.review(
        i + 2,
        `frontmatter \`${key.groups.key}\` isn't a Blume key (the schema is strict): map it per references/vitepress.md, or remove it`
      );
    } else if (
      key?.groups.key === "sidebar" &&
      /^(?:true|false)$/u.test(key.groups.value)
    ) {
      report.review(
        i + 2,
        "VitePress `sidebar: false` hides the sidebar; Blume's `sidebar` is an object: use `mode: center`, or remove it"
      );
    }
  }
};

const convertFile = (file, project) => {
  const before = readFileSync(path.join(project.root, file), "utf-8");
  const split = splitFrontmatter(before);
  const report = newReport();
  reviewFrontmatter(split.fm, report);
  const items = split.body.map((text, i) => ({
    line: split.offset + i + 1,
    text,
  }));
  const body = convertBody(
    expandAlerts(items, report.review),
    file,
    project,
    report
  );
  return {
    before,
    file,
    fm: split.fm,
    lines: body.lines,
    origin: body.origin,
    report,
  };
};

// Which files end up MDX: their own syntax, or a spliced partial's. A partial
// itself keeps its name (pages include it by path).
const mdxFiles = (docs, project, partials) => {
  const mdx = new Map(
    docs.map((doc) => [
      doc.file,
      doc.file.endsWith(".mdx") || needsMdx(doc.lines),
    ])
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const doc of docs) {
      const spliced = [...project.includes.get(doc.file)];
      if (
        !(mdx.get(doc.file) || partials.has(doc.file)) &&
        spliced.some((rel) => mdx.get(rel))
      ) {
        mdx.set(doc.file, true);
        changed = true;
      }
    }
  }
  return mdx;
};

// `x.md` → `x.mdx` when the page now needs MDX and the name is free.
const renameTarget = (doc, partial, mdx) => {
  if (partial || !doc.file.endsWith(".md") || !mdx.get(doc.file)) {
    return doc.file;
  }
  const wanted = `${doc.file}x`;
  if (mdx.has(wanted)) {
    doc.report.review(1, `${wanted} already exists: not renamed`);
    return doc.file;
  }
  return wanted;
};

// The file text, keeping a trailing newline the source had.
const serialize = (doc) => {
  const fm = doc.fm ? ["---", ...doc.fm, "---"] : [];
  const after = [...fm, ...doc.lines].join("\n");
  return doc.before.endsWith("\n") && !after.endsWith("\n")
    ? `${after}\n`
    : after;
};

// Titles, MDX safety, the rename, and the write for one converted file.
const finishFile = (doc, context) => {
  const { docs, mdx, partials, project, write } = context;
  const { report } = doc;
  const partial = partials.has(doc.file);
  if (!partial) {
    moveH1(doc, report);
  } else if (needsMdx(doc.lines) && doc.file.endsWith(".md")) {
    report.review(
      1,
      "partial uses MDX-only syntax but keeps .md (pages include it by this path); Blume parses it in each including page's format"
    );
  }
  const includers = docs.filter((other) =>
    project.includes.get(other.file).has(doc.file)
  );
  const mdxContext = partial
    ? includers.length > 0 && includers.every((other) => mdx.get(other.file))
    : mdx.get(doc.file);
  mdxPass(doc, mdxContext, report);
  const target = renameTarget(doc, partial, mdx);
  const after = serialize(doc);
  const changed = after !== doc.before;
  if (write && changed) {
    writeFileSync(path.join(project.root, doc.file), after, "utf-8");
  }
  if (write && target !== doc.file) {
    renameSync(
      path.join(project.root, doc.file),
      path.join(project.root, target)
    );
  }
  return {
    changed: changed || target !== doc.file,
    edits: Object.fromEntries([...report.edits].toSorted()),
    file: doc.file,
    renamed: target === doc.file ? undefined : target,
    reviews: report.reviews.toSorted((a, b) => a.line - b.line),
  };
};

const run = (root, write) => {
  const files = collectFiles(root);
  const project = {
    includes: new Map(files.map((file) => [file, new Set()])),
    publicFiles: listPublic(root),
    root,
    routes: new Set(files.map(routeOf)),
  };
  const docs = files.map((file) => convertFile(file, project));
  const partials = new Set(
    [...project.includes.values()].flatMap((set) => [...set])
  );
  const mdx = mdxFiles(docs, project, partials);
  const context = { docs, mdx, partials, project, write };
  return docs
    .map((doc) => finishFile(doc, context))
    .filter((result) => result.changed || result.reviews.length > 0);
};

const redirects = (dist) => {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).toSorted()) {
      const abs = path.join(dir, name);
      if (statSync(abs).isDirectory()) {
        walk(abs);
        continue;
      }
      if (
        !name.endsWith(".html") ||
        name === "index.html" ||
        name === "404.html"
      ) {
        continue;
      }
      const html = readFileSync(abs, "utf-8");
      if (!/<meta name="generator" content="VitePress/u.test(html)) {
        continue;
      }
      const from = `/${path.relative(dist, abs).split(path.sep).join("/")}`;
      out.push({ from, to: from.slice(0, -".html".length) });
    }
  };
  walk(dist);
  return out;
};

const HELP = [
  "vitepress-codemod — the mechanical part of a VitePress → Blume migration",
  "",
  "  node vitepress-codemod.mjs <srcDir>              dry run (report only)",
  "  node vitepress-codemod.mjs --write <srcDir>      apply in place",
  "  node vitepress-codemod.mjs --json <srcDir>       JSON report",
  "  node vitepress-codemod.mjs --redirects <distDir> .html redirects as JSON",
  "",
].join("\n");

const main = () => {
  const argv = process.argv.slice(2);
  const dir = argv.find((arg) => !arg.startsWith("--"));
  if (argv.includes("--help") || argv.includes("-h") || !dir) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  const root = path.resolve(dir);
  if (argv.includes("--redirects")) {
    process.stdout.write(`${JSON.stringify(redirects(root), null, 2)}\n`);
    return;
  }
  const write = argv.includes("--write");
  const results = run(root, write);
  if (argv.includes("--json")) {
    process.stdout.write(
      `${JSON.stringify({ files: results, wrote: write }, null, 2)}\n`
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
  const changed = results.filter((result) => result.changed).length;
  const verb = write ? "changed" : "would change";
  const hint = write ? "" : " Re-run with --write to apply.";
  process.stdout.write(
    `\n${results.length} file(s) with findings, ${changed} ${verb}, ${reviewCount} item(s) to review.${hint}\n`
  );
};

main();
