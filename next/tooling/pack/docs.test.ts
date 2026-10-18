import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Path } from 'effect';
import { expect, test } from 'vite-plus/test';

const run = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
) => Effect.runPromise(Effect.provide(effect, NodeServices.layer));

const root = new URL('../..', import.meta.url).pathname;
/** Where READMEs link the docs: on GitHub, which npm's README page can reach. */
const docsUrl = 'https://github.com/trpc/trpc/blob/v12/next/docs/';

const packages = await run(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = path.join(root, 'packages');
    return yield* Effect.forEach(yield* fs.readDirectory(dir), (name) =>
      Effect.gen(function* () {
        const pkg = JSON.parse(
          yield* fs.readFileString(path.join(dir, name, 'package.json')),
        ) as { name: string; description?: string };
        const readmePath = path.join(dir, name, 'README.md');
        const readme = (yield* fs.exists(readmePath))
          ? yield* fs.readFileString(readmePath)
          : undefined;
        return { name: pkg.name, description: pkg.description, readme };
      }),
    );
  }),
);

/** The docs pages a README links on GitHub. */
const linkedPages = (readme: string | undefined) =>
  [
    ...(readme ?? '').matchAll(
      /\]\(https:\/\/github\.com\/trpc\/trpc\/blob\/v12\/next\/docs\/([^)#]+)/g,
    ),
  ].map(([, page]) => page!);

/** Packages whose own docs page, the first their README links, is in an experiment; the packages page leaves them out too. */
const experimental = await run(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const names = yield* Effect.filter(packages, (opts) => {
      const page = linkedPages(opts.readme)[0];
      if (page === undefined) return Effect.succeed(false);
      return fs.readFileString(`${root}docs/${page}`).pipe(
        Effect.map((text) => /^experiment: /m.test(text.split('\n---\n')[0]!)),
        Effect.orElseSucceed(() => false),
      );
    });
    return new Set(names.map((opts) => opts.name));
  }),
);

const packagesPage = await run(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(`${root}docs/packages.md`);
  }),
);

test.each(packages.map((opts) => [opts.name, opts] as const))(
  '%s has a description and a README that links its docs',
  async (name, opts) => {
    expect(opts.description, `${name} has no description`).toBeTruthy();
    expect(opts.readme, `${name} has no README.md`).toBeDefined();
    expect(opts.readme!.split('\n')[0]).toBe(`# \`${name}\``);
    const pages = linkedPages(opts.readme);
    expect(pages.length, `${name}'s README links no docs page`).toBeGreaterThan(
      0,
    );
    const missing = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const exists = yield* Effect.forEach(pages, (page) =>
          fs.exists(`${root}docs/${page}`),
        );
        return pages.filter((_, i) => !exists[i]);
      }),
    );
    expect(missing, `pages under ${docsUrl} that don't exist`).toEqual([]);
  },
);

test.each(
  packages
    .filter((opts) => !experimental.has(opts.name))
    .map((opts) => [opts.name] as const),
)('%s is listed in docs/packages.md', (name) => {
  expect(packagesPage).toContain(`\`${name}\``);
});

test('packages whose docs are in experiments are left out of docs/packages.md', () => {
  expect([...experimental].sort()).toEqual([
    '@trpc12/experimental-react',
    '@trpc12/experimental-react-atom',
    '@trpc12/nest',
    '@trpc12/tanstack-angular-query',
    '@trpc12/tanstack-lit-query',
    '@trpc12/tanstack-preact-query',
    '@trpc12/tanstack-solid-query',
    '@trpc12/tanstack-svelte-query',
    '@trpc12/tanstack-vue-query',
  ]);
  for (const name of experimental) {
    expect(packagesPage).not.toContain(`\`${name}\``);
  }
});
