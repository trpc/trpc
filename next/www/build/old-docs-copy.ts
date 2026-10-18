/**
 * Copies the docs trpc.io serves (the repo root's `www`: v11 in `docs/`,
 * v10 and v9 in `versioned_docs/`) into `<version>/docs` as pages of this
 * site, in each version's sidebar sections and order, and its blog's posts
 * into `blog/`. The copies are committed and nobody edits them: after the
 * docs or the blog change, run `pnpm --filter @trpc12/www old-docs:copy`
 * again.
 *
 * The pages are converted by `old-docs-convert.ts`. The copy fails on
 * anything it can't convert, and drops the `#hash` of links to headings
 * that don't exist, which Docusaurus only warns about and this site's build
 * rejects.
 */
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Console, Data, Effect, FileSystem, Path, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { parse as parseYaml } from 'yaml';

import { type CopiedVersion, copiedVersions } from '../src/site.ts';
import { anchorsOf } from './markdown.ts';
import {
  type CopiedPage,
  type CopiedPost,
  convertPage,
  convertPost,
  dropMissingAnchors,
  type PostAuthor,
  type SidebarItem,
  sidebarSections,
} from './old-docs-convert.ts';

class OldDocsCopyError extends Data.TaggedError('OldDocsCopyError')<{
  readonly message: string;
}> {}

const CategoryLink = Schema.Struct({
  description: Schema.optional(Schema.String),
  id: Schema.optional(Schema.String),
  slug: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  type: Schema.String,
});

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
    link: Schema.optional(CategoryLink),
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

const PostFrontmatter = Schema.Struct({
  author: Schema.optional(Schema.String),
  author_image_url: Schema.optional(Schema.String),
  author_title: Schema.optional(Schema.String),
  author_url: Schema.optional(Schema.String),
  authors: Schema.optional(
    Schema.Union([Schema.String, Schema.Array(Schema.String)]),
  ),
  commentDiscussionId: Schema.optional(Schema.Number),
  slug: Schema.optional(Schema.String),
  title: Schema.String,
});

const Authors = Schema.Record(
  Schema.String,
  Schema.Struct({
    image_url: Schema.optional(Schema.String),
    name: Schema.String,
    socials: Schema.optional(
      Schema.Struct({ github: Schema.optional(Schema.String) }),
    ),
    title: Schema.optional(Schema.String),
    url: Schema.optional(Schema.String),
  }),
);

const Redirects = Schema.Struct({
  redirects: Schema.Array(
    Schema.Struct({ destination: Schema.String, source: Schema.String }),
  ),
});

/**
 * Where trpc.io's Docusaurus config keeps each version's docs and sidebar,
 * and an older version's last release, which its links to `main` mean.
 */
const sources = {
  v9: {
    dir: 'versioned_docs/version-9.x',
    release: 'v9.27.4',
    sidebar: 'versioned_sidebars/version-9.x-sidebars.json',
  },
  v10: {
    dir: 'versioned_docs/version-10.x',
    release: 'v10.45.4',
    sidebar: 'versioned_sidebars/version-10.x-sidebars.json',
  },
  v11: { dir: 'docs', release: undefined, sidebar: 'sidebars.ts' },
} as const satisfies Record<
  CopiedVersion['id'],
  {
    readonly dir: string;
    readonly release: string | undefined;
    readonly sidebar: string;
  }
>;

/** The files and dirs the repo had at `tag`, from the git checkout `www` is in. */
const readRelease = Effect.fn('readRelease')(function* (
  www: string,
  tag: string,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const listing = yield* spawner
    .string(
      ChildProcess.make(
        'git',
        ['ls-tree', '-r', '-t', '--full-tree', '--name-only', tag],
        {
          cwd: www,
          stderr: 'ignore',
        },
      ),
    )
    .pipe(Effect.orElseSucceed(() => ''));
  if (listing.trim() === '') {
    return yield* new OldDocsCopyError({
      message: `git has no tag ${tag}: run \`git fetch origin tag ${tag}\``,
    });
  }
  return { paths: new Set(listing.trim().split('\n')), tag };
});

const failWith = (message: string) => (cause: unknown) =>
  new OldDocsCopyError({
    message: `${message}: ${cause instanceof Error ? cause.message : String(cause)}`,
  });

/** The YAML in `contents`, failing as `name`'s. */
const yamlOf = (name: string, contents: string) =>
  Effect.try({
    catch: failWith(name),
    try: () => (parseYaml(contents) as unknown) ?? {},
  });

const frontmatterYaml = (contents: string) =>
  /^---\n([\s\S]*?)\n---\n/.exec(contents)?.[1] ?? '';

const frontmatterOf = Effect.fn('frontmatterOf')(function* (
  name: string,
  contents: string,
) {
  return yield* yamlOf(name, frontmatterYaml(contents)).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(DocFrontmatter)),
    Effect.mapError(failWith(`${name}: invalid frontmatter`)),
  );
});

/**
 * The blog's posts, as Docusaurus reads them: the date and slug from the
 * file's name (`2025-03-21-announcing-trpc-11.mdx`) unless the frontmatter
 * has a `slug`, and the authors from `authors.yml` or the frontmatter.
 */
const readPosts = Effect.fn('readPosts')(function* (
  files: ReadonlyMap<string, string>,
) {
  const authorsFile = 'blog/authors.yml';
  const authors = yield* yamlOf(authorsFile, files.get(authorsFile) ?? '').pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Authors)),
    Effect.mapError(failWith(`${authorsFile}: unexpected authors`)),
  );
  const posts: Array<CopiedPost> = [];
  for (const [file, contents] of files) {
    const name = /^blog\/(\d{4}-\d{2}-\d{2})-(.+)\.mdx?$/.exec(file);
    if (!name?.[1] || !name[2]) {
      continue;
    }
    const frontmatter = yield* yamlOf(file, frontmatterYaml(contents)).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(PostFrontmatter)),
      Effect.mapError(failWith(`${file}: invalid frontmatter`)),
    );
    const keys =
      typeof frontmatter.authors === 'string'
        ? [frontmatter.authors]
        : (frontmatter.authors ?? []);
    const byKey: Array<PostAuthor> = [];
    for (const key of keys) {
      const author = authors[key];
      if (!author) {
        return yield* new OldDocsCopyError({
          message: `${file}: ${key} isn't in ${authorsFile}`,
        });
      }
      const github = author.socials?.github;
      byKey.push({
        image: author.image_url,
        name: author.name,
        title: author.title,
        url:
          author.url ??
          (github === undefined ? undefined : `https://github.com/${github}`),
      });
    }
    const inline: ReadonlyArray<PostAuthor> =
      frontmatter.author === undefined
        ? []
        : [
            {
              image: frontmatter.author_image_url,
              name: frontmatter.author,
              title: frontmatter.author_title,
              url: frontmatter.author_url,
            },
          ];
    posts.push({
      authors: [...byKey, ...inline],
      date: name[1],
      discussion: frontmatter.commentDiscussionId,
      file,
      slug: frontmatter.slug ?? name[2],
      title: frontmatter.title,
    });
  }
  return posts.toSorted((a, b) => b.date.localeCompare(a.date));
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
 * Reads a sidebar: a version's JSON, or `sidebars.ts`, run for its config.
 * Its imports are types and an env parser for the API reference, which the
 * copy leaves out.
 */
const readSidebar = Effect.fn('readSidebar')(function* (file: string) {
  const fs = yield* FileSystem.FileSystem;
  const source = yield* fs.readFileString(file);
  const loaded: unknown = file.endsWith('.json')
    ? {
        default: yield* Effect.try({
          catch: failWith(`${file}`),
          try: () => JSON.parse(source) as unknown,
        }),
      }
    : yield* Effect.tryPromise({
        catch: failWith(`${file} didn't run`),
        try: async () =>
          import(
            `data:text/javascript,${encodeURIComponent(
              [
                'const parseEnv = () => ({});',
                stripTypeScriptTypes(
                  source.replaceAll(/^import\s[^;]*;$/gm, ''),
                ),
              ].join('\n'),
            )}`
          ),
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

/** A doc, as the copy reads it before placing it in the sidebar. */
type Doc = Omit<CopiedPage, 'order' | 'parent' | 'section'>;

/** Docusaurus leaves out files and dirs whose name starts with `_`: partials. */
const isPartial = (file: string) => /(?:^|\/)_/.test(file);

/** One version's pages, and the docs its sidebar doesn't list. */
const readVersion = Effect.fn('readVersion')(function* (
  www: string,
  version: CopiedVersion,
  files: ReadonlyMap<string, string>,
) {
  const path = yield* Path.Path;
  const source = sources[version.id];
  const sidebar = sidebarSections(
    yield* readSidebar(path.join(www, source.sidebar)),
  );
  const byId = new Map<string, Doc>();
  const byFile = new Map<string, Doc>();
  for (const [name, contents] of files) {
    const doc = new RegExp(
      `^${source.dir.replaceAll('.', '\\.')}/(.+)\\.mdx?$`,
    ).exec(name)?.[1];
    if (doc === undefined || isPartial(doc)) {
      continue;
    }
    const frontmatter = yield* frontmatterOf(name, contents);
    const derived = docOf(doc, frontmatter);
    const entry: Doc = {
      description: frontmatter.description ?? '',
      file: name,
      label: frontmatter.sidebar_label,
      slug: derived.slug === '' ? version.firstDoc : derived.slug,
      title: frontmatter.title ?? derived.base,
      version: version.id,
    };
    byId.set(derived.id, entry);
    byFile.set(name, entry);
  }
  const pages: Array<CopiedPage> = [];
  /** The generated indexes' Markdown, which links the docs they list. */
  const indexes = new Map<string, string>();
  for (const entry of sidebar.entries) {
    let doc = byId.get(entry.id);
    if (entry.index) {
      const index = entry.index;
      const file = `generated/${version.id}/${index.slug}.md`;
      const list = index.items.map((id) => {
        const item = byId.get(id);
        return item === undefined
          ? undefined
          : `- [${item.label ?? item.title}](${version.trpcPath}/${item.slug})${item.description ? `: ${item.description}` : ''}`;
      });
      if (list.includes(undefined)) {
        return yield* new OldDocsCopyError({
          message: `${version.id}: the index ${index.slug} lists a doc that isn't there`,
        });
      }
      indexes.set(file, `${list.join('\n')}\n`);
      doc = {
        description: index.description,
        file,
        label: entry.label,
        slug: index.slug,
        title: index.title,
        version: version.id,
      };
      byId.set(entry.id, doc);
    }
    if (!doc) {
      return yield* new OldDocsCopyError({
        message: `The ${version.id} sidebar lists ${entry.id}, which isn't a doc`,
      });
    }
    const parent =
      entry.parent === undefined ? undefined : byId.get(entry.parent);
    if (entry.parent !== undefined && !parent) {
      return yield* new OldDocsCopyError({
        message: `The ${version.id} sidebar nests ${entry.id} under ${entry.parent}, which isn't a doc`,
      });
    }
    const label = entry.label ?? doc.label;
    pages.push({
      ...doc,
      label,
      order: entry.order,
      parent: parent?.slug,
      // A doc outside the categories is a section of its own.
      section: entry.section || (label ?? doc.title),
    });
  }
  const sections = [...new Set(pages.map((page) => page.section))];
  if (pages[0]?.slug !== version.firstDoc) {
    return yield* new OldDocsCopyError({
      message: `The ${version.id} sidebar starts at ${pages[0]?.slug}, not at ${version.firstDoc} (\`firstDoc\` in src/site.ts)`,
    });
  }
  const unlisted = new Map(
    [...byFile]
      .filter(([file]) => !pages.some((page) => page.file === file))
      .map(([file, doc]) => [
        file,
        `${version.trpcPath}${doc.slug === version.firstDoc ? '' : `/${doc.slug}`}`,
      ]),
  );
  return { indexes, pages, sections, unlisted };
});

/** Every version's pages, with what the copy reads to convert them. */
const readDocs = Effect.fn('readDocs')(function* (www: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const names = [
    ...(yield* listFiles(www, 'docs', ['**/*.md', '**/*.mdx'])),
    ...(yield* listFiles(www, 'versioned_docs', ['**/*.md', '**/*.mdx'])),
    ...(yield* listFiles(www, 'unversioned', ['*.mdx'])),
    ...(yield* listFiles(www, 'src/components', ['*.tsx'])),
    ...(yield* listFiles(www, 'blog', ['*.md', '*.mdx', 'authors.yml'])),
  ];
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
  const versions = yield* Effect.forEach(copiedVersions, (version) =>
    Effect.map(readVersion(www, version, files), (read) => ({
      ...read,
      version,
    })),
  );
  for (const read of versions) {
    for (const [file, contents] of read.indexes) {
      files.set(file, contents);
    }
  }
  const vercel = yield* fs.readFileString(path.join(www, 'vercel.json')).pipe(
    Effect.flatMap((json) =>
      Effect.try({
        catch: failWith('vercel.json'),
        try: () => JSON.parse(json) as unknown,
      }),
    ),
    Effect.flatMap(Schema.decodeUnknownEffect(Redirects)),
    Effect.mapError(failWith('vercel.json: unexpected redirects')),
  );
  const releases = new Map(
    yield* Effect.forEach(copiedVersions, (version) => {
      const tag = sources[version.id].release;
      return tag === undefined
        ? Effect.succeed([])
        : Effect.map(readRelease(www, tag), (release) => [
            [version.id, release] as const,
          ]);
    }).pipe(Effect.map((entries) => entries.flat())),
  );
  return {
    docs: {
      files,
      pages: versions.flatMap((read) => read.pages),
      posts: yield* readPosts(files),
      redirects: vercel.redirects,
      releases,
      unlisted: new Map(versions.flatMap((read) => [...read.unlisted])),
    },
    versions,
  };
});

const readme = (
  version: CopiedVersion,
  from: string,
) => `# The ${version.id} docs

A copy of the [${version.id} docs](../../../../www/${from}), which [trpc.io](${version.url}${version.trpcPath}) renders. The site serves it at \`${version.basePath}\`, for ${version.id} users while v12 is experimental.

Don't edit these files: \`www/build/old-docs-copy.ts\` writes them. Change the docs in the repo root's \`www/${from}\`, then run \`pnpm --filter @trpc12/www old-docs:copy\`.
`;

const blogReadme = `# The blog

A copy of [trpc.io's blog](../../../www/blog), which [trpc.io](https://trpc.io/blog) renders. The site serves it at \`/blog\`.

Don't edit these files: \`www/build/old-docs-copy.ts\` writes them. Change the posts in the repo root's \`www/blog\`, then run \`pnpm --filter @trpc12/www old-docs:copy\`.
`;

export interface CopyDirs {
  /** trpc.io's site: the repo root's `www`. */
  readonly from: string;
  /** Where the copies go: `<version>/` holds `docs/` and `sections.json`, and `blog/` the posts. */
  readonly to: string;
  /** Where the images go: `<version>/img` under it, the site's `public/`. */
  readonly images: string;
}

/** Converts and writes every page of every version's sidebar, and every post. */
export const copyOldDocs = Effect.fn('copyOldDocs')(function* (dirs: CopyDirs) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const read = yield* readDocs(dirs.from);
  const docs = read.docs;
  const converted = docs.pages.map((page) => ({
    page,
    ...convertPage(page, docs),
  }));
  const problems = converted.flatMap((entry) => entry.problems);
  if (problems.length > 0) {
    return yield* new OldDocsCopyError({
      message: `The docs have what the copy can't convert:\n${problems.join('\n')}`,
    });
  }
  const anchors = new Map(
    yield* Effect.forEach(converted, (entry) =>
      Effect.map(
        anchorsOf(entry.markdown.replace(/^---\n[\s\S]*?\n---\n/, '')),
        (ids) =>
          [`${entry.page.version}:${entry.page.slug}`, new Set(ids)] as const,
      ),
    ),
  );
  const pages = converted.map((entry) => ({
    ...entry,
    ...dropMissingAnchors(entry.markdown, entry.page, anchors),
  }));
  // A post shows its images from v11's, as it links v11's pages.
  const posts = docs.posts.map((post) => {
    const result = convertPost(post, docs);
    return {
      images: result.images,
      post,
      problems: result.problems,
      ...dropMissingAnchors(
        result.markdown,
        { slug: post.slug, version: 'v11' },
        anchors,
      ),
    };
  });
  const postProblems = posts.flatMap((entry) => entry.problems);
  if (postProblems.length > 0) {
    return yield* new OldDocsCopyError({
      message: `The blog has what the copy can't convert:\n${postProblems.join('\n')}`,
    });
  }
  const report: Array<string> = [];
  for (const { sections, version } of read.versions) {
    const own = pages.filter((entry) => entry.page.version === version.id);
    const versionDir = path.join(dirs.to, version.id);
    const docsDir = path.join(versionDir, 'docs');
    const imagesDir = path.join(dirs.images, version.id, 'img');
    yield* fs.remove(docsDir, { force: true, recursive: true });
    yield* fs.remove(imagesDir, { force: true, recursive: true });
    yield* fs.makeDirectory(imagesDir, { recursive: true });
    yield* Effect.forEach(own, (entry) => {
      const file = path.join(docsDir, `${entry.page.slug}.md`);
      return Effect.andThen(
        fs.makeDirectory(path.dirname(file), { recursive: true }),
        fs.writeFileString(file, entry.markdown),
      );
    });
    yield* fs.writeFileString(
      path.join(docsDir, 'README.md'),
      readme(version, sources[version.id].dir),
    );
    yield* fs.writeFileString(
      path.join(versionDir, 'sections.json'),
      `${JSON.stringify(sections, null, 2)}\n`,
    );
    const images = [
      ...new Set([
        ...own.flatMap((entry) => entry.images),
        ...(version.id === 'v11' ? posts.flatMap((entry) => entry.images) : []),
      ]),
    ];
    yield* Effect.forEach(images, (image) =>
      fs.copyFile(
        path.join(dirs.from, image),
        path.join(imagesDir, path.basename(image)),
      ),
    );
    report.push(
      `Copied ${own.length} ${version.id} pages in ${sections.length} sections, and ${images.length} images.`,
    );
  }
  const blogDir = path.join(dirs.to, 'blog');
  yield* fs.remove(blogDir, { force: true, recursive: true });
  yield* fs.makeDirectory(blogDir, { recursive: true });
  yield* Effect.forEach(posts, (entry) =>
    fs.writeFileString(
      path.join(blogDir, `${entry.post.slug}.md`),
      entry.markdown,
    ),
  );
  yield* fs.writeFileString(path.join(blogDir, 'README.md'), blogReadme);
  report.push(`Copied ${posts.length} blog posts.`);
  const dropped = [...pages, ...posts].flatMap((entry) => entry.dropped);
  yield* Console.log(
    [
      ...report,
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
  copyOldDocs({
    from: here('../../../www'),
    images: here('../public'),
    to: here('..'),
  }).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
}
