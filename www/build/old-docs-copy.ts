/**
 * Copies the Docusaurus docs trpc.io served before this site (`www/` at a
 * commit before the move, checked out at `OLD_WWW`: v11 in `docs/`, v10 and
 * v9 in `versioned_docs/`) into `<version>/docs` as pages of this site, in
 * each version's sidebar sections and order, and its blog's posts into
 * `blog/`. The copies are the docs now, edited where they are; nothing
 * reruns the copy. `--check` fails when the committed copies aren't what the
 * copy writes from `OLD_WWW`, which shows what changed since.
 *
 * The pages are converted by `old-docs-convert.ts`. The copy fails on
 * anything it can't convert, and drops the `#hash` of links to headings
 * that don't exist, which Docusaurus only warns about and this site's build
 * rejects.
 *
 * Every file git has under `docs/`, `versioned_docs/` and `blog/` is either
 * copied or in `notCopied`, saying why; the copy fails on any other. It
 * writes where each file went to `old-docs.json`. It reads only the files
 * git lists (tracked, or untracked and not ignored), so a local build's
 * output, like the generated API reference, stays out, and two runs over
 * the same tree write the same bytes.
 */
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Console, Data, Effect, FileSystem, Path, Schema } from 'effect';
import { Command, Flag } from 'effect/cli';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { parse as parseYaml } from 'yaml';

import { type CopiedVersion, copiedVersions } from '../src/site.ts';
import { anchorsOf } from './markdown.ts';
import {
  type CopiedPage,
  type CopiedPost,
  convertPage,
  convertPost,
  convertSnippet,
  dropMissingAnchors,
  type PostAuthor,
  type SidebarItem,
  sidebarSections,
} from './old-docs-convert.ts';
import { redirectsFile } from './old-routes.ts';

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
    Schema.Struct({
      destination: Schema.String,
      permanent: Schema.optional(Schema.Boolean),
      source: Schema.String,
    }),
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

/** The trees whose every file the copy accounts for. */
const contentDirs = ['docs', 'versioned_docs', 'blog'] as const;

/**
 * The files in `contentDirs` the copy leaves out on purpose, and why. A doc
 * no sidebar lists is still served by trpc.io, so leaving one out takes an
 * entry here: links to it go to trpc.io.
 */
export const notCopied: Readonly<Record<string, string>> = {
  'blog/authors.yml':
    "The posts' authors, written into each post's frontmatter",
  'docs/.gitignore':
    'Ignores the generated API reference, which links to trpc.io',
  'docs/test-sub.md': 'A Twoslash test page no sidebar lists',
  'versioned_docs/version-10.x/.gitignore':
    'Ignores the generated API reference, which links to trpc.io',
  'versioned_docs/version-10.x/landing-intro/Step1.md':
    "v10's copy of the home page's intro, which nothing shows; no sidebar lists it",
  'versioned_docs/version-10.x/landing-intro/Step2.md':
    "v10's copy of the home page's intro, which nothing shows; no sidebar lists it",
  'versioned_docs/version-10.x/landing-intro/Step3.md':
    "v10's copy of the home page's intro, which nothing shows; no sidebar lists it",
};

/**
 * The code of trpc.io's home page's intro (`src/components/QuickIntro.tsx`),
 * which no sidebar lists, by the file under `v11/home` the home page's v11
 * steps import it from.
 */
const homeSteps = [
  ['docs/landing-intro/Step1.md', 'step-1.md'],
  ['docs/landing-intro/Step2.md', 'step-2.md'],
  ['docs/landing-intro/Step3.md', 'step-3.md'],
] as const;

/** Where `old-docs.json` says each file went: the files written from it, or why none are. */
export type Manifest = Readonly<Record<string, ReadonlyArray<string> | string>>;

/**
 * Accounts for every file in `sources` (`contentDirs`' files): the files
 * `written` from it, by path under the site, or its reason in `notCopied`.
 * A file written from outside them (an image, a component) is listed too.
 */
export function manifestOf(opts: {
  readonly sources: ReadonlyArray<string>;
  readonly written: ReadonlyArray<readonly [from: string, to: string]>;
  readonly notCopied: Readonly<Record<string, string>>;
}) {
  const outputs = new Map<string, Set<string>>();
  for (const [from, to] of opts.written) {
    outputs.set(from, (outputs.get(from) ?? new Set()).add(to));
  }
  const sources = new Set(opts.sources);
  const problems: Array<string> = [];
  const entries = new Map<string, ReadonlyArray<string> | string>();
  for (const source of sources) {
    const written = outputs.get(source);
    const reason = opts.notCopied[source];
    if (written && reason !== undefined) {
      problems.push(`${source} is copied: take it out of \`notCopied\``);
    } else if (written) {
      entries.set(source, [...written].toSorted());
    } else if (reason !== undefined) {
      entries.set(source, reason);
    } else if (isPartial(source)) {
      entries.set(source, 'A partial no page includes');
    } else {
      const kind = source.startsWith('blog/')
        ? "isn't a post the copy reads (`blog/<yyyy-mm-dd>-<slug>.mdx`)"
        : /\.mdx?$/.test(source)
          ? 'is in no sidebar'
          : "isn't a page";
      problems.push(
        `${source} ${kind}: copy it, or say why not in \`notCopied\` in www/build/old-docs-copy.ts`,
      );
    }
  }
  for (const [from, written] of outputs) {
    if (!sources.has(from)) {
      entries.set(from, [...written].toSorted());
    }
  }
  for (const source of Object.keys(opts.notCopied)) {
    if (!sources.has(source)) {
      problems.push(`${source} isn't there: take it out of \`notCopied\``);
    }
  }
  // `toSorted()` compares code units, which, unlike `localeCompare`, don't
  // depend on the machine's locale.
  const manifest: Manifest = Object.fromEntries(
    [...entries.keys()]
      .toSorted()
      .map((file) => [file, entries.get(file) ?? ''] as const),
  );
  return { manifest, problems };
}

/**
 * The files under `dirs` in `www` that git lists, tracked or untracked but
 * not ignored, and that are on disk, as `/`-separated paths from `www`.
 */
const sourceFiles = Effect.fn('sourceFiles')(function* (
  www: string,
  dirs: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const listing = yield* spawner
    .string(
      ChildProcess.make(
        'git',
        [
          'ls-files',
          '--cached',
          '--others',
          '--exclude-standard',
          '-z',
          '--',
          ...dirs,
        ],
        { cwd: www },
      ),
    )
    .pipe(Effect.mapError(failWith('git ls-files')));
  const names = [
    ...new Set(listing.split('\0').filter((name) => name !== '')),
  ].toSorted();
  if (names.length === 0) {
    return yield* new OldDocsCopyError({
      message: `git lists no files under ${dirs.join(', ')} in ${www}`,
    });
  }
  return yield* Effect.filter(
    names,
    (name) => fs.exists(path.join(www, name)),
    { concurrency: 'unbounded' },
  );
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
  const listed = yield* sourceFiles(www, [
    ...contentDirs,
    'unversioned',
    'src/components',
  ]);
  const contentFiles = listed.filter((name) =>
    contentDirs.some((dir) => name.startsWith(`${dir}/`)),
  );
  const names = listed.filter((name) =>
    [
      /^(?:docs|versioned_docs)\/.+\.mdx?$/,
      /^unversioned\/[^/]+\.mdx$/,
      /^src\/components\/[^/]+\.tsx$/,
      /^blog\/(?:[^/]+\.mdx?|authors\.yml)$/,
    ].some((pattern) => pattern.test(name)),
  );
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
    contentFiles,
    versions,
  };
});

const readme = (
  version: CopiedVersion,
  from: string,
) => `# The ${version.id} docs

The ${version.id} docs, which the site serves at \`${version.basePath}\`. Edit them here.

\`www/build/old-docs-copy.ts\` converted them from trpc.io's Docusaurus docs (\`www/${from}\` before the move); \`www/old-docs.json\` says which file each page came from.
`;

const blogReadme = `# The blog

trpc.io's blog, which the site serves at \`/blog\`. Edit the posts here.

\`www/build/old-docs-copy.ts\` converted them from the Docusaurus blog (\`www/blog\` before the move); \`www/old-docs.json\` says which file each post came from.
`;

const homeReadme = `# The home page's v11 intro

The code of the home page's intro, which the home page shows for v11 (\`src/routes/index.tsx\`). Edit the steps here.

\`www/build/old-docs-copy.ts\` converted them from the Docusaurus home page's (\`www/docs/landing-intro\` before the move).
`;

/** Where each file under `contentDirs` went, under `CopyDirs.to`. */
const manifestFile = 'old-docs.json';

/**
 * trpc.io's own files in `static/`, which the site serves as they are at
 * the same URLs (`/img/logo-text-black.svg`, `/logos/Netflix.svg`), for
 * the sites and READMEs that link or embed them.
 */
export const staticDirs = ['img', 'logos'] as const;

export interface CopyDirs {
  /** The Docusaurus site: `www/` at a commit before the move. */
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
      inlined: result.inlined,
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
  const steps = homeSteps.map(([file, name]) => ({
    file,
    name,
    ...convertSnippet(file, docs),
  }));
  const stepProblems = steps.flatMap((entry) => entry.problems);
  if (stepProblems.length > 0) {
    return yield* new OldDocsCopyError({
      message: `The home page's intro has what the copy can't convert:\n${stepProblems.join('\n')}`,
    });
  }
  /** `to`, `/`-separated from `dirs.to`, as `old-docs.json` names it. */
  const sitePath = (to: string) =>
    path.relative(dirs.to, to).split(path.sep).join('/');
  const versions = read.versions.map((entry) => {
    const own = pages.filter((page) => page.page.version === entry.version.id);
    const imagesDir = path.join(dirs.images, entry.version.id, 'img');
    const images = [
      ...new Set([
        ...own.flatMap((page) => page.images),
        ...(entry.version.id === 'v11'
          ? posts.flatMap((post) => post.images)
          : []),
      ]),
    ].map((image) => ({
      from: image,
      to: path.join(imagesDir, path.basename(image)),
    }));
    return {
      ...entry,
      docsDir: path.join(dirs.to, entry.version.id, 'docs'),
      images,
      imagesDir,
      own,
    };
  });
  const blogDir = path.join(dirs.to, 'blog');
  /** Each written file and the page, post or image it's a copy of. */
  const copies: Array<readonly [from: string, to: string]> = [];
  /** Each partial or component, and the file it's inlined into. */
  const inlined: Array<readonly [from: string, to: string]> = [];
  for (const entry of versions) {
    for (const page of entry.own) {
      const to = sitePath(path.join(entry.docsDir, `${page.page.slug}.md`));
      copies.push([page.page.file, to]);
      inlined.push(...page.inlined.map((file) => [file, to] as const));
    }
    copies.push(
      ...entry.images.map((image) => [image.from, sitePath(image.to)] as const),
    );
  }
  for (const post of posts) {
    const to = sitePath(path.join(blogDir, `${post.post.slug}.md`));
    copies.push([post.post.file, to]);
    inlined.push(...post.inlined.map((file) => [file, to] as const));
  }
  const homeDir = path.join(dirs.to, 'v11', 'home');
  for (const step of steps) {
    const to = sitePath(path.join(homeDir, step.name));
    copies.push([step.file, to]);
    inlined.push(...step.inlined.map((file) => [file, to] as const));
  }
  const accounted = manifestOf({
    notCopied,
    sources: read.contentFiles,
    // A generated index has no file in `www/`.
    written: [...copies, ...inlined].filter(
      ([from]) => !from.startsWith('generated/'),
    ),
  });
  const copiedFrom = new Map<string, Array<string>>();
  for (const [from, to] of copies) {
    copiedFrom.set(to, [...(copiedFrom.get(to) ?? []), from]);
  }
  const collisions = [...copiedFrom]
    .filter(([, from]) => from.length > 1)
    .map(([to, from]) => `${from.join(' and ')} would both be ${to}`);
  const unaccounted = [...accounted.problems, ...collisions];
  if (unaccounted.length > 0) {
    return yield* new OldDocsCopyError({
      message: `The copy doesn't account for every file:\n${unaccounted.join('\n')}`,
    });
  }
  const report: Array<string> = [];
  for (const entry of versions) {
    const versionDir = path.join(dirs.to, entry.version.id);
    yield* fs.remove(entry.docsDir, { force: true, recursive: true });
    yield* fs.remove(entry.imagesDir, { force: true, recursive: true });
    yield* fs.makeDirectory(entry.imagesDir, { recursive: true });
    yield* Effect.forEach(entry.own, (page) => {
      const file = path.join(entry.docsDir, `${page.page.slug}.md`);
      return Effect.andThen(
        fs.makeDirectory(path.dirname(file), { recursive: true }),
        fs.writeFileString(file, page.markdown),
      );
    });
    yield* fs.writeFileString(
      path.join(entry.docsDir, 'README.md'),
      readme(entry.version, sources[entry.version.id].dir),
    );
    yield* fs.writeFileString(
      path.join(versionDir, 'sections.json'),
      `${JSON.stringify(entry.sections, null, 2)}\n`,
    );
    yield* Effect.forEach(entry.images, (image) =>
      fs.copyFile(path.join(dirs.from, image.from), image.to),
    );
    report.push(
      `Copied ${entry.own.length} ${entry.version.id} pages in ${entry.sections.length} sections, and ${entry.images.length} images.`,
    );
  }
  yield* fs.remove(blogDir, { force: true, recursive: true });
  yield* fs.makeDirectory(blogDir, { recursive: true });
  yield* Effect.forEach(posts, (entry) =>
    fs.writeFileString(
      path.join(blogDir, `${entry.post.slug}.md`),
      entry.markdown,
    ),
  );
  yield* fs.writeFileString(path.join(blogDir, 'README.md'), blogReadme);
  yield* fs.remove(homeDir, { force: true, recursive: true });
  yield* fs.makeDirectory(homeDir, { recursive: true });
  yield* Effect.forEach(steps, (step) =>
    fs.writeFileString(path.join(homeDir, step.name), step.markdown),
  );
  yield* fs.writeFileString(path.join(homeDir, 'README.md'), homeReadme);
  const staticFiles = yield* Effect.forEach(staticDirs, (dir) =>
    Effect.gen(function* () {
      const from = path.join(dirs.from, 'static', dir);
      const to = path.join(dirs.images, dir);
      yield* fs.remove(to, { force: true, recursive: true });
      yield* fs.makeDirectory(to, { recursive: true });
      const files = yield* fs.readDirectory(from);
      yield* Effect.forEach(files, (file) =>
        fs.copyFile(path.join(from, file), path.join(to, file)),
      );
      return files.length;
    }),
  );
  yield* fs.writeFileString(
    path.join(dirs.to, manifestFile),
    `${JSON.stringify(accounted.manifest, null, 2)}\n`,
  );
  // trpc.io's redirects, which `vercel-output.ts` keeps working here.
  // Vercel's `permanent` defaults to `true`.
  const redirects = docs.redirects.map((redirect) => ({
    destination: redirect.destination,
    permanent: redirect.permanent ?? true,
    source: redirect.source,
  }));
  yield* fs.writeFileString(
    path.join(dirs.to, redirectsFile),
    `${JSON.stringify(redirects, null, 2)}\n`,
  );
  report.push(
    `Copied ${posts.length} blog posts.`,
    `Copied the ${steps.length} steps of the home page's intro.`,
    `Copied ${staticFiles.reduce((sum, count) => sum + count, 0)} of its static files, from ${staticDirs.map((dir) => `static/${dir}`).join(' and ')}.`,
    `Accounted for ${Object.keys(accounted.manifest).length} files in ${manifestFile}.`,
    `Copied ${redirects.length} of trpc.io's redirects to ${redirectsFile}.`,
  );
  const dropped = [...pages, ...posts].flatMap((entry) => entry.dropped);
  return [
    ...report,
    ...(dropped.length > 0
      ? [
          `Dropped the #hash of ${dropped.length} links to headings that don't exist:`,
          ...dropped.map((link) => `  ${link}`),
        ]
      : []),
  ].join('\n');
});

/** What the copy replaces under `dirs`: each a dir or a file. */
function outputsOf(dirs: CopyDirs, path: Path.Path) {
  return [
    ...copiedVersions.flatMap((version) => [
      path.join(dirs.to, version.id, 'docs'),
      path.join(dirs.to, version.id, 'sections.json'),
      path.join(dirs.images, version.id, 'img'),
    ]),
    path.join(dirs.to, 'blog'),
    path.join(dirs.to, 'v11', 'home'),
    ...staticDirs.map((dir) => path.join(dirs.images, dir)),
    path.join(dirs.to, manifestFile),
    path.join(dirs.to, redirectsFile),
  ];
}

/** The files at `root`, by path from it (`''` when it's a file), or none when it isn't there. */
const filesAt = Effect.fn('filesAt')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  if (!(yield* fs.exists(root))) {
    return [];
  }
  if ((yield* fs.stat(root)).type !== 'Directory') {
    return [''];
  }
  const names = yield* fs.readDirectory(root, { recursive: true });
  return yield* Effect.filter(names.toSorted(), (name) =>
    Effect.map(fs.stat(path.join(root, name)), (info) => info.type === 'File'),
  );
});

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, index) => byte === b[index]);

/** How the copy's files under `committed` differ from the fresh ones under `fresh`, by path from `committed.to`. */
const differencesOf = Effect.fn('differencesOf')(function* (
  fresh: CopyDirs,
  committed: CopyDirs,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const pairs = outputsOf(committed, path).map(
    (output, index) => [output, outputsOf(fresh, path)[index] ?? ''] as const,
  );
  const differences: Array<string> = [];
  for (const [committedRoot, freshRoot] of pairs) {
    const want = new Set(yield* filesAt(freshRoot));
    const have = new Set(yield* filesAt(committedRoot));
    const name = (file: string) =>
      path.relative(committed.to, path.join(committedRoot, file));
    for (const file of want) {
      if (!have.has(file)) {
        differences.push(
          `${name(file)}: the copy writes it, and it isn't there`,
        );
        continue;
      }
      const same = sameBytes(
        yield* fs.readFile(path.join(freshRoot, file)),
        yield* fs.readFile(path.join(committedRoot, file)),
      );
      if (!same) {
        differences.push(`${name(file)}: the copy writes something else`);
      }
    }
    for (const file of have) {
      if (!want.has(file)) {
        differences.push(`${name(file)}: the copy doesn't write it`);
      }
    }
  }
  return differences.toSorted();
});

/**
 * Copies into a scratch dir and compares the result with the copies under
 * `dirs`, failing on any file that differs, is missing or is left over.
 */
export const checkOldDocs = Effect.fn('checkOldDocs')(function* (
  dirs: CopyDirs,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const scratch = yield* fs.makeTempDirectoryScoped({ prefix: 'old-docs-' });
  const fresh: CopyDirs = {
    from: dirs.from,
    images: path.join(scratch, path.relative(dirs.to, dirs.images)),
    to: scratch,
  };
  yield* copyOldDocs(fresh);
  const differences = yield* differencesOf(fresh, dirs);
  if (differences.length > 0) {
    return yield* new OldDocsCopyError({
      message: [
        `The copies in ${dirs.to} aren't what the copy writes from ${dirs.from}:`,
        ...differences.map((difference) => `  ${difference}`),
        'Copying again (without `--check`) writes what the copy writes.',
      ].join('\n'),
    });
  }
  return `The copies are what the copy writes from ${dirs.from}.`;
}, Effect.scoped);

if (import.meta.main) {
  const here = (relative: string) =>
    fileURLToPath(new URL(relative, import.meta.url));
  const dirs: CopyDirs = {
    from: process.env['OLD_WWW'] ?? here('../../old-www'),
    images: here('../public'),
    to: here('..'),
  };
  const command = Command.make(
    'old-docs-copy',
    {
      check: Flag.Boolean('check').pipe(
        Flag.withDescription(
          'Fail when the committed copies differ from what the copy writes, writing nothing',
        ),
        Flag.withDefault(false),
      ),
    },
    (opts) =>
      Effect.flatMap(
        opts.check ? checkOldDocs(dirs) : copyOldDocs(dirs),
        Console.log,
      ),
  ).pipe(
    Command.withDescription(
      "Copy trpc.io's v11, v10 and v9 docs and its blog into the site",
    ),
  );
  Command.run(command, { version: '0.0.0' }).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
