import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Path } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { beforeAll, expect, test } from 'vite-plus/test';
import { checkExports, type PackageJson } from './pack.ts';

const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(Effect.provide(effect, NodeServices.layer));

const root = new URL('../..', import.meta.url).pathname;

const packages = await run(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = path.join(root, 'packages');
    return yield* Effect.forEach(yield* fs.readDirectory(dir), (name) =>
      Effect.map(
        fs.readFileString(path.join(dir, name, 'package.json')),
        (text) => ({
          name,
          dir: path.join(dir, name),
          pkg: JSON.parse(text) as Required<PackageJson>,
        }),
      ),
    );
  }),
);

beforeAll(async () => {
  const exitCode = await run(
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
  expect(exitCode).toBe(0);
}, 120_000);

const entries = packages.flatMap(({ name, dir, pkg }) =>
  Object.keys(pkg.exports).map((subpath) => [name, subpath, dir, pkg] as const),
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
  },
);

test('publishConfig.exports must mirror exports', () => {
  const entry = { types: './src/a.ts', default: './src/a.ts' };
  const ok: PackageJson = {
    name: 'p',
    exports: { '.': entry },
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
