/**
 * Copies the v11 docs (the repo root's `www/docs`, which trpc.io renders)
 * into `v11/docs` as pages of this site, in the v11 sidebar's sections and
 * order. The copy is committed and nobody edits it: after the v11 docs
 * change, run `pnpm --filter @trpc12/www v11:copy` again.
 *
 * The pages are converted by `v11-convert.ts`. The copy fails on anything it
 * can't convert, and drops the `#hash` of links to headings that don't
 * exist, which Docusaurus only warns about and this site's build rejects.
 */
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Console, Data, Effect, FileSystem, Path, Schema } from 'effect';
import { parse as parseYaml } from 'yaml';

import { v11 } from '../src/site.ts';
import { headingsOf } from './markdown.ts';
import {
  convertPage,
  dropMissingAnchors,
  type SidebarItem,
  sidebarSections,
  type V11Page,
} from './v11-convert.ts';

class V11CopyError extends Data.TaggedError('V11CopyError')<{
  readonly message: string;
}> {}

const SidebarItem: Schema.Codec<SidebarItem> = Schema.Union([
  Schema.String,
  Schema.Struct({
    id: Schema.optional(Schema.String),
    items: Schema.optional(
      Schema.Array(
        Schema.suspend((): Schema.Codec<SidebarItem> => SidebarItem),
      ),
    ),
    label: Schema.optional(Schema.String),
    type: Schema.String,
  }),
]);

const Sidebars = Schema.Struct({ docs: Schema.Array(SidebarItem) });

const DocFrontmatter = Schema.Struct({
  description: Schema.optional(Schema.String),
  id: Schema.optional(Schema.String),
  sidebar_label: Schema.optional(Schema.String),
  slug: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
});

const failWith = (message: string) => (cause: unknown) =>
  new V11CopyError({
    message: `${message}: ${cause instanceof Error ? cause.message : String(cause)}`,
  });

const frontmatterOf = Effect.fn('frontmatterOf')(function* (
  name: string,
  contents: string,
) {
  const yaml = /^---\n([\s\S]*?)\n---\n/.exec(contents)?.[1] ?? '';
  return yield* Effect.try({
    catch: failWith(`${name}: invalid frontmatter`),
    try: () => (parseYaml(yaml) as unknown) ?? {},
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(DocFrontmatter)),
    Effect.mapError(failWith(`${name}: invalid frontmatter`)),
  );
});

/**
 * A doc's id and slug, as Docusaurus derives them from its path under the
 * docs dir (`server/procedures`) and its frontmatter.
 */
function docOf(path: string, frontmatter: typeof DocFrontmatter.Type) {
  const dir = path.includes('/')
    ? path.slice(0, path.lastIndexOf('/') + 1)
    : '';
  const base = path.slice(dir.length);
  const id = `${dir}${frontmatter.id ?? base}`;
  return {
    base,
    id,
    slug: (frontmatter.slug ?? `/${id}`).replace(/^\//, ''),
  };
}

/**
 * Runs `sidebars.ts` for its config. Its imports are types and an env
 * parser for the API reference, which the copy leaves out.
 */
const readSidebar = Effect.fn('readSidebar')(function* (file: string) {
  const fs = yield* FileSystem.FileSystem;
  const source = yield* fs.readFileString(file);
  const javascript = [
    'const parseEnv = () => ({});',
    stripTypeScriptTypes(source.replaceAll(/^import\s[^;]*;$/gm, '')),
  ].join('\n');
  const loaded: unknown = yield* Effect.tryPromise({
    catch: failWith(`${file} didn't run`),
    try: async () =>
      import(`data:text/javascript,${encodeURIComponent(javascript)}`),
  });
  const config = yield* Schema.decodeUnknownEffect(
    Schema.Struct({ default: Sidebars }),
  )(loaded).pipe(Effect.mapError(failWith(`${file}: unexpected sidebar`)));
  return config.default.docs;
});

/** Every file under `dir` matching `pattern`, as `/`-separated paths from `www`. */
const listFiles = Effect.fn('listFiles')(function* (
  www: string,
  dir: string,
  patterns: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.join(www, dir);
  const names = yield* Effect.forEach(patterns, (pattern) =>
    fs.glob(pattern, { root }),
  );
  return names
    .flat()
    .map((name) => `${dir}/${name.split(path.sep).join('/')}`)
    .toSorted();
});

/** The v11 pages of the sidebar, with what the copy reads to convert them. */
const readV11Docs = Effect.fn('readV11Docs')(function* (www: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const sidebar = sidebarSections(
    yield* readSidebar(path.join(www, 'sidebars.ts')),
  );
  const names = [
    ...(yield* listFiles(www, 'docs', ['**/*.md', '**/*.mdx'])),
    ...(yield* listFiles(www, 'unversioned', ['*.mdx'])),
    ...(yield* listFiles(www, 'src/components', ['*.tsx'])),
  ];
  const archivedNames = yield* listFiles(www, 'versioned_docs', [
    '**/*.md',
    '**/*.mdx',
  ]);
  const files = new Map(
    yield* Effect.forEach(
      names,
      (name) =>
        Effect.map(
          fs.readFileString(path.join(www, name)),
          (contents) => [name, contents] as const,
        ),
      { concurrency: 'unbounded' },
    ),
  );
  const archived = new Map<string, string>();
  for (const name of archivedNames) {
    const match = /^versioned_docs\/version-(\d+)\.x\/(.+)\.mdx?$/.exec(name);
    if (!match?.[1] || !match[2]) {
      continue;
    }
    const doc = docOf(
      match[2],
      yield* frontmatterOf(
        name,
        yield* fs.readFileString(path.join(www, name)),
      ),
    );
    archived.set(
      name,
      `/docs/v${match[1]}${doc.slug === '' ? '' : `/${doc.slug}`}`,
    );
  }
  const byId = new Map<string, Omit<V11Page, 'order' | 'parent' | 'section'>>();
  for (const [name, contents] of files) {
    const doc = /^docs\/(.+)\.mdx?$/.exec(name)?.[1];
    if (doc === undefined) {
      continue;
    }
    const frontmatter = yield* frontmatterOf(name, contents);
    const derived = docOf(doc, frontmatter);
    byId.set(derived.id, {
      description: frontmatter.description ?? '',
      file: name,
      label: frontmatter.sidebar_label,
      slug: derived.slug === '' ? v11.firstDoc : derived.slug,
      title: frontmatter.title ?? derived.base,
    });
  }
  const pages: Array<V11Page> = [];
  for (const entry of sidebar.entries) {
    const doc = byId.get(entry.id);
    if (!doc) {
      return yield* new V11CopyError({
        message: `The sidebar lists ${entry.id}, which isn't a doc`,
      });
    }
    const parent =
      entry.parent === undefined ? undefined : byId.get(entry.parent);
    if (entry.parent !== undefined && !parent) {
      return yield* new V11CopyError({
        message: `The sidebar nests ${entry.id} under ${entry.parent}, which isn't a doc`,
      });
    }
    pages.push({
      ...doc,
      label: entry.label ?? doc.label,
      order: entry.order,
      parent: parent?.slug,
      section: entry.section,
    });
  }
  if (pages[0]?.slug !== v11.firstDoc) {
    return yield* new V11CopyError({
      message: `The sidebar starts at ${pages[0]?.slug}, not at ${v11.firstDoc} (\`v11.firstDoc\` in src/site.ts)`,
    });
  }
  return { archived, files, pages, sections: sidebar.sections };
});

const readme = `# The v11 docs

A copy of the [v11 docs](../../../../www/docs), which [trpc.io](${v11.url}/docs) renders. The site serves it at \`${v11.basePath}\`, for v11 users while v12 is experimental.

Don't edit these files: \`www/build/v11-copy.ts\` writes them. Change the v11 docs in the repo root's \`www/docs\`, then run \`pnpm --filter @trpc12/www v11:copy\`.
`;

export interface CopyDirs {
  /** The v11 site: the repo root's `www`. */
  readonly from: string;
  /** Where the pages go: `v11/` holds `docs/` and `sections.json`. */
  readonly to: string;
  /** Where the images the pages show go, under the site's `public/`. */
  readonly images: string;
}

/** Converts and writes every v11 page of the sidebar. */
export const copyV11 = Effect.fn('copyV11')(function* (dirs: CopyDirs) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const docs = yield* readV11Docs(dirs.from);
  const converted = docs.pages.map((page) => ({
    page,
    ...convertPage(page, docs),
  }));
  const problems = converted.flatMap((entry) => entry.problems);
  if (problems.length > 0) {
    return yield* new V11CopyError({
      message: `The v11 docs have what the copy can't convert:\n${problems.join('\n')}`,
    });
  }
  const anchors = new Map(
    yield* Effect.forEach(converted, (entry) =>
      Effect.map(
        headingsOf(entry.markdown.replace(/^---\n[\s\S]*?\n---\n/, '')),
        (headings) =>
          [
            entry.page.slug,
            new Set(headings.map((heading) => heading.id)),
          ] as const,
      ),
    ),
  );
  const pages = converted.map((entry) => ({
    ...entry,
    ...dropMissingAnchors(entry.markdown, entry.page.slug, anchors),
  }));
  const docsDir = path.join(dirs.to, 'docs');
  yield* fs.remove(docsDir, { force: true, recursive: true });
  yield* fs.remove(dirs.images, { force: true, recursive: true });
  yield* fs.makeDirectory(dirs.images, { recursive: true });
  yield* Effect.forEach(pages, (entry) => {
    const file = path.join(docsDir, `${entry.page.slug}.md`);
    return Effect.andThen(
      fs.makeDirectory(path.dirname(file), { recursive: true }),
      fs.writeFileString(file, entry.markdown),
    );
  });
  yield* fs.writeFileString(path.join(docsDir, 'README.md'), readme);
  yield* fs.writeFileString(
    path.join(dirs.to, 'sections.json'),
    `${JSON.stringify(docs.sections, null, 2)}\n`,
  );
  const images = [...new Set(pages.flatMap((entry) => entry.images))];
  yield* Effect.forEach(images, (image) =>
    fs.copyFile(
      path.join(dirs.from, image),
      path.join(dirs.images, path.basename(image)),
    ),
  );
  const dropped = pages.flatMap((entry) => entry.dropped);
  yield* Console.log(
    [
      `Copied ${pages.length} v11 pages in ${docs.sections.length} sections, and ${images.length} images.`,
      ...(dropped.length > 0
        ? [
            `Dropped the #hash of ${dropped.length} links to headings that don't exist:`,
            ...dropped.map((link) => `  ${link}`),
          ]
        : []),
    ].join('\n'),
  );
});

if (import.meta.main) {
  const here = (relative: string) =>
    fileURLToPath(new URL(relative, import.meta.url));
  copyV11({
    from: here('../../../www'),
    images: here('../public/v11/img'),
    to: here('../v11'),
  }).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
}
