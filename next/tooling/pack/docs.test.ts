import { NodeServices } from '@effect/platform-node';
import { site, v12 } from '@trpc12/www/site';
import { Effect, FileSystem, Path } from 'effect';
import { expect, test } from 'vite-plus/test';
import { packageDirs } from './packages.ts';

const run = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
) => Effect.runPromise(Effect.provide(effect, NodeServices.layer));

const root = new URL('../..', import.meta.url).pathname;
/** The docs pages, which the site renders. */
const docsDir = `${root}www/docs/`;
/** Where READMEs link the docs: on the site, so they follow `site.url` to trpc.io. */
const docsUrl = `${site.url}${v12.basePath}/`;

const packages = await run(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = path.join(root, 'packages');
    return yield* Effect.forEach(yield* packageDirs(root), (name) =>
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

/** The docs pages a README links on the site, as their files under `docsDir`. */
const linkedPages = (readme: string | undefined) =>
  [...(readme ?? '').matchAll(/\]\(([^)#\s]+)/g)]
    .map(([, url]) => url!)
    .filter((url) => url.startsWith(docsUrl))
    .map((url) => `${url.slice(docsUrl.length)}.md`);

test.each(packages.map((opts) => [opts.name, opts] as const))(
  "%s's README links the docs on the site, not as files",
  (_name, opts) => {
    expect(opts.readme ?? '').not.toMatch(/\]\([^)]*\bdocs\/[^)]*\.md\b/);
  },
);

/** Packages whose own docs page, the first their README links, is in an experiment; the packages page leaves them out too. */
const experimental = await run(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const names = yield* Effect.filter(packages, (opts) => {
      const page = linkedPages(opts.readme)[0];
      if (page === undefined) return Effect.succeed(false);
      return fs.readFileString(`${docsDir}${page}`).pipe(
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
    return yield* fs.readFileString(`${docsDir}packages.md`);
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
          fs.exists(`${docsDir}${page}`),
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
)('%s is listed in www/docs/packages.md', (name) => {
  expect(packagesPage).toContain(`\`${name}\``);
});

test('packages whose docs are in experiments are left out of www/docs/packages.md', () => {
  expect([...experimental].sort()).toEqual([
    '@trpc12/experimental-nest',
    '@trpc12/experimental-react',
    '@trpc12/experimental-react-atom',
    '@trpc12/experimental-tanstack-angular-query',
    '@trpc12/experimental-tanstack-db',
    '@trpc12/experimental-tanstack-lit-query',
    '@trpc12/experimental-tanstack-preact-query',
    '@trpc12/experimental-tanstack-solid-query',
    '@trpc12/experimental-tanstack-svelte-query',
    '@trpc12/experimental-tanstack-vue-query',
  ]);
  for (const name of experimental) {
    expect(packagesPage).not.toContain(`\`${name}\``);
  }
});

test('a package is named experimental- exactly when its docs are in an experiment', () => {
  expect(
    packages
      .map((opts) => opts.name)
      .filter(
        (name) =>
          experimental.has(name) !== name.startsWith('@trpc12/experimental-'),
      ),
  ).toEqual([]);
});

const experimentPages = await run(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const files = (yield* fs.readDirectory(docsDir, {
      recursive: true,
    })).filter((file) => file.endsWith('.md'));
    const pages = yield* Effect.forEach(files, (file) =>
      fs.readFileString(path.join(docsDir, file)),
    );
    const byExperiment = new Map<string, string[]>();
    for (const text of pages) {
      const id = /^experiment: (\S+)/m.exec(text.split('\n---\n')[0]!)?.[1];
      if (id !== undefined)
        byExperiment.set(id, [...(byExperiment.get(id) ?? []), text]);
    }
    return byExperiment;
  }),
);

/**
 * Experiments without an API of their own: recipes (stable APIs with another
 * library), hidden until reviewed; the kitchen sink's demos, apps on the
 * stable APIs; and the benchmarks page, which documents none.
 */
const recipes = new Set(['benchmarks', 'integrations', 'kitchen-sink']);

test.each([...experimentPages.keys()].sort().map((id) => [id] as const))(
  'the %s experiment documents experimental_ exports or experimental- packages, unless it has no API of its own',
  (id) => {
    const prefixed = experimentPages
      .get(id)!
      .some((text) =>
        /import\s[^;]*\bexperimental_\w+[^;]*from '@trpc12\/|from '@trpc12\/experimental-/.test(
          text,
        ),
      );
    expect(prefixed, `${id} documents only stable names`).toBe(
      !recipes.has(id),
    );
  },
);
