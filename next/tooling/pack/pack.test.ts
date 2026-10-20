import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Path } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { expect, test } from 'vite-plus/test';
import {
  checkExports,
  importedPackages,
  keepEntryPointImports,
  type PackageJson,
} from './pack.ts';
import { packageDirs } from './packages.ts';
import { unusedImportOutput } from './side-effects.ts';

const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(Effect.provide(effect, NodeServices.layer));

const root = new URL('../..', import.meta.url).pathname;

const packages = await run(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = path.join(root, 'packages');
    return yield* Effect.forEach(yield* packageDirs(root), (name) =>
      Effect.map(
        fs.readFileString(path.join(dir, name, 'package.json')),
        (text) => ({
          name,
          dir: path.join(dir, name),
          pkg: JSON.parse(text) as PackageJson &
            Required<Pick<PackageJson, 'publishConfig'>>,
        }),
      ),
    );
  }),
);

const buildExitCode = await run(
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    return yield* spawner.exitCode(
      ChildProcess.make(
        'pnpm',
        ['-r', '--filter', './packages/*', 'run', 'build'],
        { cwd: root, stdout: 'inherit', stderr: 'inherit' },
      ),
    );
  }),
);

test('every package builds', () => {
  expect(buildExitCode).toBe(0);
});

const entries = packages.flatMap((opts) =>
  Object.keys(opts.pkg.exports).map(
    (subpath) => [opts.name, subpath, opts.dir, opts.pkg] as const,
  ),
);

test.each(entries)(
  '%s %s: the published entry exports what the source does',
  async (_name, subpath, dir, pkg) => {
    const source = await import(`${dir}/${pkg.exports[subpath]!.default}`);
    const published = pkg.publishConfig.exports![subpath]!;
    const built = await import(`${dir}/${published.default}`);
    expect(Object.keys(built).sort()).toEqual(Object.keys(source).sort());
    const types = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        return yield* fs.readFileString(`${dir}/${published.types}`);
      }),
    );
    expect(types).not.toMatch(/^(import|export)\b.*from ['"][^'"]+\.ts['"]/m);
    const entry = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        return yield* fs.readFileString(
          `${dir}/${pkg.exports[subpath]!.types}`,
        );
      }),
    );
    expect(keepEntryPointImports(entry, types)).toBe(types);
  },
);

test('keepEntryPointImports puts back the empty type imports the build drops', () => {
  const source = [
    '/** @module */',
    "import type {} from '@trpc12/trpc/internal';",
    "export { initTrpc } from './init.ts';",
  ].join('\n');
  const built = "export { initTrpc } from './init.js';\n";
  expect(keepEntryPointImports(source, built)).toBe(
    `import type {} from '@trpc12/trpc/internal';\n${built}`,
  );
  const kept = keepEntryPointImports(source, built);
  expect(keepEntryPointImports(source, kept)).toBe(kept);
  expect(keepEntryPointImports("export { a } from './a.ts';", built)).toBe(
    built,
  );
});

test.each(packages.map((opts) => [opts.name, opts.dir, opts.pkg] as const))(
  '%s imports only its dependencies and peers',
  async (_name, dir, pkg) => {
    const built = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dist = path.join(dir, 'dist');
        const files = (yield* fs.readDirectory(dist, {
          recursive: true,
        })).filter((file) => /\.(?:js|d\.ts)$/.test(file));
        const sources = yield* Effect.forEach(files, (file) =>
          fs.readFileString(path.join(dist, file)),
        );
        return {
          imported: [...new Set(sources.flatMap(importedPackages))],
          inlined: files.filter((file) => file.includes('node_modules')),
        };
      }),
    );
    // The build inlines an undeclared package into `dist/node_modules`
    // instead of importing it.
    expect(built.inlined).toEqual([]);
    const declared = new Set([
      pkg.name,
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ]);
    const undeclared = built.imported.filter(
      (name) => !declared.has(name) && !/^(?:node|cloudflare):/.test(name),
    );
    expect(undeclared).toEqual([]);
  },
);

// The built modules that run code when they load, by package folder. The
// rest keep nothing in a bundle that imports them unused, even one that
// ignores `sideEffects`: mark a module-level call `/* @__PURE__ */`.
const runsOnLoad = new Set([
  // Nest's decorators record its dependency-injection metadata on the
  // module's own classes, so `sideEffects: false` still drops it unused.
  'experimental-nest/index.js',
  // Attaches the built-in classes (`TrpcError.NotFound`) to `TrpcError` as
  // own properties; dropping it unused is safe for the same reason.
  'trpc/internal/error.js',
  // The `trpc12-upgrade` CLI: not an entry point, and listed in the
  // package's `sideEffects`.
  'upgrade/bin.js',
]);

const listedSideEffects: Record<string, ReadonlyArray<string>> = {
  upgrade: ['./src/bin.ts', './dist/bin.js'],
};

test.each(packages.map((opts) => [opts.name, opts.dir, opts.pkg] as const))(
  '%s declares its side effects, and only its runsOnLoad modules have any',
  async (name, dir, pkg) => {
    expect(pkg.sideEffects).toEqual(listedSideEffects[name] ?? false);
    const running = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dist = path.join(dir, 'dist');
        const files = (yield* fs.readDirectory(dist, { recursive: true }))
          .filter((file) => file.endsWith('.js'))
          .sort();
        const outputs = yield* Effect.forEach(
          files,
          (file) => unusedImportOutput(path.join(dist, file), 'module'),
          { concurrency: 4 },
        );
        return files
          .map((file, i) => [`${name}/${file}`, outputs[i]!] as const)
          .filter(([, code]) => code !== '');
      }),
    );
    // Keyed by module, so a failure shows the code each one keeps.
    expect(
      Object.fromEntries(running.filter(([key]) => !runsOnLoad.has(key))),
    ).toEqual({});
    expect(
      running.map(([key]) => key).filter((key) => runsOnLoad.has(key)),
    ).toEqual([...runsOnLoad].filter((key) => key.startsWith(`${name}/`)));
  },
);

test.each(entries)(
  '%s %s: an unused import of the published entry bundles to nothing',
  async (_name, subpath, dir, pkg) => {
    const published = pkg.publishConfig.exports![subpath]!;
    const code = await run(
      unusedImportOutput(`${dir}/${published.default}`, 'package'),
    );
    expect(code).toBe('');
  },
);

type WithPeerMeta = PackageJson & {
  readonly peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

// npm installs a required peer nobody above declares at its newest version.
// When the dependent's framework package pins an older one
// (`@tanstack/react-query` pins its `@tanstack/query-core`), the app gets two
// copies, two `skipToken`s and two `QueryClient` types.
test.each(
  packages.flatMap((dependency) =>
    packages
      .filter((dependent) =>
        Object.hasOwn(dependent.pkg.dependencies ?? {}, dependency.pkg.name),
      )
      .map(
        (dependent) =>
          [
            dependency.pkg.name,
            dependent.pkg.name,
            dependency,
            dependent,
          ] as const,
      ),
  ),
)(
  "%s's peers are %s's peers too, or optional",
  (_dependency, _dependent, dependency, dependent) => {
    const pkg = dependency.pkg as WithPeerMeta;
    const unforwarded = Object.keys(pkg.peerDependencies ?? {}).filter(
      (peer) =>
        !Object.hasOwn(dependent.pkg.peerDependencies ?? {}, peer) &&
        pkg.peerDependenciesMeta?.[peer]?.optional !== true,
    );
    expect(unforwarded).toEqual([]);
  },
);

test('importedPackages reads imports, not comments', () => {
  const source = [
    "import { Effect } from 'effect';",
    'import {',
    '  a,',
    "} from '@scope/pkg/sub';",
    "export * from './local.js';",
    "import 'server-only';",
    "type T = import('typescript').Node;",
    '/**',
    " * import { z } from 'zod';",
    ' */',
    'const s = \'from "superjson"\';',
  ].join('\n');
  expect(importedPackages(source)).toEqual([
    '@scope/pkg',
    'effect',
    'server-only',
    'typescript',
  ]);
});

test.each(packages.map((opts) => [opts.name, opts.pkg] as const))(
  '%s publishes publicly under @trpc12',
  (_name, pkg) => {
    expect(pkg.name).toMatch(/^@trpc12\//);
    expect(pkg.publishConfig.access).toBe('public');
  },
);

test('publishConfig.exports must mirror exports', () => {
  const ok: PackageJson = {
    name: 'p',
    exports: { '.': { types: './src/a.ts', default: './src/a.ts' } },
    publishConfig: {
      exports: { '.': { types: './dist/a.d.ts', default: './dist/a.js' } },
    },
  };
  expect(Effect.runSync(Effect.exit(checkExports(ok)))._tag).toBe('Success');
  expect(
    Effect.runSync(
      Effect.flip(checkExports({ ...ok, publishConfig: { exports: {} } })),
    ).message,
  ).toBe(
    'p: publishConfig.exports["."] must be {"types":"./dist/a.d.ts","default":"./dist/a.js"}',
  );
});
