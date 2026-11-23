import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseSync } from 'oxc-parser';

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
 * The `internal(s)` folder or file `file` is in, or `null`: `internals/`,
 * `internal.ts` and `unstable-internals.ts` are for tRPC itself.
 */
export const internalDirectory = (file: string): string | null => {
  const parts = file.split(/[\\/]/);
  const index = parts.findIndex((part) =>
    /(^|[-_])internals?($|[-_.])/.test(part),
  );
  return index === -1 ? null : parts.slice(0, index + 1).join('/');
};

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

interface Binding {
  from: string;
  name: string;
}

/** What a file declares, imports and exports, read without type info. */
interface ParsedFile {
  /** Top-level declarations. */
  declared: Set<string>;
  /** `export const x` and friends. */
  exported: Set<string>;
  /** `export { local as exported }`, without a `from`. */
  localExports: Map<string, string>;
  /** `export { name as exported } from`, by exported name. */
  reExports: Map<string, Binding>;
  /** `export * from` */
  stars: string[];
  /** `export * as ns from`, by namespace name. */
  namespaces: Map<string, string>;
  /** Named imports, by local name. */
  imports: Map<string, Binding>;
}

/** The fields of binding patterns `bindingNames` reads. */
interface PatternLike {
  type: string;
  name?: string;
  properties?: readonly PatternLike[];
  elements?: readonly (PatternLike | null)[];
  value?: PatternLike | null;
  argument?: PatternLike | null;
  left?: PatternLike | null;
}

/** The names a binding pattern such as `{ a, b: [c] }` declares. */
export const bindingNames = (pattern: PatternLike | null): string[] => {
  if (!pattern) return [];
  switch (pattern.type) {
    case 'Identifier':
      return pattern.name === undefined ? [] : [pattern.name];
    case 'ObjectPattern':
      return (pattern.properties ?? []).flatMap((p) =>
        bindingNames(
          p.type === 'RestElement' ? (p.argument ?? null) : (p.value ?? null),
        ),
      );
    case 'ArrayPattern':
      return (pattern.elements ?? []).flatMap((e) => bindingNames(e));
    case 'RestElement':
      return bindingNames(pattern.argument ?? null);
    case 'AssignmentPattern':
      return bindingNames(pattern.left ?? null);
    default:
      return [];
  }
};

type Program = ReturnType<typeof parseSync>['program'];
type Statement = Program['body'][number];

const moduleExportName = (node: {
  type: string;
  name?: string;
  value?: unknown;
}) => (node.type === 'Identifier' ? (node.name ?? '') : String(node.value));

/** The names a declaration statement declares. */
const declaredNames = (node: Statement): string[] => {
  if (node.type === 'VariableDeclaration') {
    return node.declarations.flatMap((d) => bindingNames(d.id));
  }
  if (
    node.type === 'FunctionDeclaration' ||
    node.type === 'TSDeclareFunction' ||
    node.type === 'ClassDeclaration' ||
    node.type === 'TSInterfaceDeclaration' ||
    node.type === 'TSTypeAliasDeclaration' ||
    node.type === 'TSEnumDeclaration'
  ) {
    return node.id ? [node.id.name] : [];
  }
  return [];
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
  const { program } = parseSync(file, text);
  const result: ParsedFile = {
    declared: new Set(),
    exported: new Set(),
    localExports: new Map(),
    reExports: new Map(),
    stars: [],
    namespaces: new Map(),
    imports: new Map(),
  };
  const declare = (statement: Statement, inner: Statement) => {
    for (const name of declaredNames(inner)) {
      result.declared.add(name);
      if (inner !== statement) result.exported.add(name);
    }
  };
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      for (const specifier of statement.specifiers) {
        if (specifier.type === 'ImportNamespaceSpecifier') continue;
        result.imports.set(specifier.local.name, {
          from: statement.source.value,
          name:
            specifier.type === 'ImportDefaultSpecifier'
              ? 'default'
              : moduleExportName(specifier.imported),
        });
      }
    } else if (statement.type === 'ExportAllDeclaration') {
      if (statement.exported) {
        result.namespaces.set(
          moduleExportName(statement.exported),
          statement.source.value,
        );
      } else {
        result.stars.push(statement.source.value);
      }
    } else if (statement.type === 'ExportNamedDeclaration') {
      if (statement.declaration) declare(statement, statement.declaration);
      for (const specifier of statement.specifiers) {
        const local = moduleExportName(specifier.local);
        const exported = moduleExportName(specifier.exported);
        if (statement.source) {
          result.reExports.set(exported, {
            from: statement.source.value,
            name: local,
          });
        } else {
          result.localExports.set(exported, local);
        }
      }
    } else if (statement.type === 'ExportDefaultDeclaration') {
      // `export default function f()` declares `f` and exports it as
      // `default`; `export default f` exports a local.
      const inner = statement.declaration;
      if (inner.type === 'Identifier') {
        result.localExports.set('default', inner.name);
      } else if (
        (inner.type === 'FunctionDeclaration' ||
          inner.type === 'ClassDeclaration') &&
        inner.id
      ) {
        result.localExports.set('default', inner.id.name);
        result.declared.add(inner.id.name);
      }
    } else {
      declare(statement, statement);
    }
  }
  parsed.set(file, result);
  return result;
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
    for (const [alias, from] of info.namespaces) {
      if (wants(alias)) follow(from, '*');
    }
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
