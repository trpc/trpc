import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * A TSDoc release tag. `@public` means changing it needs a major release,
 * `@internal` that a minor may change it.
 */
export type ReleaseTag = 'public' | 'internal';

const TAG = /^\s*\*?\s*@(public|internal)\b/gm;

/** The release tags in the value of a JSDoc comment. */
export const releaseTags = (doc: string): ReleaseTag[] =>
  [...doc.matchAll(TAG)].map((m) =>
    m[1] === 'public' ? 'public' : 'internal',
  );

/**
 * Entry points only tRPC's own packages import: `unstable-core-do-not-import`
 * and `unstable-internals`. Other unstable ones, such as `unstable-handles`,
 * are for users, so their exports are public.
 */
const isUnversioned = (subpath: string) =>
  subpath.endsWith('-do-not-import') || subpath.endsWith('internals');

type ExportTarget = string | { [condition: string]: ExportTarget };

interface Manifest {
  name?: string;
  exports?: Record<string, ExportTarget>;
}

const readManifest = (dir: string): Manifest | undefined => {
  const path = join(dir, 'package.json');
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as Manifest)
    : undefined;
};

/** The directory of `file`'s package: the nearest `package.json` with `exports`. */
const packageRoot = (file: string): string | undefined => {
  for (let dir = dirname(file); dir !== dirname(dir); dir = dirname(dir)) {
    if (readManifest(dir)?.exports) return dir;
  }
  return undefined;
};

const workspaces = new Map<string, Map<string, Manifest>>();

/** The packages beside `file`'s, by directory. */
const workspace = (file: string): Map<string, Manifest> | undefined => {
  const root = packageRoot(file);
  if (root === undefined) return undefined;
  const dir = dirname(root);
  let packages = workspaces.get(dir);
  if (!packages) {
    packages = new Map();
    for (const entry of readdirSync(dir)) {
      const manifest = readManifest(join(dir, entry));
      if (manifest) packages.set(join(dir, entry), manifest);
    }
    workspaces.set(dir, packages);
  }
  return packages;
};

/** The built file an export condition tree points at. */
const builtFile = (target: ExportTarget): string | undefined => {
  if (typeof target === 'string') return target;
  for (const condition of ['import', 'require', 'default']) {
    const next = target[condition];
    if (next !== undefined) return builtFile(next);
  }
  return undefined;
};

/** The source file tsdown builds an entry point's `./dist/<path>.mjs` from. */
const entrySource = (
  root: string,
  target: ExportTarget | undefined,
): string | undefined => {
  const built = target === undefined ? undefined : builtFile(target);
  if (built === undefined) return undefined;
  const path = built.replace(/^\.\/dist\//, '').replace(/\.[cm]?js$/, '');
  return [`src/${path}.ts`, `src/${path}.tsx`]
    .map((candidate) => join(root, candidate))
    .find((candidate) => existsSync(candidate));
};

/**
 * The source file an import from `file` resolves to: relative ones, and
 * entry points of packages in the same workspace.
 */
export const resolveImport = (
  file: string,
  specifier: string,
): string | undefined => {
  if (!specifier.startsWith('.')) {
    const parts = specifier.split('/');
    const nameLength = specifier.startsWith('@') ? 2 : 1;
    const name = parts.slice(0, nameLength).join('/');
    const subpath = ['.', ...parts.slice(nameLength)].join('/');
    for (const [root, manifest] of workspace(file) ?? []) {
      if (manifest.name === name) {
        return entrySource(root, manifest.exports?.[subpath]);
      }
    }
    return undefined;
  }
  const base = resolve(dirname(file), specifier).replace(/\.m?js$/, '');
  return [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ].find((candidate) => /\.tsx?$/.test(candidate) && existsSync(candidate));
};

const DECLARATION =
  /^(?:export\s+)?(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\*?|const|let|var|class|interface|type|enum)\s+([\w$]+)/gm;
const NAME_LIST = /\{([^}]*)\}/;
const RE_EXPORT =
  /export\s+(?:type\s+)?\{([^}]*)\}\s*(?:from\s*['"]([^'"]+)['"])?/g;
const STAR = /export\s*\*\s*(?:as\s+[\w$]+\s+)?from\s*['"]([^'"]+)['"]/g;
const IMPORT = /import\s+(?:type\s+)?([^;]*?)\s+from\s*['"]([^'"]+)['"]/g;

interface Binding {
  from: string;
  name: string;
}

/** What the regexes below find in a file, without parsing it. */
interface ParsedFile {
  /** Top-level declarations, with their JSDoc's tags. */
  declared: Map<string, ReleaseTag[]>;
  /** `export const x` and friends. */
  exported: Set<string>;
  /** `export { local as exported }`, without a `from`. */
  localExports: Map<string, string>;
  /** `export { name as exported } from`, by exported name. */
  reExports: Map<string, Binding>;
  /** `export * from` */
  stars: string[];
  /** Named imports, by local name. */
  imports: Map<string, Binding>;
}

const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');

/** `a, type b as c` as `[name, alias]` pairs. */
const nameList = (list: string): [string, string][] =>
  list
    .split(',')
    .map((part) => part.replace(/^\s*type\s+/, '').trim())
    .filter(Boolean)
    .map((part) => {
      const [name = part, alias = name] = part.split(/\s+as\s+/);
      return [name, alias];
    });

/** The value of the JSDoc ending right before `index`, skipping line comments. */
const docBefore = (text: string, index: number): string => {
  let before = text.slice(0, index);
  for (;;) {
    const trimmed = before.trimEnd();
    const lineStart = trimmed.lastIndexOf('\n') + 1;
    if (trimmed.slice(lineStart).trimStart().startsWith('//')) {
      before = trimmed.slice(0, lineStart);
      continue;
    }
    if (!trimmed.endsWith('*/')) return '';
    const start = trimmed.lastIndexOf('/*');
    // The comment's value, as the AST has it: `* text ` for `/** text */`.
    return trimmed.startsWith('/**', start) ? trimmed.slice(start + 2, -2) : '';
  }
};

const parsed = new Map<string, ParsedFile | null>();

const parse = (file: string): ParsedFile | null => {
  const cached = parsed.get(file);
  if (cached !== undefined) return cached;
  if (!existsSync(file)) {
    parsed.set(file, null);
    return null;
  }
  const text = readFileSync(file, 'utf8');
  const result: ParsedFile = {
    declared: new Map(),
    exported: new Set(),
    localExports: new Map(),
    reExports: new Map(),
    stars: [],
    imports: new Map(),
  };
  for (const m of text.matchAll(DECLARATION)) {
    const name = m[1];
    if (name === undefined) continue;
    if (m[0].startsWith('export')) result.exported.add(name);
    // Overloads share the first signature's JSDoc.
    if (!result.declared.has(name)) {
      result.declared.set(name, releaseTags(docBefore(text, m.index)));
    }
  }
  const code = stripComments(text);
  for (const [, list = '', from] of code.matchAll(RE_EXPORT)) {
    for (const [name, alias] of nameList(list)) {
      if (from === undefined) result.localExports.set(alias, name);
      else result.reExports.set(alias, { from, name });
    }
  }
  for (const [, from] of code.matchAll(STAR)) {
    if (from !== undefined) result.stars.push(from);
  }
  for (const [, clause = '', from] of code.matchAll(IMPORT)) {
    const list = NAME_LIST.exec(clause)?.[1];
    if (list === undefined || from === undefined) continue;
    for (const [name, alias] of nameList(list)) {
      result.imports.set(alias, { from, name });
    }
  }
  parsed.set(file, result);
  return result;
};

/**
 * Where `name`, as exported or imported in `file`, is declared, following
 * re-exports and imports.
 */
export const findDeclaration = (
  file: string,
  name: string,
  seen = new Set<string>(),
): { file: string; name: string; tags: ReleaseTag[] } | undefined => {
  const key = `${file}\0${name}`;
  if (seen.has(key)) return undefined;
  seen.add(key);
  const info = parse(file);
  if (!info) return undefined;
  const local = info.localExports.get(name) ?? name;
  const tags = info.declared.get(local);
  if (tags) return { file, name: local, tags };
  const via = info.reExports.get(name) ?? info.imports.get(local);
  if (via) {
    const target = resolveImport(file, via.from);
    return target === undefined
      ? undefined
      : findDeclaration(target, via.name, seen);
  }
  for (const star of info.stars) {
    const target = resolveImport(file, star);
    const found =
      target === undefined ? undefined : findDeclaration(target, name, seen);
    if (found) return found;
  }
  return undefined;
};

/** Collects, by file, the names each declares that entry points reach. */
const reacher = () => {
  const byFile = new Map<string, Set<string>>();
  const seen = new Set<string>();
  const collect = (file: string, names: ReadonlySet<string> | '*') => {
    const key = `${file}\0${names === '*' ? '*' : [...names].join(',')}`;
    if (seen.has(key)) return;
    seen.add(key);
    const info = parse(file);
    if (!info) return;
    const wants = (name: string) => names === '*' || names.has(name);
    const own = byFile.get(file) ?? new Set<string>();
    byFile.set(file, own);
    const follow = (from: string, picked: ReadonlySet<string> | '*') => {
      const target = resolveImport(file, from);
      if (target !== undefined) collect(target, picked);
    };
    for (const name of info.exported) if (wants(name)) own.add(name);
    for (const [alias, local] of info.localExports) {
      if (!wants(alias)) continue;
      if (info.declared.has(local)) own.add(local);
      const imported = info.imports.get(local);
      if (imported) follow(imported.from, new Set([imported.name]));
    }
    const byFrom = new Map<string, Set<string>>();
    for (const [alias, { from, name }] of info.reExports) {
      if (!wants(alias)) continue;
      const picked = byFrom.get(from) ?? new Set<string>();
      picked.add(name);
      byFrom.set(from, picked);
    }
    for (const [from, picked] of byFrom) follow(from, picked);
    for (const star of info.stars) follow(star, names);
  };
  return { byFile, collect };
};

const reachableByWorkspace = new Map<
  Map<string, Manifest>,
  Map<string, Set<string>>
>();

/**
 * Names `file` declares that a versioned entry point of a package in its
 * workspace exports, including through another package's re-exports.
 */
export const publicNames = (file: string): ReadonlySet<string> => {
  const packages = workspace(file);
  if (!packages) return new Set();
  let byFile = reachableByWorkspace.get(packages);
  if (!byFile) {
    const reach = reacher();
    for (const [root, manifest] of packages) {
      for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
        if (isUnversioned(subpath)) continue;
        const source = entrySource(root, target);
        if (source !== undefined) reach.collect(source, '*');
      }
    }
    byFile = reach.byFile;
    reachableByWorkspace.set(packages, byFile);
  }
  return byFile.get(file) ?? new Set();
};
