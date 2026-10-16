#!/usr/bin/env node
// mintlify-codemod.mjs — deterministic, idempotent frontmatter codemod for the
// Mintlify → Blume migration. It rewrites ONLY the YAML frontmatter block of
// `.md`/`.mdx` files; the body is never touched. Two passes:
//
//   1. Icons  — remap Mintlify (FontAwesome) `icon:` names to their closest
//               Lucide equivalent (Blume is Lucide-only). Icons with no
//               equivalent (most brand marks) are dropped and reported, never
//               faked.
//   2. Fields — drop frontmatter keys Blume's strict schema rejects, and rename
//               Mintlify-only keys to their Blume nesting (sidebarTitle →
//               sidebar.label, tag → sidebar.badge, canonical → seo.canonical,
//               og:image → seo.image). Ambiguous keys (openapi/asyncapi/api)
//               are flagged for human review, not transformed.
//
// Design constraints:
//   - ZERO dependencies — safe in a pnpm-strict workspace with no hoisting; runs
//     with a bare `node`, needs nothing from the target repo's node_modules.
//   - Deterministic — no Date/Math.random; files processed in sorted order.
//   - Idempotent — running twice makes no further change. Source keys are gone
//     after the first pass; remapped icon values are already Lucide (every
//     mapped value that is also a source key maps to itself); a rename whose
//     target already exists is reported, not re-applied.
//   - Surgical — untouched lines keep their exact formatting; only the specific
//     lines that change are edited, so diffs stay small and reviewable.
//   - Reports every change per file (and every drop/flag), so nothing is silent.
//
// Usage:
//   node mintlify-codemod.mjs <path...>            # dry run — report only
//   node mintlify-codemod.mjs --write <path...>    # apply changes in place
//   node mintlify-codemod.mjs --json <path...>     # machine-readable report
//   node mintlify-codemod.mjs --help
//
// Paths may be files or directories; directories are walked for .md/.mdx.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

// --- Mintlify (FontAwesome) → Lucide icon map ------------------------------
// Keys are lowercased Mintlify icon names; values are Lucide names. A value of
// `null` means "no Lucide equivalent" (brand icons, mostly) — the icon line is
// removed and reported. Every value that is itself a key maps to the same name,
// which keeps the pass idempotent (a second run finds nothing to change). Lucide
// still ships a few brand marks (facebook, github, gitlab, instagram, linkedin,
// slack, twitter, youtube) that Blume's bundled set renders, so those map to
// themselves. FontAwesome's `apple` is the Apple logo and Lucide's is the
// fruit, so it has no equivalent. The FontAwesome `x` (close) maps to Lucide
// `x`; the X/Twitter brand is `x-twitter` and has no Lucide form.
const ICONS = {
  angular: null,
  apple: null,
  "arrow-right-from-bracket": "log-out",
  aws: null,
  bell: "bell",
  bolt: "zap",
  book: "book",
  "book-open": "book-open",
  boxes: "boxes",
  calendar: "calendar",
  "chart-column": "chart-column",
  "chart-line": "chart-line",
  "chart-simple": "chart-column",
  check: "check",
  "circle-check": "circle-check",
  "circle-exclamation": "circle-alert",
  "circle-info": "info",
  "circle-question": "circle-help",
  cloud: "cloud",
  code: "code",
  cog: "settings",
  comments: "messages-square",
  copy: "copy",
  cube: "box",
  cubes: "boxes",
  database: "database",
  "diagram-project": "workflow",
  discord: null,
  docker: null,
  download: "download",
  envelope: "mail",
  facebook: "facebook",
  "file-lines": "file-text",
  filter: "filter",
  flask: "flask-conical",
  folder: "folder",
  gauge: "gauge",
  "gauge-high": "gauge",
  gear: "settings",
  github: "github",
  gitlab: "gitlab",
  globe: "globe",
  google: null,
  heart: "heart",
  house: "house",
  info: "info",
  instagram: "instagram",
  java: null,
  js: null,
  key: "key",
  "layer-group": "layers",
  layers: "layers",
  "life-ring": "life-buoy",
  link: "link",
  linkedin: "linkedin",
  "location-dot": "map-pin",
  lock: "lock",
  magic: "sparkles",
  "magnifying-glass": "search",
  "map-marker": "map-pin",
  medium: null,
  microsoft: null,
  node: null,
  "node-js": null,
  npm: null,
  "pen-to-square": "square-pen",
  php: null,
  play: "play",
  puzzle: "puzzle",
  "puzzle-piece": "puzzle",
  python: null,
  question: "circle-help",
  react: null,
  "right-to-bracket": "log-in",
  robot: "bot",
  rocket: "rocket",
  rust: null,
  "screwdriver-wrench": "wrench",
  search: "search",
  server: "server",
  settings: "settings",
  shield: "shield",
  "shield-halved": "shield",
  sitemap: "network",
  slack: "slack",
  sparkles: "sparkles",
  star: "star",
  stripe: null,
  tag: "tag",
  telegram: null,
  terminal: "terminal",
  times: "x",
  toolbox: "wrench",
  "trash-can": "trash-2",
  "triangle-exclamation": "triangle-alert",
  twitter: "twitter",
  upload: "upload",
  user: "user",
  users: "users",
  vuejs: null,
  "wand-magic-sparkles": "sparkles",
  whatsapp: null,
  workflow: "workflow",
  wrench: "wrench",
  x: "x",
  "x-twitter": null,
  xmark: "x",
  youtube: "youtube",
  zap: "zap",
};

// --- Frontmatter field policy ----------------------------------------------
// Top-level keys Blume's strict schema rejects: delete the whole block, report.
const DROP = new Set(["groups", "hideApiMarker", "iconType", "public", "rss"]);

// Keys whose fate depends on their value: the source value (and its line) →
// the line that replaces it, the line itself to keep it, or `null` to drop it
// (a value Blume has no counterpart for, or one that restates its default).
const REPLACE = {
  hideFooterPagination: (value) =>
    value === "true" ? "pagination: false" : null,
  mode: (value, line) => (value === "assistant" ? null : line),
};

// Mintlify-only keys → Blume nested target. `[parent, child]`, plus a value
// mapper where the meaning flips: it returns the new value, or `null` to drop a
// value that restates Blume's default.
const RENAME = {
  boost: ["search", "boost"],
  canonical: ["seo", "canonical"],
  keywords: ["search", "keywords"],
  "og:image": ["seo", "image"],
  ogImage: ["seo", "image"],
  searchable: [
    "search",
    "exclude",
    (value) => (value === "false" ? "true" : null),
  ],
  sidebarTitle: ["sidebar", "label"],
  tag: ["sidebar", "badge"],
};

// Keys we deliberately do NOT auto-transform — they usually mean the page is an
// OpenAPI endpoint stub that should be deleted (Blume generates operation pages),
// or else a normal page that just loses the key. Flag for the human; never guess.
// (`api` is not one: a hand-written endpoint page keeps it as written.)
const FLAG = new Set(["asyncapi", "openapi"]);

// Which change kinds actually edit the file. Report-only kinds (flags,
// unknowns, conflicts, manual-rename notices) leave the bytes untouched.
const MUTATING = new Set(["drop", "icon-drop", "icon-remap", "rename"]);

// --- Frontmatter line model -------------------------------------------------

// Split a file into { fm, body, eol } or null when there's no `---` block.
const splitFrontmatter = (text) => {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/u);
  if (lines[0] !== "---") {
    return null;
  }
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) {
    return null;
  }
  return { body: lines.slice(end + 1), eol, fm: lines.slice(1, end) };
};

// Match a top-level (column-0) `key:` line, honoring quoted keys. Because the
// key class allows `:`, backtracking resolves `og:image: x` to key `og:image`.
const topKey = (line) => {
  const m = /^(?<q>["']?)(?<key>[^"'\s:][^"']*?)\k<q>\s*:(?<rest>\s.*|)$/u.exec(
    line
  );
  if (!m || /^\s/u.test(line)) {
    return null;
  }
  return { key: m.groups.key, value: (m.groups.rest ?? "").trim() };
};

// The line index range [start, endExclusive) of a top-level key's block: its
// indented lines plus any `- ` sequence items written flush at column 0,
// which YAML also reads as the key's value (`keywords:` then `- one`).
const blockRange = (fm, start) => {
  let end = start + 1;
  while (
    end < fm.length &&
    (fm[end] === "" || /^\s/u.test(fm[end]) || /^-(?:\s|$)/u.test(fm[end]))
  ) {
    end += 1;
  }
  // Trim trailing blank lines back out so the gap before the next key survives.
  while (end - 1 > start && fm[end - 1] === "") {
    end -= 1;
  }
  return [start, end];
};

// Does the block starting at `start` carry a nested child `childKey:`?
const findChild = (fm, start, endExclusive, childKey) => {
  for (let i = start + 1; i < endExclusive; i += 1) {
    const m = /^\s+(?<q>["']?)(?<key>[^"'\s:][^"']*?)\k<q>\s*:/u.exec(fm[i]);
    if (m && m.groups.key === childKey) {
      return i;
    }
  }
  return -1;
};

// --- The two passes ---------------------------------------------------------

// Remap `icon:` values in place. Mutates `fm`; returns change records.
const remapIcons = (fm) => {
  const changes = [];
  let i = 0;
  while (i < fm.length) {
    const m =
      /^(?<indent>\s*)icon:\s*(?<q>["']?)(?<name>[^"'#]*?)\k<q>\s*(?<comment>#.*)?$/u.exec(
        fm[i]
      );
    if (!m) {
      i += 1;
      continue;
    }
    const raw = m.groups.name.trim();
    // Empty, an object, or a template ref — leave it for the human.
    if (raw === "" || raw.startsWith("{") || raw.startsWith("$")) {
      i += 1;
      continue;
    }
    const key = raw.toLowerCase();
    if (!(key in ICONS)) {
      changes.push({ detail: raw, kind: "icon-unknown" });
      i += 1;
      continue;
    }
    const lucide = ICONS[key];
    if (lucide === null) {
      changes.push({ detail: raw, kind: "icon-drop" });
      fm.splice(i, 1);
      continue;
    }
    if (lucide !== raw) {
      const comment = m.groups.comment ? ` ${m.groups.comment}` : "";
      fm[i] = `${m.groups.indent}icon: ${lucide}${comment}`;
      changes.push({ detail: `${raw} → ${lucide}`, kind: "icon-remap" });
    }
    i += 1;
  }
  return changes;
};

// Insert `child: value` under `parent`, creating the parent block if needed.
const setNested = (fm, parent, child, value) => {
  for (let i = 0; i < fm.length; i += 1) {
    const tk = topKey(fm[i]);
    if (!tk || tk.key !== parent) {
      continue;
    }
    if (tk.value !== "") {
      // `parent: scalar` — can't nest under a scalar without clobbering it.
      return { ok: false, reason: "parent-is-scalar" };
    }
    const [start, end] = blockRange(fm, i);
    if (findChild(fm, start, end, child) !== -1) {
      return { ok: false, reason: "child-exists" };
    }
    fm.splice(start + 1, 0, `  ${child}: ${value}`);
    return { index: start + 1, ok: true };
  }
  // No parent block — append one at the end of the frontmatter.
  const index = fm.length;
  fm.push(`${parent}:`, `  ${child}: ${value}`);
  return { index, ok: true };
};

// Drop unsupported keys, rename Mintlify-only keys, flag ambiguous ones.
const rewriteFields = (fm) => {
  const changes = [];
  // Walk from the bottom so splices don't shift indices we haven't visited.
  for (let i = fm.length - 1; i >= 0; i -= 1) {
    const tk = topKey(fm[i]);
    if (!tk) {
      continue;
    }
    if (DROP.has(tk.key)) {
      const [start, end] = blockRange(fm, i);
      fm.splice(start, end - start);
      changes.push({ detail: tk.key, kind: "drop" });
      continue;
    }
    if (FLAG.has(tk.key)) {
      changes.push({ detail: tk.key, kind: "flag" });
      continue;
    }
    if (Object.hasOwn(REPLACE, tk.key)) {
      const [start, end] = blockRange(fm, i);
      const value = tk.value.replace(
        /^(?<q>["'])(?<inner>.*)\k<q>$/u,
        "$<inner>"
      );
      const line =
        end - start === 1 ? REPLACE[tk.key](value, fm[start]) : undefined;
      if (line === undefined) {
        changes.push({ detail: tk.key, kind: "rename-manual" });
      } else if (line === null) {
        fm.splice(start, 1);
        changes.push({ detail: `${tk.key}: ${value}`, kind: "drop" });
      } else if (line !== fm[start]) {
        const [key] = line.split(":");
        if (fm.some((other, j) => j !== start && topKey(other)?.key === key)) {
          changes.push({
            detail: `${tk.key} → ${key} (child-exists)`,
            kind: "rename-conflict",
          });
        } else {
          fm[start] = line;
          changes.push({
            detail: `${tk.key}: ${value} → ${line}`,
            kind: "rename",
          });
        }
      }
      continue;
    }
    const target = RENAME[tk.key];
    if (!target) {
      continue;
    }
    const [parent, child, map] = target;
    const [start, end] = blockRange(fm, i);
    if (end - start !== 1 || tk.value === "") {
      // Multi-line or valueless source — too structured to move safely.
      changes.push({
        detail: `${tk.key} → ${parent}.${child}`,
        kind: "rename-manual",
      });
      continue;
    }
    const value = map ? map(tk.value) : tk.value;
    if (value === null) {
      fm.splice(start, 1);
      changes.push({ detail: `${tk.key}: ${tk.value}`, kind: "drop" });
      continue;
    }
    // Remove the source line before inserting: setNested splices into the
    // parent block, and when that block sits above the source key the insert
    // would otherwise shift `start` onto the wrong line. Failure paths don't
    // mutate `fm`, so the line can be restored as-is on conflict.
    const [removed] = fm.splice(start, 1);
    const placed = setNested(fm, parent, child, value);
    if (placed.ok) {
      if (placed.index < start) {
        // The insert above the cursor pushed the unvisited lines down one
        // slot; revisit the current index so none of them get skipped.
        i += 1;
      }
      changes.push({
        detail: `${tk.key} → ${parent}.${child}`,
        kind: "rename",
      });
    } else {
      fm.splice(start, 0, removed);
      // Target already set, or parent is a scalar — leave the source in place so
      // no data is lost, and report it for manual resolution.
      changes.push({
        detail: `${tk.key} → ${parent}.${child} (${placed.reason})`,
        kind: "rename-conflict",
      });
    }
  }
  return changes.toReversed();
};

// --- Driver -----------------------------------------------------------------

const transform = (text) => {
  const split = splitFrontmatter(text);
  if (!split) {
    return { changed: false, changes: [], text };
  }
  const fm = [...split.fm];
  const changes = [...remapIcons(fm), ...rewriteFields(fm)];
  const rebuilt = ["---", ...fm, "---", ...split.body].join(split.eol);
  const changed = rebuilt !== text && changes.some((c) => MUTATING.has(c.kind));
  return { changed, changes, text: changed ? rebuilt : text };
};

const collectFiles = (paths) => {
  const out = [];
  const walk = (p) => {
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const name of readdirSync(p).toSorted()) {
        if (name === "node_modules" || name.startsWith(".")) {
          continue;
        }
        walk(path.join(p, name));
      }
    } else if (/\.mdx?$/u.test(p)) {
      out.push(p);
    }
  };
  for (const p of paths.toSorted()) {
    walk(p);
  }
  return out;
};

const LABEL = {
  drop: "dropped",
  flag: "FLAG (review)",
  "icon-drop": "icon dropped (no Lucide equivalent)",
  "icon-remap": "icon",
  "icon-unknown": "icon unknown (verify at lucide.dev)",
  rename: "renamed",
  "rename-conflict": "rename conflict (left in place)",
  "rename-manual": "rename needs manual edit",
};

const HELP = [
  "mintlify-codemod — icon + frontmatter pass for Mintlify → Blume",
  "",
  "  node mintlify-codemod.mjs <path...>          dry run (report only)",
  "  node mintlify-codemod.mjs --write <path...>  apply in place",
  "  node mintlify-codemod.mjs --json <path...>   JSON report",
  "",
].join("\n");

const main = () => {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  const write = argv.includes("--write");
  const asJson = argv.includes("--json");
  const paths = argv.filter((a) => !a.startsWith("--"));
  const files = collectFiles(paths);

  const report = [];
  let changedCount = 0;
  for (const file of files) {
    const before = readFileSync(file, "utf-8");
    const { changed, changes, text } = transform(before);
    if (changes.length === 0) {
      continue;
    }
    if (changed && write) {
      writeFileSync(file, text, "utf-8");
    }
    if (changed) {
      changedCount += 1;
    }
    report.push({ changes, file: path.relative(process.cwd(), file) });
  }

  if (asJson) {
    process.stdout.write(
      `${JSON.stringify({ files: report, wrote: write }, null, 2)}\n`
    );
    return;
  }

  for (const entry of report) {
    process.stdout.write(`\n${entry.file}\n`);
    for (const c of entry.changes) {
      process.stdout.write(`  ${LABEL[c.kind] ?? c.kind}: ${c.detail}\n`);
    }
  }
  const verb = write ? "changed" : "would change";
  const hint = write ? "" : " Re-run with --write to apply.";
  process.stdout.write(
    `\n${report.length} file(s) with findings, ${changedCount} ${verb}.${hint}\n`
  );
};

main();
