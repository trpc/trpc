/**
 * Makes an example standalone, for `.github/workflows/subtree.yml` to publish
 * to `trpc/examples-<name>`. In the monorepo, examples depend on `@shared/ui`
 * (`tooling/ui`) as `workspace:*` and pin versions with `catalog:`; neither
 * resolves outside it. In the copy, each package that depends on `@shared/ui`
 * gets the files it uses (and what they import) in `src/shared-ui/`
 * (`shared-ui/` without `src/`), with its `@shared/ui/...` imports and
 * Tailwind `@source`s pointing there. Their npm dependencies move into the
 * package. `catalog:` versions become the catalog's, and `@trpc/*` installs
 * `canary`.
 */
import { Data, Effect, FileSystem, Path, type PlatformError } from 'effect';
import { parse } from 'yaml';

export const sharedUi = '@shared/ui';

/** Where the `@shared/ui` files go, in `src/` if the package has one. */
export const sharedUiDir = 'shared-ui';

const ignored = new Set([
  '.DS_Store',
  '.eslintcache',
  '.next',
  '.nuxt',
  '.output',
  '.tanstack',
  '.turbo',
  '.vercel',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
]);

const sourceExtensions = new Set([
  '.cjs',
  '.css',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
  '.vue',
]);

/** Extensions an import leaves off. */
const scriptExtensions = ['.ts', '.tsx', '.js', '.jsx'];

const dependencyFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

export interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  exports?: Record<string, string>;
  name?: string;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  [field: string]: unknown;
}

export class StandaloneError extends Data.TaggedError('StandaloneError')<{
  readonly message: string;
}> {}

export function isIgnored(file: string, separator: string) {
  return file
    .split(separator)
    .some((part) => ignored.has(part) || part.endsWith('.tsbuildinfo'));
}

/** Versions by catalog (`default` is `catalog:`) and package. */
export type Catalogs = ReadonlyMap<string, ReadonlyMap<string, string>>;

export function parseCatalogs(workspaceYaml: string): Catalogs {
  const workspace = (parse(workspaceYaml) ?? {}) as {
    catalog?: Record<string, string>;
    catalogs?: Record<string, Record<string, string>>;
  };
  const catalogs = new Map<string, ReadonlyMap<string, string>>();
  if (workspace.catalog !== undefined) {
    catalogs.set('default', new Map(Object.entries(workspace.catalog)));
  }
  for (const [name, versions] of Object.entries(workspace.catalogs ?? {})) {
    catalogs.set(name, new Map(Object.entries(versions)));
  }
  return catalogs;
}

/** The version `name` installs outside the monorepo. */
export function standaloneVersion(
  name: string,
  version: string,
  catalogs: Catalogs,
) {
  if (name.startsWith('@trpc/')) {
    return 'canary';
  }
  if (version.startsWith('catalog:')) {
    const catalog = version.slice('catalog:'.length) || 'default';
    const resolved = catalogs.get(catalog)?.get(name);
    if (resolved === undefined) {
      throw new StandaloneError({
        message: `${name}@${version}: not in the ${catalog} catalog`,
      });
    }
    return resolved;
  }
  if (version.startsWith('workspace:')) {
    throw new StandaloneError({
      message: `${name}@${version} only resolves in the monorepo`,
    });
  }
  return version;
}

/**
 * The package's `package.json` outside the monorepo: without `@shared/ui`,
 * with the dependencies of its files in `added` (unless it has them), and
 * with standalone versions.
 */
export function standalonePackageJson(
  pkg: PackageJson,
  catalogs: Catalogs,
  added: ReadonlyMap<string, string> = new Map(),
): PackageJson {
  const result: PackageJson = { ...pkg };
  for (const field of dependencyFields) {
    const deps = pkg[field];
    if (deps === undefined) {
      continue;
    }
    result[field] = Object.fromEntries(
      Object.entries(deps)
        .filter(([name]) => name !== sharedUi)
        .map(([name, version]) => [
          name,
          standaloneVersion(name, version, catalogs),
        ]),
    );
  }
  const missing = [...added].filter(
    ([name]) => !dependencyFields.some((field) => result[field]?.[name]),
  );
  if (missing.length > 0) {
    const dependencies = { ...result.dependencies };
    for (const [name, version] of missing) {
      dependencies[name] = standaloneVersion(name, version, catalogs);
    }
    result.dependencies = Object.fromEntries(
      Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  return result;
}

export function dependsOnSharedUi(pkg: PackageJson) {
  return dependencyFields.some((field) => pkg[field]?.[sharedUi]);
}

export function isSharedUi(specifier: string) {
  return specifier === sharedUi || specifier.startsWith(`${sharedUi}/`);
}

/** The npm package a bare specifier imports. */
export function packageName(specifier: string) {
  const parts = specifier.split('/');
  return (
    specifier.startsWith('@') ? parts.slice(0, 2) : parts.slice(0, 1)
  ).join('/');
}

/** The file `exports` maps `subpath` (`./components/card`) to. */
export function resolveExport(
  exports: Record<string, string>,
  subpath: string,
): string | undefined {
  const exact = exports[subpath];
  if (exact !== undefined) {
    return exact;
  }
  for (const [key, target] of Object.entries(exports)) {
    const [prefix, suffix, ...rest] = key.split('*');
    if (prefix === undefined || suffix === undefined || rest.length > 0) {
      continue;
    }
    if (
      subpath.length >= prefix.length + suffix.length &&
      subpath.startsWith(prefix) &&
      subpath.endsWith(suffix)
    ) {
      const match = subpath.slice(
        prefix.length,
        subpath.length - suffix.length,
      );
      return target.replaceAll('*', match);
    }
  }
  return undefined;
}

/** `a/{b,c}.tsx` → `a/b.tsx`, `a/c.tsx`. */
export function expandBraces(pattern: string): Array<string> {
  const group = /\{([^{}]*)\}/.exec(pattern);
  if (group === null) {
    return [pattern];
  }
  const before = pattern.slice(0, group.index);
  const after = pattern.slice(group.index + group[0].length);
  return (group[1] ?? '')
    .split(',')
    .flatMap((option) => expandBraces(before + option + after));
}

type Kind = 'css' | 'script';

const patterns: Record<Kind, RegExp> = {
  css: /@import\s+(?:url\(\s*)?(['"])([^'"\n]+)\1/g,
  script: /\b(?:from|import)\s*\(?\s*(['"])([^'"\n]+)\1/g,
};

const sourcePattern = /@source\s+(?:not\s+)?(['"])([^'"\n]+)\1/g;

export function kindOf(file: string): Kind {
  return file.endsWith('.css') ? 'css' : 'script';
}

/** Applies `replace` to CSS outside its comments. */
function outsideComments(css: string, replace: (code: string) => string) {
  return css
    .split(/(\/\*[\s\S]*?\*\/)/)
    .map((part, index) => (index % 2 === 0 ? replace(part) : part))
    .join('');
}

function matches(pattern: RegExp, code: string) {
  return [...code.matchAll(pattern)].map((match) => match[2] ?? '');
}

/** What the file imports. */
export function importSpecifiers(source: string, kind: Kind) {
  if (kind === 'script') {
    return matches(patterns.script, source);
  }
  const specifiers: Array<string> = [];
  outsideComments(source, (code) => {
    specifiers.push(...matches(patterns.css, code));
    return code;
  });
  return specifiers;
}

/** The paths of the CSS file's `@source`s. */
export function sourcePaths(css: string) {
  const paths: Array<string> = [];
  outsideComments(css, (code) => {
    paths.push(...matches(sourcePattern, code));
    return code;
  });
  return paths;
}

/**
 * The file with its imports, and its CSS `@source`s, replaced by `imports`
 * and `sources`. `undefined` from either leaves it as it is.
 */
export function rewriteFile(
  source: string,
  kind: Kind,
  replacements: {
    imports: (specifier: string) => string | undefined;
    sources?: (path: string) => string | undefined;
  },
) {
  const { imports, sources = () => undefined } = replacements;
  const replace =
    (pattern: RegExp, to: (value: string) => string | undefined) =>
    (code: string) =>
      code.replace(pattern, (match, quote: string, value: string) => {
        const replacement = to(value);
        return replacement === undefined
          ? match
          : match.replace(
              `${quote}${value}${quote}`,
              quote + replacement + quote,
            );
      });
  if (kind === 'script') {
    return replace(patterns.script, imports)(source);
  }
  return outsideComments(source, (code) =>
    replace(sourcePattern, sources)(replace(patterns.css, imports)(code)),
  );
}

const fail = (message: string) => Effect.fail(new StandaloneError({ message }));

const attempt = <TValue>(evaluate: () => TValue) =>
  Effect.try({
    try: evaluate,
    catch: (error) =>
      error instanceof StandaloneError
        ? error
        : new StandaloneError({ message: String(error) }),
  });

const readJson = Effect.fn('readJson')(function* (file: string) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(file);
  return yield* attempt(() => {
    const value: unknown = JSON.parse(text);
    return value as PackageJson;
  }).pipe(
    Effect.mapError(
      (error) => new StandaloneError({ message: `${file}: ${error.message}` }),
    ),
  );
});

const json = (value: PackageJson) => `${JSON.stringify(value, null, 2)}\n`;

/** Every file under `dir`, without ignored ones or `node_modules`. */
const listFiles: (
  dir: string,
) => Effect.Effect<
  Array<string>,
  PlatformError.PlatformError,
  FileSystem.FileSystem | Path.Path
> = Effect.fn('listFiles')(function* (dir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const files: Array<string> = [];
  for (const entry of yield* fs.readDirectory(dir)) {
    if (isIgnored(entry, path.sep)) {
      continue;
    }
    const file = path.join(dir, entry);
    const info = yield* fs.stat(file);
    if (info.type === 'Directory') {
      files.push(...(yield* listFiles(file)));
    } else if (info.type === 'File') {
      files.push(file);
    }
  }
  return files;
});

interface SharedUi {
  readonly dir: string;
  readonly pkg: PackageJson;
}

/**
 * Copies the `@shared/ui` files the package in `dir` uses into it and points
 * its imports at them. `original` is the package in the monorepo, which its
 * CSS `@source` paths are relative to. Returns the dependencies of the files.
 */
const inlineSharedUi = Effect.fn('inlineSharedUi')(function* (options: {
  readonly dir: string;
  readonly original: string;
  readonly ui: SharedUi;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { dir, original, ui } = options;
  const uiSrc = path.join(ui.dir, 'src');
  const target = path.join(
    (yield* fs.exists(path.join(dir, 'src'))) ? path.join(dir, 'src') : dir,
    sharedUiDir,
  );
  if (yield* fs.exists(target)) {
    return yield* fail(`${target} already exists`);
  }
  /** `to` as an import from `from`, leaving off script extensions. */
  const importPath = (from: string, to: string) => {
    const relative = path
      .relative(path.dirname(from), to)
      .split(path.sep)
      .join('/');
    const specifier = relative.startsWith('.') ? relative : `./${relative}`;
    const extension = path.extname(specifier);
    return kindOf(from) === 'script' && scriptExtensions.includes(extension)
      ? specifier.slice(0, -extension.length)
      : specifier;
  };
  const copyOf = (file: string) =>
    path.join(target, path.relative(uiSrc, file));

  const resolveShared = (specifier: string) => {
    const subpath = `.${specifier.slice(sharedUi.length)}`;
    const file = resolveExport(ui.pkg.exports ?? {}, subpath);
    return file === undefined
      ? fail(`${specifier} isn't exported by ${sharedUi}`)
      : Effect.succeed(path.join(ui.dir, file));
  };
  const resolveRelative = Effect.fn('resolveRelative')(function* (
    from: string,
    specifier: string,
  ) {
    const file = path.resolve(path.dirname(from), specifier);
    for (const candidate of [file, ...scriptExtensions.map((e) => file + e)]) {
      if (yield* fs.exists(candidate)) {
        return candidate;
      }
    }
    return yield* fail(`${from}: can't resolve ${specifier}`);
  });
  /** The `@shared/ui` path an `@source` in `css` points at, from `src/`. */
  const sharedSource = (css: string, source: string) => {
    const resolved = path.resolve(
      path.dirname(path.join(original, path.relative(dir, css))),
      source,
    );
    for (const root of [
      ui.dir,
      path.join(original, 'node_modules', sharedUi),
    ]) {
      if (resolved.startsWith(path.join(root, 'src') + path.sep)) {
        return path.relative(path.join(root, 'src'), resolved);
      }
    }
    return undefined;
  };

  const files = (yield* listFiles(dir)).filter((file) =>
    sourceExtensions.has(path.extname(file)),
  );
  const queue: Array<string> = [];
  for (const file of files) {
    const source = yield* fs.readFileString(file);
    for (const specifier of importSpecifiers(source, kindOf(file))) {
      if (isSharedUi(specifier)) {
        queue.push(yield* resolveShared(specifier));
      }
    }
    if (kindOf(file) === 'css') {
      for (const source of sourcePaths(yield* fs.readFileString(file))) {
        const shared = sharedSource(file, source);
        for (const pattern of shared === undefined
          ? []
          : expandBraces(shared)) {
          const used = path.join(uiSrc, pattern);
          if (pattern.includes('*') || !(yield* fs.exists(used))) {
            return yield* fail(
              `${file}: @source '${source}' must list the ${sharedUi} files the app uses`,
            );
          }
          if ((yield* fs.stat(used)).type !== 'File') {
            return yield* fail(
              `${file}: @source '${source}' must list the ${sharedUi} files the app uses, not a directory`,
            );
          }
          queue.push(used);
        }
      }
    }
  }

  const used = new Set<string>();
  const packages = new Set<string>();
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (used.has(file)) {
      continue;
    }
    if (!file.startsWith(uiSrc + path.sep)) {
      return yield* fail(`${file} is outside ${uiSrc}`);
    }
    used.add(file);
    const source = yield* fs.readFileString(file);
    for (const specifier of importSpecifiers(source, kindOf(file))) {
      if (isSharedUi(specifier)) {
        queue.push(yield* resolveShared(specifier));
      } else if (specifier.startsWith('.')) {
        queue.push(yield* resolveRelative(file, specifier));
      } else if (!specifier.startsWith('node:')) {
        packages.add(packageName(specifier));
      }
    }
  }

  const rewriteImports = Effect.fn('rewriteImports')(function* (
    file: string,
    destination: string,
    sources?: (path: string) => string | undefined,
  ) {
    const kind = kindOf(file);
    const source = yield* fs.readFileString(file);
    const resolved = new Map<string, string>();
    for (const specifier of importSpecifiers(source, kind)) {
      if (isSharedUi(specifier)) {
        resolved.set(
          specifier,
          importPath(destination, copyOf(yield* resolveShared(specifier))),
        );
      }
    }
    return rewriteFile(source, kind, {
      imports: (specifier) => resolved.get(specifier),
      sources,
    });
  });

  for (const file of used) {
    const destination = copyOf(file);
    yield* fs.makeDirectory(path.dirname(destination), { recursive: true });
    yield* fs.writeFileString(
      destination,
      yield* rewriteImports(file, destination),
    );
  }
  for (const file of files) {
    const rewritten = yield* rewriteImports(file, file, (source) => {
      const shared = sharedSource(file, source);
      return shared === undefined
        ? undefined
        : importPath(file, path.join(target, shared));
    });
    if (rewritten !== (yield* fs.readFileString(file))) {
      yield* fs.writeFileString(file, rewritten);
    }
  }

  const dependencies = new Map<string, string>();
  for (const name of [...packages].sort()) {
    const version =
      ui.pkg.dependencies?.[name] ??
      ui.pkg.devDependencies?.[name] ??
      ui.pkg.peerDependencies?.[name];
    if (version === undefined) {
      return yield* fail(
        `${sharedUi} imports ${name} but doesn't depend on it`,
      );
    }
    dependencies.set(name, version);
  }
  return dependencies;
});

/**
 * Writes a standalone copy of the example in `example` to `out`, replacing
 * what's there. `root` is the monorepo's.
 */
export const writeStandalone = Effect.fn('writeStandalone')(
  function* (options: {
    readonly example: string;
    readonly out: string;
    readonly root: string;
  }) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const example = path.resolve(options.example);
    const out = path.resolve(options.out);
    const root = path.resolve(options.root);
    if (out === example || out.startsWith(example + path.sep)) {
      return yield* fail(`${out} is inside ${example}`);
    }

    const catalogs = parseCatalogs(
      yield* fs.readFileString(path.join(root, 'pnpm-workspace.yaml')),
    );
    const uiDir = path.join(root, 'tooling', 'ui');
    const ui: SharedUi = {
      dir: uiDir,
      pkg: yield* readJson(path.join(uiDir, 'package.json')),
    };

    yield* fs.remove(out, { force: true, recursive: true });
    for (const file of yield* listFiles(example)) {
      const destination = path.join(out, path.relative(example, file));
      yield* fs.makeDirectory(path.dirname(destination), { recursive: true });
      yield* fs.copyFile(file, destination);
    }

    const packageJsons = (yield* listFiles(out)).filter(
      (file) => path.basename(file) === 'package.json',
    );
    for (const file of packageJsons) {
      const pkg = yield* readJson(file);
      const added = dependsOnSharedUi(pkg)
        ? yield* inlineSharedUi({
            dir: path.dirname(file),
            original: path.join(
              example,
              path.relative(out, path.dirname(file)),
            ),
            ui,
          })
        : new Map<string, string>();
      const standalone = yield* attempt(() =>
        standalonePackageJson(pkg, catalogs, added),
      ).pipe(
        Effect.mapError(
          (error) =>
            new StandaloneError({ message: `${file}: ${error.message}` }),
        ),
      );
      yield* fs.writeFileString(file, json(standalone));
    }

    for (const file of yield* listFiles(out)) {
      if (!sourceExtensions.has(path.extname(file))) {
        continue;
      }
      const source = yield* fs.readFileString(file);
      if (importSpecifiers(source, kindOf(file)).some(isSharedUi)) {
        return yield* fail(
          `${file} imports ${sharedUi}, but its package doesn't depend on it`,
        );
      }
    }
  },
);
