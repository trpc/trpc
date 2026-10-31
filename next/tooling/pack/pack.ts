/**
 * A package's `build` script: `vp pack` over every `exports` entry, as
 * unbundled ESM with declarations in `dist/`. In the workspace, `exports`
 * point at `src/`; `publishConfig.exports` points at the build output and
 * must list the same subpaths. Run from the package directory.
 */
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Data, Effect, FileSystem } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/** Conditions to files; `types` and `default` are required. */
type Entry = Readonly<Record<string, string>> & {
  readonly types: string;
  readonly default: string;
};
export interface PackageJson {
  readonly name: string;
  readonly bin?: Record<string, string>;
  readonly files?: ReadonlyArray<string>;
  readonly dependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly sideEffects?: boolean | ReadonlyArray<string>;
  readonly exports: Record<string, Entry>;
  readonly publishConfig?: {
    readonly access?: string;
    readonly exports?: Record<string, Entry>;
  };
}

export class InvalidExports extends Data.TaggedError('InvalidExports')<{
  readonly message: string;
}> {}

class PackFailed extends Data.TaggedError('PackFailed')<{
  readonly exitCode: number;
}> {}

const built = (condition: string, source: string) =>
  source
    .replace(/^\.\/src\//, './dist/')
    .replace(/\.ts$/, condition === 'types' ? '.d.ts' : '.js');

/** Checks that `publishConfig.exports` mirrors `exports` with built paths. */
export const checkExports = (
  pkg: PackageJson,
): Effect.Effect<void, InvalidExports> =>
  Effect.gen(function* () {
    const published = pkg.publishConfig?.exports ?? {};
    for (const [subpath, entry] of Object.entries(pkg.exports)) {
      const expected = Object.fromEntries(
        Object.entries(entry).map(([condition, file]) => [
          condition,
          built(condition, file),
        ]),
      );
      if (JSON.stringify(published[subpath]) !== JSON.stringify(expected)) {
        return yield* new InvalidExports({
          message: `${pkg.name}: publishConfig.exports["${subpath}"] must be ${JSON.stringify(expected)}`,
        });
      }
    }
    for (const subpath of Object.keys(published)) {
      if (!(subpath in pkg.exports)) {
        return yield* new InvalidExports({
          message: `${pkg.name}: publishConfig.exports["${subpath}"] is not in exports`,
        });
      }
    }
  });

const importSpecifier =
  /^\s*(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm;

/**
 * The packages a built `.js` or `.d.ts` file imports: bare specifiers cut to
 * their package name, skipping relative paths and imports in block comments
 * (JSDoc examples).
 */
export const importedPackages = (source: string): ReadonlyArray<string> => {
  const code = source.replaceAll(/\/\*[\s\S]*?\*\//g, '');
  const names = new Set<string>();
  for (const match of code.matchAll(importSpecifier)) {
    const specifier = match[1] ?? match[2] ?? match[3] ?? '';
    const name = /^(?:@[^/]+\/)?[^/]+/.exec(specifier)?.[0];
    if (name !== undefined && !specifier.startsWith('.')) names.add(name);
  }
  return [...names].sort();
};

const entryPointImport = /^import type \{\} from ['"][^'"]+['"];$/gm;

/**
 * Puts the `import type {} from '…'` lines of an entry's source back at the
 * top of its built declarations. They load an entry point that declaration
 * emit in users' packages names types through (TS2742, TS2883), and the
 * declaration build drops them because they import no names.
 */
export const keepEntryPointImports = (
  source: string,
  declarations: string,
): string => {
  const missing = [...source.matchAll(entryPointImport)]
    .map((match) => match[0])
    .filter((line) => !declarations.includes(line));
  return missing.length === 0
    ? declarations
    : `${missing.join('\n')}\n${declarations}`;
};

const effectRootImport = /^import (type )?\{([^}]*)\} from ["']effect["'];$/gm;

/** The root `effect` exports that aren't a module namespace. */
const effectFunctionExports = new Set([
  'absurd',
  'cast',
  'flow',
  'hole',
  'identity',
  'pipe',
]);

/**
 * Rewrites built declarations' imports of the `effect` root to one import per
 * module (`effect/Duration`). The root re-exports all of Effect's modules, so
 * importing it makes every project that type-checks against tRPC parse each
 * of their declarations; by subpath it parses only the modules tRPC's declarations use.
 */
export const importEffectBySubpath = (declarations: string): string =>
  declarations.replace(effectRootImport, (_, typeOnly, list: string) => {
    const imports: string[] = [];
    const functions: string[] = [];
    for (const raw of list.split(',')) {
      const specifier = raw.trim();
      if (specifier === '') continue;
      const isType = typeOnly !== undefined || specifier.startsWith('type ');
      const [name, alias = name] = specifier
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/) as [string, string?];
      if (effectFunctionExports.has(name)) {
        functions.push(specifier);
        continue;
      }
      imports.push(
        `import ${isType ? 'type ' : ''}* as ${alias} from "effect/${name}";`,
      );
    }
    if (functions.length > 0) {
      imports.push(
        `import ${typeOnly ?? ''}{ ${functions.join(', ')} } from "effect/Function";`,
      );
    }
    return imports.join('\n');
  });

const pack = (extraArgs: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pkg = JSON.parse(
      yield* fs.readFileString('package.json'),
    ) as PackageJson;
    yield* checkExports(pkg);
    const tsconfig = (yield* fs.exists('tsconfig.lib.json'))
      ? ['--tsconfig', 'tsconfig.lib.json']
      : [];
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const exitCode = yield* spawner.exitCode(
      ChildProcess.make(
        'vp',
        [
          'pack',
          '--no-config',
          ...Object.values(pkg.exports).map((entry) => entry.default),
          '--dts',
          ...tsconfig,
          '--unbundle',
          '--platform',
          'neutral',
          '--logLevel',
          'warn',
          ...extraArgs,
        ],
        { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' },
      ),
    );
    if (exitCode !== 0) return yield* new PackFailed({ exitCode });
    for (const [subpath, entry] of Object.entries(pkg.exports)) {
      const built = pkg.publishConfig?.exports?.[subpath]?.types;
      if (built === undefined) continue;
      const declarations = yield* fs.readFileString(built);
      const kept = keepEntryPointImports(
        yield* fs.readFileString(entry.types),
        declarations,
      );
      if (kept !== declarations) yield* fs.writeFileString(built, kept);
    }
    const declarationFiles = (yield* fs.readDirectory('dist', {
      recursive: true,
    })).filter((file) => file.endsWith('.d.ts'));
    for (const file of declarationFiles) {
      const declarations = yield* fs.readFileString(`dist/${file}`);
      const rewritten = importEffectBySubpath(declarations);
      if (rewritten !== declarations) {
        yield* fs.writeFileString(`dist/${file}`, rewritten);
      }
    }
  });

if (import.meta.main) {
  pack(process.argv.slice(2)).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
