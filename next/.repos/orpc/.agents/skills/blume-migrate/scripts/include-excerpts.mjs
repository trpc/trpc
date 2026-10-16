#!/usr/bin/env node
// include-excerpts.mjs — generate the code excerpts a migrated site includes.
//
// Blume's `<include>` splices a whole file from inside the content root. The
// tools sites migrate from could include part of a file from anywhere in the
// repo: mdBook by `ANCHOR:` markers or line range, VitePress by `#region`
// markers, MkDocs snippets by line range. Pasting each excerpt into its page
// would freeze code the project still compiles and tests, so this script
// regenerates the excerpts before every build instead. Copy it into the
// project, next to its manifest, and run it ahead of `blume dev`, `build`,
// and `validate`:
//
//   "build": "node include-excerpts.mjs && blume build"
//
// The manifest (`excerpts.json` by default) names each excerpt file, under
// `out`, and what goes in it. Every path is relative to the manifest's folder.
// `out` must be a `_`-prefixed folder inside the content root: Blume never
// publishes it, and `<include>/_excerpts/x.rs</include>` reads from it.
//
//   {
//     "out": "docs/_excerpts",
//     "excerpts": {
//       "abi.rs": "../examples/counter/src/lib.rs:contract_abi",
//       "state.ts": { "file": "../src/state.ts", "region": "state", "dedent": true },
//       "main.rs": { "file": "../src/main.rs", "lines": "12-30" },
//       "transfer.rs": [
//         { "text": "impl Contract for Token {" },
//         { "file": "../src/contract.rs", "anchor": "transfer" },
//         { "text": "}" }
//       ]
//     }
//   }
//
// An excerpt is one part or an array of parts, joined line by line:
//
//   "path:selector"        mdBook's {{#include}} argument, selected the way
//                          mdBook does: "path" (the whole file), "path:name"
//                          (an anchor), "path:N" (line N), "path:N:M",
//                          "path:N:" (to the end), "path::M" (from the start).
//                          Where mdBook showed an empty or cut-short block (a
//                          missing anchor, a range past the end), this reports
//                          a problem instead.
//   { "file" }             the whole file.
//   { "file", "anchor" }   the lines between `ANCHOR: name` and
//                          `ANCHOR_END: name`, minus every ANCHOR line, as
//                          mdBook does. An anchor that never ends runs to the
//                          end of the file.
//   { "file", "region" }   the lines between `#region name` and its
//                          `#endregion`, in any comment style VS Code folds
//                          (`// #region`, `# region`, `<!-- #region -->`,
//                          `/* #region */`, `#pragma region`), minus every
//                          region marker. An `#endregion` without a name closes
//                          the innermost open region. VitePress pairs nested
//                          markers its own way (1.x ignores an unnamed
//                          `#endregion`, 2.x closes on the first one), so
//                          compare a nested region with the old build.
//   { "file", "lines" }    1-based and inclusive: "12-30", "12-" (to the end),
//                          "-30" (from the start), "12" (that line only).
//   { "text" }             literal lines, for code around a selection.
//
// A file part may add "dedent": true to remove the indentation its lines share
// (VitePress dedents a `<<<` region; mdBook doesn't).
//
// Before writing anything, every entry is checked, and every problem is
// reported in one pass: a missing file, anchor, or region, a line range past
// the end of its file, a selection with no lines. Then it exits 1. mdBook
// showed a missing anchor as an empty block, without a warning, so a migrated
// book usually has several.
//
// A line range keeps selecting the same line numbers when the file changes
// around them, so it goes stale without an error. Prefer an anchor or region
// marker in the source wherever you can add one.
//
// Usage:
//
//   node include-excerpts.mjs                  # excerpts.json: check, then write
//   node include-excerpts.mjs path/to/excerpts.json
//   node include-excerpts.mjs --check          # report only: exit 1 on a problem
//                                              # or an excerpt that's out of date
//
// It rewrites only the files whose content changed, and deletes the files it
// wrote before that the manifest no longer names. It lists what it wrote in
// `out/.include-excerpts.json` and never deletes a file it didn't write, nor
// writes through a symbolic link.
//
// Zero dependencies: runs on a bare Node.js 22 with nothing installed.

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const USAGE = [
  "Usage: node include-excerpts.mjs [manifest] [--check]",
  "",
  "  manifest   the excerpts file (default: excerpts.json)",
  "  --check    report problems and out-of-date excerpts; write nothing",
].join("\n");

// --- Manifest values -----------------------------------------------------------

// The manifest comes from JSON.parse: strings, numbers, booleans, null,
// arrays, and plain objects.
const isText = (value) => value === String(value);
const isRecord = (value) =>
  value !== null &&
  value !== undefined &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const PART_KEYS = new Set(["anchor", "dedent", "file", "lines", "region"]);

// --- Selection -----------------------------------------------------------------

// mdBook's own patterns (crates/mdbook-driver, links/take_lines.rs). Rust's
// `\w` is Unicode-aware, so an anchor can be `café`.
const ANCHOR_NAME = String.raw`[\p{Alphabetic}\p{M}\p{Nd}\p{Pc}\p{Join_Control}-]+`;
const ANCHOR_START = new RegExp(
  String.raw`ANCHOR:\s*(?<name>${ANCHOR_NAME})`,
  "u"
);
const ANCHOR_END = new RegExp(
  String.raw`ANCHOR_END:\s*(?<name>${ANCHOR_NAME})`,
  "u"
);

// VS Code's folding markers, one alternative per comment syntax: line comments
// (`//`, with the `#` optional as in JS and TS; `--`, `::`, and `REM` with it
// required), hash comments (`#region`, `# region`, `# #region`,
// `#pragma region`, Visual Basic's `#Region` and `#End Region`), HTML and
// Markdown, CSS, and F#. A marker is the whole line, so a comment that only
// mentions a region (`// region: us-east`) isn't one.
const REGION_MARKER =
  /^\s*(?:\/\/\s*#?|(?:--|::|@?rem\s)\s*#|#\s*(?:#\s*|pragma\s+)?|<!--\s*#?|\/\*\s*#|\(\*\s*#)(?<end>end\s?)?region(?:\s+(?:"(?<quoted>[^"]*)"|(?<name>[\w.-]+)))?\s*(?:-->|\*\/|\*\))?\s*$/iu;

const regionMarker = (line) => {
  const match = REGION_MARKER.exec(line);
  if (!match) {
    return;
  }
  const { end, name, quoted } = match.groups;
  return { end: Boolean(end), name: quoted ?? name ?? "" };
};

/** The lines between `ANCHOR: name` and `ANCHOR_END: name`, as mdBook takes them. */
const anchorLines = (lines, name) => {
  const kept = [];
  let open = false;
  for (const line of lines) {
    if (!open) {
      open = ANCHOR_START.exec(line)?.groups.name === name;
    } else if (ANCHOR_END.exec(line)?.groups.name === name) {
      return kept;
    } else if (!(ANCHOR_START.test(line) || ANCHOR_END.test(line))) {
      kept.push(line);
    }
  }
  return open ? kept : undefined;
};

/** The index of the line that closes the region opened at `start`, else the end. */
const regionEnd = (lines, start) => {
  const open = [regionMarker(lines[start]).name];
  for (let i = start + 1; i < lines.length; i += 1) {
    const marker = regionMarker(lines[i]);
    if (marker?.end) {
      const index = marker.name
        ? open.lastIndexOf(marker.name)
        : open.length - 1;
      if (index === 0) {
        return i;
      }
      if (index > 0) {
        open.length = index;
      }
    } else if (marker) {
      open.push(marker.name);
    }
  }
  return lines.length;
};

/** The lines of the first region called `name`, minus every region marker. */
const regionLines = (lines, name) => {
  const start = lines.findIndex((line) => {
    const marker = regionMarker(line);
    return marker !== undefined && !marker.end && marker.name === name;
  });
  if (start === -1) {
    return;
  }
  return lines
    .slice(start + 1, regionEnd(lines, start))
    .filter((line) => regionMarker(line) === undefined);
};

const LINE_RANGE = /^(?<from>\d*)(?<dash>-)?(?<to>\d*)$/u;

/**
 * `{ explicit, from, to }` (0-based, `to` exclusive) for "12-30", "12-",
 * "-30", or "12"; `explicit` is false when the range runs to the end.
 */
const parseLines = (spec, length) => {
  const match = LINE_RANGE.exec(String(spec).trim());
  if (!match || (match.groups.from === "" && match.groups.to === "")) {
    return;
  }
  const { dash, from, to } = match.groups;
  const first = from === "" ? 1 : Number(from);
  let last = Number(to);
  if (!dash) {
    last = first;
  } else if (to === "") {
    last = length;
  }
  return { explicit: !dash || to !== "", from: first - 1, to: last };
};

/** mdBook's `path:selector`: a part object, as mdBook would select it. */
const parseMdbookSpec = (spec) => {
  const [file = "", rawFirst = "", second] = spec.split(":");
  if (!/^\d*$/u.test(rawFirst)) {
    return { anchor: rawFirst, file };
  }
  // mdBook reads line 0 as line 1.
  const first = rawFirst === "" ? "" : String(Math.max(1, Number(rawFirst)));
  if (second === undefined) {
    return first === "" ? { file } : { file, lines: first };
  }
  return { file, lines: `${first}-${/^\d+$/u.test(second) ? second : ""}` };
};

/** Remove the indentation every non-blank line shares. */
const dedent = (lines) => {
  const widths = lines
    .filter((line) => line.trim() !== "")
    .map((line) => line.length - line.trimStart().length);
  const width = widths.length > 0 ? Math.min(...widths) : 0;
  return width === 0 ? lines : lines.map((line) => line.slice(width));
};

// --- Checking ------------------------------------------------------------------

/** The anchor, region, or file a part selects lines from. */
const sourceOf = (part) => {
  if (part.anchor !== undefined) {
    return `anchor "${part.anchor}" in ${part.file}`;
  }
  if (part.region !== undefined) {
    return `region "${part.region}" in ${part.file}`;
  }
  return part.file;
};

const describe = (part) =>
  part.lines === undefined
    ? sourceOf(part)
    : `lines ${part.lines} of ${sourceOf(part)}`;

/** The lines `part` names before any line range: `{ lines }`, or `{ problem }`. */
const markedLines = (part, source) => {
  if (part.anchor !== undefined) {
    const lines = anchorLines(source, part.anchor);
    return lines
      ? { lines }
      : { problem: `no "ANCHOR: ${part.anchor}" line in ${part.file}` };
  }
  if (part.region !== undefined) {
    const lines = regionLines(source, part.region);
    return lines
      ? { lines }
      : { problem: `no "#region ${part.region}" marker in ${part.file}` };
  }
  return { lines: source };
};

/** `lines` cut to `part.lines`: `{ lines }`, or `{ problem }`. */
const rangeOf = (part, lines) => {
  if (part.lines === undefined) {
    return { lines };
  }
  const range = parseLines(part.lines, lines.length);
  if (!range || range.from < 0 || (range.explicit && range.to <= range.from)) {
    return { problem: `"${part.lines}" isn't a line range (${part.file})` };
  }
  if (range.to > lines.length || range.from >= lines.length) {
    return {
      problem: `lines ${part.lines} run past the end of ${sourceOf(part)} (${lines.length} lines)`,
    };
  }
  return { lines: lines.slice(range.from, range.to) };
};

/** Read one file part: `{ lines }`, or `{ problem }`. */
const selectFile = (part, base, readSource) => {
  const source = readSource(path.resolve(base, part.file));
  if (source === undefined) {
    return { problem: `no file at ${part.file}` };
  }
  const marked = markedLines(part, source);
  const selected = marked.problem ? marked : rangeOf(part, marked.lines);
  if (selected.problem) {
    return selected;
  }
  if (selected.lines.length === 0) {
    return { problem: `${describe(part)} selects no lines` };
  }
  return {
    lines: part.dedent === true ? dedent(selected.lines) : selected.lines,
  };
};

/** One manifest part as a part object, or a problem. */
const normalizePart = (raw) => {
  if (isText(raw)) {
    return { part: parseMdbookSpec(raw) };
  }
  if (!isRecord(raw)) {
    return { problem: "a part must be a string or an object" };
  }
  if (raw.text !== undefined) {
    return Object.keys(raw).length === 1 && isText(raw.text)
      ? { part: raw }
      : { problem: '{ "text" } takes one string and nothing else' };
  }
  const unknown = Object.keys(raw).filter((key) => !PART_KEYS.has(key));
  if (unknown.length > 0) {
    return {
      problem: `unknown key ${unknown.map((key) => `"${key}"`).join(", ")}`,
    };
  }
  if (!isText(raw.file) || raw.file === "") {
    return { problem: 'a part needs a "file" (or "text")' };
  }
  if (raw.anchor !== undefined && raw.region !== undefined) {
    return { problem: 'a part takes "anchor" or "region", not both' };
  }
  const marker = raw.anchor ?? raw.region;
  if (marker !== undefined && (!isText(marker) || marker === "")) {
    return { problem: '"anchor" and "region" take a name' };
  }
  return { part: raw };
};

/** One part's lines: `{ lines }`, or `{ problem }`. */
const partLines = (raw, base, readSource) => {
  const { part, problem } = normalizePart(raw);
  if (problem) {
    return { problem };
  }
  if (part.text !== undefined) {
    return { lines: part.text.split(/\r?\n/u) };
  }
  return selectFile(part, base, readSource);
};

/** Whether `name` stays inside the output folder. */
const isInside = (name) =>
  name !== "" &&
  !path.isAbsolute(name) &&
  !name.includes("\\") &&
  name
    .split("/")
    .every((segment) => segment !== "" && segment !== "." && segment !== "..");

/** A cached reader: a file's lines without the final newline, else undefined. */
const sourceReader = () => {
  const sources = new Map();
  return (file) => {
    if (!sources.has(file)) {
      const lines =
        existsSync(file) && statSync(file).isFile()
          ? readFileSync(file, "utf-8").split(/\r?\n/u)
          : undefined;
      if (lines?.at(-1) === "") {
        lines.pop();
      }
      sources.set(file, lines);
    }
    return sources.get(file);
  };
};

/** Every excerpt's text, and every problem the manifest has. */
const buildExcerpts = (entries, base) => {
  const readSource = sourceReader();
  const excerpts = new Map();
  const problems = [];
  const names = Object.keys(entries);
  for (const [name, value] of Object.entries(entries)) {
    if (!isInside(name)) {
      problems.push(`"${name}": the name must be a relative path inside out`);
      continue;
    }
    if (names.some((other) => other.startsWith(`${name}/`))) {
      problems.push(`"${name}": another excerpt uses it as a folder`);
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      problems.push(`"${name}": an empty list selects no lines`);
      continue;
    }
    const lines = [];
    for (const raw of Array.isArray(value) ? value : [value]) {
      const result = partLines(raw, base, readSource);
      if (result.problem) {
        problems.push(`"${name}": ${result.problem}`);
      } else {
        lines.push(...result.lines);
      }
    }
    excerpts.set(name, `${lines.join("\n")}\n`);
  }
  return { excerpts, problems };
};

// --- Writing -------------------------------------------------------------------

// The excerpts a run wrote, so a later run deletes only those.
const RECORD = ".include-excerpts.json";

/** The names the last run wrote, as recorded in `out`. */
const recorded = (out) => {
  try {
    const names = JSON.parse(readFileSync(path.join(out, RECORD), "utf-8"));
    return Array.isArray(names) ? names.filter(isText).filter(isInside) : [];
  } catch {
    return [];
  }
};

/** A path's own entry, without following a symbolic link, else nothing. */
const entryAt = (file) => {
  try {
    return lstatSync(file, { throwIfNoEntry: false });
  } catch {
    // ENOTDIR: a file sits where a folder on the path should be.
    return null;
  }
};

/**
 * Why `name` can't be written or deleted safely, else undefined: a symbolic
 * link at it or above it inside `out` would send the change elsewhere, and a
 * file where a folder goes (or the reverse) would stop it halfway.
 */
const unsafeTarget = (out, name) => {
  const segments = name.split("/");
  for (let i = 1; i <= segments.length; i += 1) {
    const entry = entryAt(path.join(out, ...segments.slice(0, i)));
    const at = `${segments.slice(0, i).join("/")} in out`;
    if (entry?.isSymbolicLink()) {
      return `"${name}": ${at} is a symbolic link`;
    }
    if (entry && i < segments.length && !entry.isDirectory()) {
      return `"${name}": ${at} is a file, not a folder`;
    }
    if (entry && i === segments.length && !entry.isFile()) {
      return `"${name}": ${at} is a folder, not a file`;
    }
  }
};

/** Remove the empty folders under `dir`, deepest first. */
const pruneEmpty = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const child = path.join(dir, entry.name);
      pruneEmpty(child);
      if (readdirSync(child).length === 0) {
        rmdirSync(child);
      }
    }
  }
};

/** What writing would change: `{ problems, stale, writes }`. */
const plan = (excerpts, out) => {
  const stale = recorded(out).filter(
    (name) => !excerpts.has(name) && entryAt(path.join(out, name))
  );
  const problems = [...excerpts.keys(), ...stale]
    .map((name) => unsafeTarget(out, name))
    .filter(Boolean);
  if (problems.length > 0) {
    return { problems, stale: [], writes: [] };
  }
  const writes = [...excerpts.keys()].filter((name) => {
    const file = path.join(out, name);
    return (
      !existsSync(file) || readFileSync(file, "utf-8") !== excerpts.get(name)
    );
  });
  return { problems, stale, writes };
};

const apply = (excerpts, out, changes) => {
  mkdirSync(out, { recursive: true });
  for (const name of changes.writes) {
    const file = path.join(out, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, excerpts.get(name));
  }
  for (const name of changes.stale) {
    rmSync(path.join(out, name));
  }
  writeFileSync(
    path.join(out, RECORD),
    `${JSON.stringify([...excerpts.keys()].toSorted(), null, 2)}\n`
  );
  pruneEmpty(out);
};

// --- Main ----------------------------------------------------------------------

const fail = (message, code) => {
  process.stderr.write(`${message}\n`);
  process.exit(code);
};

const readManifest = (file) => {
  if (!existsSync(file)) {
    fail(`include-excerpts: no manifest at ${file}\n\n${USAGE}`, 2);
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(file, "utf-8"));
  } catch (error) {
    fail(`include-excerpts: ${file} isn't valid JSON: ${error.message}`, 2);
  }
  if (
    !(isRecord(manifest) && isText(manifest.out) && isRecord(manifest.excerpts))
  ) {
    fail(
      `include-excerpts: ${file} needs "out" (a folder) and "excerpts" (an object)`,
      2
    );
  }
  return manifest;
};

/** `{ check, manifestFile }` from the command line, or exit with the usage. */
const parseCli = (args) => {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
  }
  const flags = args.filter((arg) => arg.startsWith("-"));
  const files = args.filter((arg) => !arg.startsWith("-"));
  const unexpected = [
    ...flags.filter((flag) => flag !== "--check"),
    ...files.slice(1),
  ];
  if (unexpected.length > 0) {
    fail(`include-excerpts: unexpected ${unexpected.join(" ")}\n\n${USAGE}`, 2);
  }
  return {
    check: flags.includes("--check"),
    manifestFile: path.resolve(files[0] ?? "excerpts.json"),
  };
};

/** A path with every symbolic link resolved, as far as it exists. */
const resolved = (file) => {
  if (existsSync(file)) {
    return realpathSync(file);
  }
  const parent = path.dirname(file);
  return parent === file
    ? file
    : path.join(resolved(parent), path.basename(file));
};

/** The output folder, refused unless it's a `_` folder that doesn't hold the manifest. */
const outFolder = (manifest, manifestFile) => {
  const out = path.resolve(path.dirname(manifestFile), manifest.out);
  const real = resolved(out);
  if (
    !path.basename(out).startsWith("_") ||
    !path.basename(real).startsWith("_") ||
    resolved(manifestFile).startsWith(`${real}${path.sep}`) ||
    (existsSync(out) && !statSync(out).isDirectory())
  ) {
    fail(
      'include-excerpts: "out" must be a folder whose name starts with "_" (like docs/_excerpts), not a link to a folder without one, and not the folder holding the manifest: Blume doesn\'t publish it, and the script writes and deletes excerpts there',
      2
    );
  }
  return out;
};

const reportCheck = (excerpts, changes, label) => {
  const lines = [
    ...changes.writes.map((name) => `out of date: ${name}`),
    ...changes.stale.map((name) => `not in the manifest: ${name}`),
  ];
  if (lines.length > 0) {
    fail(
      [
        ...lines,
        `include-excerpts: ${label} is out of date; run without --check.`,
      ].join("\n"),
      1
    );
  }
  process.stdout.write(
    `include-excerpts: ${excerpts.size} excerpt(s) in ${label}, all current\n`
  );
};

const main = () => {
  const { check, manifestFile } = parseCli(process.argv.slice(2));
  const manifest = readManifest(manifestFile);
  const out = outFolder(manifest, manifestFile);
  const built = buildExcerpts(manifest.excerpts, path.dirname(manifestFile));
  const { excerpts } = built;
  const changes = plan(excerpts, out);
  const problems = [...built.problems, ...changes.problems];
  if (problems.length > 0) {
    const name = path.basename(manifestFile);
    fail(
      [
        ...problems.map((problem) => `${name}: ${problem}`),
        `include-excerpts: ${problems.length} problem(s); nothing written.`,
      ].join("\n"),
      1
    );
  }
  const label = path.relative(process.cwd(), out) || ".";
  if (check) {
    reportCheck(excerpts, changes, label);
    return;
  }
  apply(excerpts, out, changes);
  process.stdout.write(
    `include-excerpts: ${excerpts.size} excerpt(s) in ${label} (${changes.writes.length} written, ${changes.stale.length} removed)\n`
  );
};

main();
