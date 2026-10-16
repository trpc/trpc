#!/usr/bin/env node
// operation-routes.mjs: list the route Blume gave every generated API
// operation page, read from a built site. Migrations need it to redirect a
// source's old operation URLs (Redocly, ReadMe, Fern, …) to Blume's: match an
// old URL to its endpoint in the spec, then look the endpoint up here.
//
// It reads Blume's own output rather than re-deriving Blume's slug rules, so it
// stays right when those rules change. The source is the Markdown mirror
// (`<route>.md`) Blume writes for every page:
//
//   - A generated operation page's mirror has `type: openapi-operation` in its
//     frontmatter, and its `<Operation>` component downlevels to the endpoint
//     in the spec's notation, alone on a line: `GET /pets/{id}`. A webhook
//     reads `POST petAdopted`, and the next line is the serializer's
//     `**Webhook.** The API sends this request to your endpoint.` note. (Its
//     `Webhook` search tag isn't used: an operation's spec tag is a search tag
//     too, and an API can have a tag named "Webhook".)
//   - A reference's overview page, at the reference's route, lists every
//     operation it holds, by tag, each one under that route:
//     - [`GET /pets/{id}`](/api/pets/get-pets-id) — Get a pet.
//     which ties each operation to its reference (two specs can both have
//     `GET /status`). A list like that on any other page (a guide linking the
//     endpoints it uses) points outside the page's own route, so it's skipped.
//
// A server build keeps Astro's `dist/client` + `dist/server` split, with the
// pages (and their mirrors) in `dist/client`: given such a `dist`, this reads
// `dist/client`. A Vercel server build writes them to `.vercel/output/static`
// instead: pass that directory.
//
// Why the mirrors: Blume writes them on every build with no switch to turn
// them off, and the docs (discoverability/markdown) promise both downlevels.
// The JSON API (`api/docs/pages.json`) carries the same Markdown but can be
// disabled with `agents.api: false`; llms.txt has titles but no endpoints; and
// no output carries operationIds. A project that replaces the `Operation` or
// `ApiTagOperations` serializer through `agents.markdownComponents` changes
// what this reads.
//
// operationIds: pass a spec with `--spec <reference-route>=<file.json>` and
// each endpoint gains its spec `operationId`, matched by method and path (no
// slug logic). JSON only, to stay dependency-free: convert YAML first, e.g.
// `npx @redocly/cli bundle openapi.yaml --output openapi.json`.
//
// Zero dependencies, read-only, deterministic (sorted output).
//
// Usage:
//   node operation-routes.mjs [dist]                       # default: ./dist
//   node operation-routes.mjs dist --spec /api=openapi.json
//   node operation-routes.mjs .vercel/output/static        # Vercel server build
//   node operation-routes.mjs --help
//
// Output (stdout, JSON):
//   {
//     "references": {
//       "/api": {
//         "title": "Acme API",
//         "endpoints": { "GET /pets/{id}": "/api/pets/get-pets-id", … },
//         "webhooks": ["POST petAdopted"],
//         "operationIds": { "getPet": "/api/pets/get-pets-id" }   // with --spec
//       }
//     },
//     "unlisted": { "GET /x": ["/route"] }   // operation pages no overview lists
//   }
// Warnings go to stderr. Exit 1 when the directory holds no operation pages.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const HELP = `Usage: node operation-routes.mjs [dist] [--spec <route>=<file.json>]...

Reads a built Blume site (default ./dist) and prints, per API reference, a map
from each operation's endpoint ("METHOD /path", or "METHOD name" for a webhook)
to the route of its generated page. --spec adds operationIds from a JSON spec
for the reference mounted at <route>.

A server build's pages are in dist/client, which is read when dist holds
client/ and server/. For a Vercel server build, pass .vercel/output/static.`;

const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
  "query",
];

const fail = (message) => {
  process.stderr.write(`operation-routes: ${message}\n`);
  process.exit(1);
};

const warn = (message) => {
  process.stderr.write(`operation-routes: warning: ${message}\n`);
};

const normalizeRoute = (route) => {
  const trimmed = route.replace(/\/+$/u, "");
  if (trimmed === "") {
    return "/";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

/** An object with its keys in code-point order, for deterministic output. */
const sortObject = (object) =>
  Object.fromEntries(
    Object.entries(object).toSorted(([a], [b]) => (a < b ? -1 : 1))
  );

// --- arguments ---------------------------------------------------------------

const parseSpecArg = (value) => {
  const split = value ? value.indexOf("=") : -1;
  if (split <= 0 || split === value.length - 1) {
    fail(`--spec takes <reference-route>=<file.json>, got "${value}".`);
  }
  return {
    file: value.slice(split + 1),
    route: normalizeRoute(value.slice(0, split)),
  };
};

const parseArgs = (argv) => {
  const options = { dist: "dist", specs: [] };
  let distSet = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${HELP}\n`);
      process.exit(0);
    }
    if (arg === "--spec") {
      index += 1;
      options.specs.push(parseSpecArg(argv[index]));
    } else if (arg.startsWith("--spec=")) {
      options.specs.push(parseSpecArg(arg.slice("--spec=".length)));
    } else if (arg.startsWith("-")) {
      fail(`unknown option ${arg}. Run with --help.`);
    } else if (distSet) {
      fail(`one dist directory only (got "${options.dist}" and "${arg}").`);
    } else {
      options.dist = arg;
      distSet = true;
    }
  }
  return options;
};

// --- reading the mirrors -------------------------------------------------------

/** Every `.md` file under `dir`, as paths relative to it, sorted. */
const markdownFiles = (dir) => {
  const found = [];
  const walk = (relative) => {
    const entries = readdirSync(path.join(dir, relative), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(child);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        found.push(child);
      }
    }
  };
  walk("");
  return found.toSorted();
};

/** The route a mirror file stands for: `api/pets/x.md` → `/api/pets/x`. */
const routeOf = (file) => {
  const stem = file.slice(0, -".md".length);
  return stem === "index" ? "/" : `/${stem}`;
};

/** Split a mirror into its frontmatter lines and its body. */
const splitFrontmatter = (text) => {
  const normalized = text.replaceAll("\r\n", "\n");
  const end = normalized.startsWith("---\n")
    ? normalized.indexOf("\n---", 3)
    : -1;
  if (end === -1) {
    return { body: normalized, frontmatter: [] };
  }
  const after = normalized.indexOf("\n", end + 1);
  return {
    body: after === -1 ? "" : normalized.slice(after + 1),
    frontmatter: normalized.slice(4, end).split("\n"),
  };
};

/** A top-level scalar frontmatter value (`title: Get a pet`), unquoted. */
const topLevelValue = (lines, key) => {
  const prefix = `${key}:`;
  const line = lines.find((candidate) => candidate.startsWith(prefix));
  if (!line) {
    return;
  }
  const value = line.slice(prefix.length).trim();
  const quoted = /^(?<quote>["'])(?<inner>.*)\k<quote>$/u.exec(value);
  if (!quoted) {
    return value;
  }
  const { inner, quote } = quoted.groups;
  return quote === "'"
    ? inner.replaceAll("''", "'")
    : inner.replaceAll('\\"', '"');
};

/** Body lines outside fenced code blocks. */
const proseLines = (body) => {
  const lines = [];
  let fence = null;
  for (const line of body.split("\n")) {
    const marker = /^\s*(?<run>`{3,}|~{3,})/u.exec(line);
    if (!marker) {
      if (fence === null) {
        lines.push(line);
      }
      continue;
    }
    const { run } = marker.groups;
    if (fence === null) {
      fence = run;
    } else if (run[0] === fence[0] && run.length >= fence.length) {
      fence = null;
    }
  }
  return lines;
};

/** The text of an inline-code span that fills `text` entirely, if it does. */
const wholeInlineCode = (text) => {
  const match = /^(?<ticks>`+)(?<code>.+?)\k<ticks>$/u.exec(text.trim());
  if (!match) {
    return;
  }
  const { code } = match.groups;
  // A span padded to hold a backtick (`` `x` ``) carries one space each side.
  return code.startsWith(" ") && code.endsWith(" ") && code.trim() !== ""
    ? code.slice(1, -1)
    : code;
};

/**
 * An operation page's endpoint: the last line outside code that is only an
 * inline-code span. `<Operation>` is appended after the description, so a
 * description that happens to hold such a line comes first. A webhook's
 * endpoint line is followed by the `**Webhook.**` note.
 */
const operationOf = (body) => {
  const lines = proseLines(body).filter((line) => line.trim() !== "");
  let at = -1;
  let endpoint;
  for (const [index, line] of lines.entries()) {
    const code = wholeInlineCode(line);
    if (code !== undefined) {
      at = index;
      endpoint = code;
    }
  }
  const next = at === -1 ? "" : (lines[at + 1] ?? "");
  return { endpoint, webhook: next.trim().startsWith("**Webhook.**") };
};

/** `- [`GET /x`](/route) — Summary.` items on an overview page. */
const LIST_ITEM =
  /^-\s+\[(?<ticks>`+)(?<code>.+?)\k<ticks>\]\((?:<(?<angled>[^>]+)>|(?<plain>[^)\s]+))\)/u;

const listedOperations = (body) => {
  const items = [];
  for (const line of proseLines(body)) {
    const match = LIST_ITEM.exec(line);
    if (match) {
      const { angled, code, plain } = match.groups;
      items.push({
        endpoint: wholeInlineCode(`\`${code}\``) ?? code,
        href: angled ?? plain,
      });
    }
  }
  return items;
};

/** A link's path, decoded, whatever origin or encoding it was written with. */
const hrefPath = (href) => {
  let pathname = href;
  try {
    ({ pathname } = new URL(href, "http://blume.invalid"));
    pathname = decodeURI(pathname);
  } catch {
    // An unparseable href is matched as written; it simply finds nothing.
  }
  return normalizeRoute(pathname);
};

/** The operation route an overview link points at (it may carry a base). */
const resolveHref = (href, operationRoutes) => {
  const route = hrefPath(href);
  if (operationRoutes.has(route)) {
    return route;
  }
  // `deployment.base` prefixes links but not the files in dist/: take the
  // longest operation route the link ends with, behind a `/base` prefix.
  let best;
  for (const candidate of operationRoutes) {
    const prefix = route.slice(0, route.length - candidate.length);
    if (
      route.endsWith(candidate) &&
      prefix.startsWith("/") &&
      (best === undefined || candidate.length > best.length)
    ) {
      best = candidate;
    }
  }
  return best;
};

/** Every operation page and every overview list, from the dist's mirrors. */
const readMirrors = (dist) => {
  // route → { endpoint, title, webhook }
  const pages = new Map();
  // { items, route, title }
  const overviews = [];
  for (const file of markdownFiles(dist)) {
    const { body, frontmatter } = splitFrontmatter(
      readFileSync(path.join(dist, file), "utf-8")
    );
    const route = routeOf(file);
    const title = topLevelValue(frontmatter, "title");
    if (topLevelValue(frontmatter, "type") === "openapi-operation") {
      pages.set(route, { ...operationOf(body), title });
    } else {
      const items = listedOperations(body);
      if (items.length > 0) {
        overviews.push({ items, route, title });
      }
    }
  }
  return { overviews, pages };
};

// --- grouping --------------------------------------------------------------------

/** Whether `route` sits under `base` (every route sits under `/`). */
const isUnder = (route, base) => base === "/" || route.startsWith(`${base}/`);

/** One overview's operations: its endpoints and webhooks, claiming each page. */
const referenceOf = (overview, pages, claimed) => {
  const operationRoutes = new Set(pages.keys());
  const endpoints = {};
  const webhooks = new Set();
  for (const item of overview.items) {
    const route = resolveHref(item.href, operationRoutes);
    const page = route === undefined ? undefined : pages.get(route);
    // An overview's operations live under its route; a list that links
    // elsewhere is a page quoting endpoints, not a reference.
    if (!(page && isUnder(route, overview.route))) {
      continue;
    }
    if (page.endpoint !== undefined && page.endpoint !== item.endpoint) {
      warn(
        `${route}: the overview lists it as "${item.endpoint}" but the page reads "${page.endpoint}"; using the page.`
      );
    }
    const endpoint = page.endpoint ?? item.endpoint;
    if (endpoints[endpoint] !== undefined && endpoints[endpoint] !== route) {
      warn(
        `${overview.route}: "${endpoint}" maps to both ${endpoints[endpoint]} and ${route}; keeping the first.`
      );
      continue;
    }
    endpoints[endpoint] = route;
    if (page.webhook) {
      webhooks.add(endpoint);
    }
    claimed.add(route);
  }
  return {
    endpoints: sortObject(endpoints),
    title: overview.title,
    webhooks: [...webhooks].toSorted(),
  };
};

/** Operation pages no overview listed, keyed by endpoint. */
const unlistedPages = (pages, claimed) => {
  const unlisted = {};
  for (const [route, page] of pages) {
    if (!claimed.has(route)) {
      const key = page.endpoint ?? `(no endpoint line) ${route}`;
      unlisted[key] = [...(unlisted[key] ?? []), route];
    }
  }
  return sortObject(unlisted);
};

// --- spec operationIds ---------------------------------------------------------

/** `METHOD /path` (or `METHOD name` for a webhook) → operationId, from a JSON spec. */
const specOperationIds = (file) => {
  if (/\.ya?ml$/iu.test(file)) {
    fail(
      `${file}: YAML specs aren't read (no dependencies). Convert it first, e.g. \`npx @redocly/cli bundle ${file} --output ${file.replace(/\.ya?ml$/iu, ".json")}\`.`
    );
  }
  let spec;
  try {
    spec = JSON.parse(readFileSync(file, "utf-8"));
  } catch (error) {
    fail(`${file}: not readable as JSON (${error.message}).`);
  }
  const ids = new Map();
  for (const items of [spec.paths, spec.webhooks]) {
    for (const [key, item] of Object.entries(items ?? {})) {
      for (const method of HTTP_METHODS) {
        const operationId = item?.[method]?.operationId;
        if (operationId) {
          ids.set(`${method.toUpperCase()} ${key}`, String(operationId));
        }
      }
    }
  }
  return ids;
};

const addOperationIds = (references, spec) => {
  const reference = references[spec.route];
  if (!reference) {
    fail(
      `--spec ${spec.route}=${spec.file}: no reference overview at ${spec.route}. References: ${Object.keys(references).toSorted().join(", ") || "none"}.`
    );
  }
  const operationIds = {};
  for (const [endpoint, operationId] of specOperationIds(spec.file)) {
    const route = reference.endpoints[endpoint];
    if (route === undefined) {
      warn(
        `${spec.file}: ${endpoint} (${operationId}) has no page under ${spec.route}.`
      );
    } else {
      operationIds[operationId] = route;
    }
  }
  reference.operationIds = sortObject(operationIds);
};

// --- main ------------------------------------------------------------------------

const isDirectory = (dir) => existsSync(dir) && statSync(dir).isDirectory();

/** The directory holding the pages: a server build's `client/` half, else `dist`. */
const pagesRoot = (dist) => {
  const client = path.join(dist, "client");
  if (isDirectory(client) && isDirectory(path.join(dist, "server"))) {
    process.stderr.write(
      `operation-routes: reading ${client}, a server build's pages.\n`
    );
    return client;
  }
  return dist;
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const dist = path.resolve(options.dist);
  if (!isDirectory(dist)) {
    fail(
      `${options.dist} is not a directory. Run \`blume build\` first, then pass its output directory.`
    );
  }

  const { overviews, pages } = readMirrors(pagesRoot(dist));
  if (pages.size === 0) {
    fail(
      `no generated operation pages in ${options.dist} (no .md mirror with \`type: openapi-operation\`). Is it a Blume build with an openapi() reference? A Vercel server build writes its pages to .vercel/output/static: pass that.`
    );
  }

  const claimed = new Set();
  const references = {};
  for (const overview of overviews) {
    const reference = referenceOf(overview, pages, claimed);
    if (Object.keys(reference.endpoints).length > 0) {
      references[overview.route] = reference;
    }
  }
  for (const spec of options.specs) {
    addOperationIds(references, spec);
  }

  const output = { references: sortObject(references) };
  const unlisted = unlistedPages(pages, claimed);
  const unlistedCount = Object.values(unlisted).flat().length;
  if (unlistedCount > 0) {
    warn(
      `${unlistedCount} operation page(s) appear in no overview list; see "unlisted".`
    );
    output.unlisted = unlisted;
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
};

main();
