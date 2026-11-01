import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Path, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { removeTwoslashNotations } from 'twoslash/fallback';
import type { Connect, Plugin } from 'vite';
import { parse as parseYaml } from 'yaml';

import { stripInlineCode } from '../src/content/inline-code.ts';
import type { Doc, DocMeta, DocSection, Sample } from '../src/content/types.ts';
import { experimentIds, experiments } from '../src/experiments.ts';
import { llmsFullTxtPath } from '../src/site.ts';
import { chartMarkdown, decodeChart } from './charts.ts';
import { stripCollapseMarkers } from './collapse.ts';
import { ContentError, messageOf } from './content-error.ts';
import { type DocLink, releaseTwoslashers, resolveLink } from './markdown.ts';
import { closeRenderPool, makePageRenderer } from './page-renderer.ts';
import { expandSnippets } from './snippets.ts';
import type { TwoslashCacheOptions } from './twoslash-cache.ts';

export interface ContentDirs {
  /** Directory of the `.md` pages, as an absolute path. */
  readonly contentDir: string;
  /** Directory of the sample apps the pages' code blocks compile in. */
  readonly samplesDir: string;
}

export interface PageDirs extends ContentDirs {
  /** Where the pages are served: `/docs` serves `client/links` at `/docs/client/links`. */
  readonly basePath: string;
  /**
   * Whether a page's last-modified date skips the commits that renamed it, so
   * a moved page keeps its date. Not for copies: following their renames
   * reaches the history they were copied from.
   */
  readonly datesSkipRenames?: boolean | undefined;
}

/** The files `docsContent` writes for agents. */
export interface AgentFiles {
  /**
   * Where `llms.txt` (https://llmstxt.org) lists the pages: `/llms.txt`,
   * `/llms-v10.txt`. Its `-full` twin, every page in one file, is beside
   * it. At `/llms.txt`, the home page's markdown (`/index.md`) and the
   * markdown 404 (`/404.md`) come with it.
   */
  readonly llmsTxt: string;
  /**
   * Whether each page is markdown too, at `<basePath>/<slug>.md`, which
   * `llms.txt` links; or else it links the pages, as trpc.io's do.
   */
  readonly markdown: boolean;
  /** Its heading: `tRPC v10`. `tRPC` if omitted. */
  readonly name?: string;
  /** The other versions' `llms.txt`, listed at the top: `v10` at `/llms-v10.txt`. */
  readonly others?: ReadonlyArray<{
    readonly name: string;
    readonly path: string;
  }>;
}

export interface ContentOptions extends PageDirs {
  /**
   * The files the build writes for agents, which the dev server serves;
   * none if `undefined`.
   */
  readonly agentFiles: AgentFiles | undefined;
  /** The module that lists the pages: `virtual:docs-manifest`. */
  readonly manifestId: string;
  /** Sidebar sections, in order. Every page's `section` must be one of them. */
  readonly sections: ReadonlyArray<string>;
  /** Absolute site URL, for `llms.txt` and the markdown pages. */
  readonly siteUrl: string;
  /** Where the files around `contentDir` are browsable, for links to them. */
  readonly sourceUrl: string;
  /** `contentDir`'s path under `sourceUrl` (`www/docs`), which links out of it resolve from: `docs` unless named. */
  readonly contentPath?: string | undefined;
  /** What the project is, one line, for `llms.txt`. */
  readonly summary: string;
  /**
   * Markdown without frontmatter that code outside the pages imports, as a
   * `sample:` import's `{ html }`: `import step from '…/v11/home/step-1.md'`.
   */
  readonly snippetsDir?: string | undefined;
  /** The sample app the pages' inline code blocks compile in: `docs` unless named. */
  readonly inlineApp?: string | undefined;
  /** Keeps compiled code blocks on disk, so the next build reuses them. */
  readonly twoslashCache?: TwoslashCacheOptions | undefined;
  /**
   * The v11 pages, for a link from each page to the v11 page on its topic:
   * the one its `v11` frontmatter names, or else the one at its slug.
   */
  readonly v11Dir?: string | undefined;
}

/** The `Accept` header agents send to get markdown instead of HTML. */
const acceptsMarkdown = /\btext\/markdown\b/;

const Frontmatter = Schema.Struct({
  description: Schema.String,
  /**
   * The experiment the page belongs to (`src/experiments.ts`). Built and
   * served at its URL, in the sitemap and `llms.txt`, but out of the
   * sidebar, search and pagination until the reader turns it on.
   */
  experiment: Schema.optional(Schema.Literals(experimentIds)),
  label: Schema.optional(Schema.String),
  order: Schema.Number,
  /** The page it nests under in the sidebar, by slug, in the same section. */
  parent: Schema.optional(Schema.String),
  section: Schema.String,
  /**
   * `unstable` for a page about `unstable_` exports: listed and indexed like
   * any other, with an "Unstable" badge. Experimental features are hidden
   * with `experiment` instead.
   */
  stability: Schema.optional(Schema.Literal('unstable')),
  title: Schema.String,
  v11: Schema.optional(Schema.String),
});

type Frontmatter = typeof Frontmatter.Type;

const decodeFrontmatter = Schema.decodeUnknownEffect(Frontmatter);

interface Source {
  readonly file: string;
  readonly frontmatter: Frontmatter;
  /** With `sample` fences expanded into `twoslash` blocks. */
  readonly markdown: string;
  readonly slug: string;
  /** The files the page includes. */
  readonly snippets: ReadonlyArray<string>;
}

interface Rendered {
  /** Every heading's id, which links can point at. */
  readonly anchors: ReadonlyArray<string>;
  readonly doc: Doc;
  readonly links: ReadonlyArray<DocLink>;
  /** Each `twoslash` block's `// ^?` types, for the page's markdown. */
  readonly typeQueries: ReadonlyArray<ReadonlyArray<string>>;
}

/** Replaces each `// ^?` in a Twoslash block with the type it shows, as a comment. */
function withTypes(code: string, types: ReadonlyArray<string>) {
  let index = 0;
  return code.replaceAll(/^([ \t]*)\/\/\s*\^\?[ \t]*$/gm, (_marker, indent) => {
    const type = types[index] ?? '';
    index++;
    return type
      .split('\n')
      .map((line) => `${indent}// ${line}`)
      .join('\n');
  });
}

/**
 * `import hero from "sample:<app>/<path>#region"` renders that region of a
 * sample app's file, as a `sample` fence does, for code outside the pages.
 */
const samplePrefix = 'sample:';
const resolvedSamplePrefix = `\0${samplePrefix}`;

/** `client/links` for `<contentDir>/client/links.md`. */
function slugOf(path: Path.Path, contentDir: string, file: string) {
  return path
    .relative(contentDir, file)
    .split(path.sep)
    .join('/')
    .replace(/\.md$/, '');
}

const parseSource = Effect.fn('parseSource')(function* (
  dirs: ContentDirs,
  file: string,
  raw: string,
) {
  const path = yield* Path.Path;
  const match = /^---\n([\s\S]*?)\n---\n/.exec(raw);
  if (!match?.[1]) {
    return yield* new ContentError({ message: `${file}: missing frontmatter` });
  }
  const yaml = match[1];
  const frontmatter = yield* Effect.try(() => parseYaml(yaml)).pipe(
    Effect.flatMap(decodeFrontmatter),
    Effect.mapError(
      (cause) =>
        new ContentError({
          cause,
          message: `${file}: invalid frontmatter: ${messageOf(cause)}`,
        }),
    ),
  );
  const expanded = yield* expandSnippets(raw.slice(match[0].length), {
    file,
    samplesDir: dirs.samplesDir,
  });
  const source: Source = {
    file,
    frontmatter,
    markdown: expanded.markdown,
    slug: slugOf(path, dirs.contentDir, file),
    snippets: expanded.files,
  };
  return source;
});

/**
 * When each committed file under `dir` last changed in git, by absolute path.
 * One `git log` for the dir, as starting a process per page from the build's
 * large one took seconds. With `skipRenames`, a rename doesn't count, even
 * with edits: a file's date is its last add or edit under any of its names,
 * as `git log -1 --follow --diff-filter=AM` gives it.
 */
const commitDates = Effect.fn('commitDates')(
  function* (dir: string, skipRenames = false) {
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const git = (args: ReadonlyArray<string>) =>
      spawner.string(
        ChildProcess.make('git', ['-c', 'core.quotePath=false', ...args], {
          cwd: dir,
          stderr: 'ignore',
        }),
      );
    const dates = new Map<string, string>();
    if (!skipRenames) {
      const log = yield* git([
        'log',
        '--format=%x00%cI',
        '--name-only',
        '--relative',
        '--',
        '.',
      ]);
      // Newest first, so a file's first commit is its last change.
      for (const commit of log.split('\0').slice(1)) {
        const [date = '', ...files] = commit.split('\n');
        for (const file of files) {
          const absolute = path.join(dir, file);
          if (file !== '' && !dates.has(absolute)) {
            dates.set(absolute, date);
          }
        }
      }
      return dates as ReadonlyMap<string, string>;
    }
    const [root, files, log] = yield* Effect.all(
      [
        git(['rev-parse', '--show-toplevel']),
        git(['ls-files', '--full-name', '-z']),
        // The whole repo's, as a page may have moved in from outside `dir`.
        git(['log', '-M', '--format=%x00%cI', '--name-status']),
      ],
      { concurrency: 'unbounded' },
    );
    // The name each file had at the commit being read, to the files.
    const pending = new Map<string, Array<string>>();
    for (const file of files.split('\0')) {
      if (file !== '') {
        pending.set(file, [path.join(root.trim(), file)]);
      }
    }
    for (const commit of log.split('\0').slice(1)) {
      if (pending.size === 0) {
        break;
      }
      const [date = '', ...lines] = commit.split('\n');
      const renamed: Array<readonly [string, Array<string>]> = [];
      for (const line of lines) {
        const [status = '', from = '', to = from] = line.split('\t');
        const targets = pending.get(to);
        if (targets === undefined) {
          continue;
        }
        if (status.startsWith('R')) {
          pending.delete(to);
          renamed.push([from, targets]);
        } else if (status === 'A' || status === 'M') {
          pending.delete(to);
          for (const target of targets) {
            dates.set(target, date);
          }
        }
      }
      for (const [from, targets] of renamed) {
        pending.set(from, [...(pending.get(from) ?? []), ...targets]);
      }
    }
    return dates as ReadonlyMap<string, string>;
  },
  Effect.orElseSucceed((): ReadonlyMap<string, string> => new Map()),
);

/** Every page: `**\/*.md` under the content dir, except `README.md` files, which index the folder on GitHub. */
const readSources = Effect.fn('readSources')(function* (dirs: ContentDirs) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const names = yield* fs.glob('**/*.md', { root: dirs.contentDir });
  return yield* Effect.forEach(
    names.filter((name) => path.basename(name) !== 'README.md').toSorted(),
    (name) => {
      const file = path.join(dirs.contentDir, name);
      return Effect.flatMap(fs.readFileString(file), (raw) =>
        parseSource(dirs, file, raw),
      );
    },
    { concurrency: 'unbounded' },
  );
});

/** Pages for prerendering, the sitemap and their social cards. */
export const docPages = Effect.fn('docPages')(function* (dirs: PageDirs) {
  const [sources, dates] = yield* Effect.all(
    [readSources(dirs), commitDates(dirs.contentDir, dirs.datesSkipRenames)],
    { concurrency: 'unbounded' },
  );
  return sources.map((source) => ({
    description: source.frontmatter.description,
    experiment: source.frontmatter.experiment,
    lastModified: dates.get(source.file),
    path: `${dirs.basePath}/${source.slug}`,
    section: source.frontmatter.section,
    title: source.frontmatter.title,
  }));
});

/** Runs a build step from one of Vite's hooks. */
function run<A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) {
  return Effect.runPromise(Effect.provide(effect, NodeServices.layer));
}

interface NavEntry {
  readonly order: number;
  readonly parent?: string | undefined;
  readonly section: string;
  readonly slug: string;
}

/**
 * The pages in reading order, which is the sidebar's: by `order`, each one
 * followed by the pages nested under it. Throws on a `parent` that isn't a
 * page of the same section, and on parents that form a cycle.
 */
export function readingOrder<A extends NavEntry>(
  entries: ReadonlyArray<A>,
): ReadonlyArray<A> {
  const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  const children = new Map<string | undefined, Array<A>>();
  for (const entry of entries) {
    if (entry.parent !== undefined) {
      const parent = bySlug.get(entry.parent);
      if (!parent) {
        throw new Error(`${entry.slug}: parent ${entry.parent} isn't a page`);
      }
      if (parent.section !== entry.section) {
        throw new Error(
          `${entry.slug}: parent ${entry.parent} is in section "${parent.section}", not "${entry.section}"`,
        );
      }
    }
    children.set(entry.parent, [...(children.get(entry.parent) ?? []), entry]);
  }
  const ordered: Array<A> = [];
  const visit = (parent: string | undefined) => {
    const siblings = (children.get(parent) ?? []).toSorted(
      (a, b) => a.order - b.order || a.slug.localeCompare(b.slug),
    );
    for (const entry of siblings) {
      ordered.push(entry);
      visit(entry.slug);
    }
  };
  visit(undefined);
  const unreached = entries.filter((entry) => !ordered.includes(entry));
  if (unreached.length > 0) {
    throw new Error(
      `Pages whose parents form a cycle: ${unreached.map((entry) => entry.slug).join(', ')}`,
    );
  }
  return ordered;
}

/** Links to a page or a heading that doesn't exist, as one message per link. */
export function brokenLinks(
  pages: ReadonlyArray<{
    readonly anchors: ReadonlyArray<string>;
    readonly doc: Pick<DocMeta, 'slug'>;
    readonly links: ReadonlyArray<DocLink>;
  }>,
) {
  const bySlug = new Map(pages.map((page) => [page.doc.slug, page]));
  return pages.flatMap((page) =>
    page.links.flatMap((link) => {
      const target = bySlug.get(link.slug);
      if (!target) {
        return [
          `${page.doc.slug}: links to ${link.slug}.md, which isn't a page`,
        ];
      }
      if (link.hash !== undefined && !target.anchors.includes(link.hash)) {
        return [
          `${page.doc.slug}: links to ${link.slug}.md#${link.hash}, which has no such heading`,
        ];
      }
      return [];
    }),
  );
}

/**
 * A listed page that leads to an experiment's page, as one message each: a
 * link to it, or nesting under it in the sidebar. Experiments' pages may
 * link anywhere.
 */
export function experimentPageProblems(
  pages: ReadonlyArray<{
    readonly doc: Pick<DocMeta, 'experiment' | 'parent' | 'slug'>;
    readonly links: ReadonlyArray<DocLink>;
  }>,
) {
  const experimentOf = new Map(
    pages.flatMap((page) =>
      page.doc.experiment === undefined
        ? []
        : [[page.doc.slug, page.doc.experiment] as const],
    ),
  );
  return pages.flatMap((page) =>
    page.doc.experiment !== undefined
      ? []
      : [
          ...(page.doc.parent !== undefined && experimentOf.has(page.doc.parent)
            ? [
                `${page.doc.slug}: nests under ${page.doc.parent}, which is in the ${experimentOf.get(page.doc.parent)} experiment`,
              ]
            : []),
          ...[...new Set(page.links.map((link) => link.slug))]
            .filter((slug) => experimentOf.has(slug))
            .map(
              (slug) =>
                `${page.doc.slug}: links to ${slug}.md, which is in the ${experimentOf.get(slug)} experiment`,
            ),
        ],
  );
}

/**
 * Compiles the docs' `.md` pages at build time. Each page imports as a module
 * of pre-highlighted HTML (its own chunk, so the browser loads only the pages
 * it visits), and the manifest module (`virtual:docs-manifest`) lists every
 * page for the nav, search and SEO. With `agentFiles`, the client build also
 * gets an `llms.txt`, and each page's markdown at `<basePath>/<slug>.md`.
 *
 * The build fails on a page without valid frontmatter, a code block that
 * doesn't compile, a link to a page or heading that doesn't exist, and a
 * listed page that leads to an experiment's page.
 */
export function docsContent(options: ContentOptions): Plugin {
  const samplesDir = options.samplesDir;
  const basePath = options.basePath;
  const manifestId = options.manifestId;
  const resolvedManifestId = `\0${manifestId}`;
  const renderer = makePageRenderer(options.twoslashCache);
  const rendered = new Map<string, Promise<Rendered>>();
  /** The pages' commit dates, read again after an edit, as the pages are. */
  let commits: Promise<ReadonlyMap<string, string>> | undefined;
  const lastModifiedDates = () => {
    commits ??= run(commitDates(options.contentDir, options.datesSkipRenames));
    return commits;
  };
  const renderOn = renderer.render;

  /** The v11 page on the same topic as `source`. */
  const v11Page = Effect.fn('v11Page')(function* (source: Source) {
    if (options.v11Dir === undefined) {
      return undefined;
    }
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const named = source.frontmatter.v11;
    const slug = named ?? source.slug;
    const file = path.join(options.v11Dir, `${slug}.md`);
    if (yield* fs.exists(file)) {
      return slug;
    }
    if (named !== undefined) {
      return yield* new ContentError({
        message: `${source.file}: v11: ${named} isn't a page in ${options.v11Dir}`,
      });
    }
    return undefined;
  });

  const renderDoc = Effect.fn('renderDoc')(function* (source: Source) {
    const result = yield* renderOn(source.markdown, {
      basePath,
      inlineApp: options.inlineApp,
      samplesDir,
      slug: source.slug,
      contentPath: options.contentPath,
      sourceUrl: options.sourceUrl,
    }).pipe(
      Effect.mapError(
        (error) =>
          new ContentError({
            cause: error,
            message: `${source.file}: ${error.message}`,
          }),
      ),
    );
    const page: Rendered = {
      anchors: result.anchors,
      doc: {
        description: source.frontmatter.description,
        experiment: source.frontmatter.experiment,
        headings: result.headings,
        html: result.html,
        label: source.frontmatter.label,
        lastModified: (yield* Effect.promise(lastModifiedDates)).get(
          source.file,
        ),
        parent: source.frontmatter.parent,
        section: source.frontmatter.section,
        slug: source.slug,
        stability: source.frontmatter.stability,
        title: source.frontmatter.title,
        v11: yield* v11Page(source),
      },
      links: result.links,
      typeQueries: result.typeQueries,
    };
    return page;
  });

  const renderSample = Effect.fn('renderSample')(function* (spec: string) {
    const file = `${samplePrefix}${spec}`;
    const expanded = yield* expandSnippets(`\`\`\`sample\n${spec}\n\`\`\``, {
      file,
      samplesDir,
    });
    const result = yield* renderOn(expanded.markdown, {
      basePath,
      samplesDir,
      slug: 'index',
      contentPath: options.contentPath,
      sourceUrl: options.sourceUrl,
    }).pipe(
      Effect.mapError(
        (error) =>
          new ContentError({
            cause: error,
            message: `${file}: ${error.message}`,
          }),
      ),
    );
    const sample: Sample = { html: result.html };
    return { files: expanded.files, sample };
  });

  const renderSnippet = Effect.fn('renderSnippet')(function* (
    file: string,
    markdown: string,
  ) {
    const result = yield* renderOn(markdown, {
      basePath,
      inlineApp: options.inlineApp,
      samplesDir,
      slug: 'index',
      contentPath: options.contentPath,
      sourceUrl: options.sourceUrl,
    }).pipe(
      Effect.mapError(
        (error) =>
          new ContentError({
            cause: error,
            message: `${file}: ${error.message}`,
          }),
      ),
    );
    const sample: Sample = { html: result.html };
    return sample;
  });

  function render(source: Source): Promise<Rendered> {
    const cached = rendered.get(source.file);
    if (cached) {
      return cached;
    }
    const page = run(renderDoc(source));
    rendered.set(source.file, page);
    return page;
  }

  async function manifest(): Promise<ReadonlyArray<DocSection>> {
    const sources = await run(readSources(options));
    for (const source of sources) {
      if (!options.sections.includes(source.frontmatter.section)) {
        throw new Error(
          `${source.file}: section "${source.frontmatter.section}" isn't one of ${options.sections.join(', ')}`,
        );
      }
    }
    const pages = await Promise.all(
      sources.map(async (source) => ({
        order: source.frontmatter.order,
        page: await render(source),
      })),
    );
    const broken = brokenLinks(pages.map((entry) => entry.page));
    if (broken.length > 0) {
      throw new Error(`Broken links in the docs:\n${broken.join('\n')}`);
    }
    const leaks = experimentPageProblems(pages.map((entry) => entry.page));
    if (leaks.length > 0) {
      throw new Error(
        `Listed pages that lead to experiments' pages (add an \`experiment\` or drop the link):\n${leaks.join('\n')}`,
      );
    }
    const ordered = readingOrder(
      pages.map((entry) => ({
        order: entry.order,
        parent: entry.page.doc.parent,
        section: entry.page.doc.section,
        slug: entry.page.doc.slug,
      })),
    );
    const bySlug = new Map(pages.map((entry) => [entry.page.doc.slug, entry]));
    return options.sections.map((title) => ({
      docs: ordered
        .filter((entry) => entry.section === title)
        .map((entry): DocMeta => {
          // SAFETY: `readingOrder` only returns the slugs it was given.
          const doc = bySlug.get(entry.slug)!.page.doc;
          return {
            description: doc.description,
            experiment: doc.experiment,
            headings: doc.headings,
            label: doc.label,
            lastModified: doc.lastModified,
            parent: doc.parent,
            section: doc.section,
            slug: doc.slug,
            stability: doc.stability,
            title: doc.title,
            v11: doc.v11,
          };
        }),
      title,
    }));
  }

  const intro = [
    `# ${options.agentFiles?.name ?? 'tRPC'}`,
    '',
    `> ${options.summary}`,
    '',
  ];

  const agent = options.agentFiles;
  /** A page's URL for agents: its markdown, if it has one. */
  const pageUrl = (slug: string, hash = '') =>
    `${options.siteUrl}${basePath}/${slug}${agent?.markdown === true ? '.md' : ''}${hash ? `#${hash}` : ''}`;

  /**
   * A page as agents read it: links point at the other pages' markdown,
   * and `twoslash` blocks lose their hidden setup and markers, with each
   * `// ^?` replaced by the type it shows on the web.
   */
  function pageMarkdown(source: Source, page: Rendered) {
    let blockIndex = 0;
    const body = stripCollapseMarkers(source.markdown)
      .replaceAll(
        /^```(\w+)([^\n]*)\btwoslash\b([^\n]*)\n([\s\S]*?)^```$/gm,
        (_fence, lang, before, after, code) => {
          const queries = page.typeQueries[blockIndex] ?? [];
          blockIndex++;
          return `\`\`\`${lang}${`${before.trimEnd()}${after}`.trimEnd()}\n${removeTwoslashNotations(withTypes(code, queries))}\`\`\``;
        },
      )
      .replaceAll(/^```chart\n([\s\S]*?)\n```$/gm, (_fence, json: string) =>
        // `renderDoc` decoded the fence already.
        chartMarkdown(decodeChart(json)),
      )
      .replaceAll(/\]\(([^)\s]+)\)/g, (link, url: string) => {
        const resolved = resolveLink(source.slug, url, options.contentPath);
        if (resolved.kind === 'doc') {
          return `](${pageUrl(resolved.link.slug, resolved.link.hash)})`;
        }
        if (resolved.kind === 'source') {
          return `](${options.sourceUrl}/${resolved.path})`;
        }
        return link;
      });
    const experiment = source.frontmatter.experiment;
    return [
      `# ${stripInlineCode(source.frontmatter.title)}`,
      '',
      `> ${stripInlineCode(source.frontmatter.description)}`,
      '',
      ...(experiment === undefined
        ? []
        : [
            `Experimental: ${experiments[experiment].label} might change or go away in any release.`,
            '',
          ]),
      body.trim(),
      '',
    ].join('\n');
  }

  /** `llms.txt` (https://llmstxt.org): what the library is, and every page. */
  function llmsTxt(files: AgentFiles, sections: ReadonlyArray<DocSection>) {
    const others = files.others ?? [];
    const lines = [
      ...intro,
      ...(files.markdown
        ? [
            'Every page is also markdown: add `.md` to its URL, or request it with `Accept: text/markdown`.',
            '',
          ]
        : []),
      ...(others.length === 0
        ? []
        : [
            ...others.map(
              (other) => `- For ${other.name}: ${options.siteUrl}${other.path}`,
            ),
            '',
          ]),
    ];
    for (const section of sections) {
      lines.push(`## ${section.title}`, '');
      const parents = new Map(
        section.docs.map((doc) => [doc.slug, doc.parent]),
      );
      const depth = (slug: string | undefined): number => {
        const parent = slug === undefined ? undefined : parents.get(slug);
        return parent === undefined ? 0 : 1 + depth(parent);
      };
      for (const doc of section.docs) {
        const about = `${doc.experiment === undefined ? '' : 'Experimental. '}${stripInlineCode(doc.description)}`;
        lines.push(
          `${'  '.repeat(depth(doc.slug))}- [${stripInlineCode(doc.title)}](${pageUrl(doc.slug)})${about === '' ? '' : `: ${about}`}`,
        );
      }
      lines.push('');
    }
    lines.push(
      '## Optional',
      '',
      `- [Full documentation](${options.siteUrl}${llmsFullTxtPath(files.llmsTxt)}): every page above in one file`,
      '',
    );
    return lines.join('\n');
  }

  /**
   * Files for agents, by URL path: `llms.txt`, `llms-full.txt`, each page's
   * markdown at `<basePath>/<slug>.md`, and at `/llms.txt`, `/index.md`
   * (the home page's markdown, the same as `llms.txt`) and `/404.md`. An
   * experiment's page is in them like any other, marked experimental.
   */
  async function agentFiles(files: AgentFiles) {
    const sections = await manifest();
    const sources = new Map(
      (await run(readSources(options))).map((source) => [source.slug, source]),
    );
    const pages = await Promise.all(
      sections
        .flatMap((section) => section.docs)
        .flatMap((doc) => {
          const source = sources.get(doc.slug);
          return source ? [source] : [];
        })
        .map(async (source) => ({ page: await render(source), source })),
    );
    const written = new Map<string, string>();
    const list = llmsTxt(files, sections);
    written.set(files.llmsTxt, list);
    if (files.llmsTxt === '/llms.txt') {
      written.set('/index.md', list);
      written.set(
        '/404.md',
        `# Not found\n\nThere is no page at this URL. [llms.txt](${options.siteUrl}/llms.txt) lists every page.\n`,
      );
    }
    written.set(
      llmsFullTxtPath(files.llmsTxt),
      [
        ...intro,
        ...pages.map(
          (entry) =>
            `---\n\nSource: ${options.siteUrl}${basePath}/${entry.source.slug}\n\n${pageMarkdown(entry.source, entry.page)}`,
        ),
      ].join('\n'),
    );
    if (files.markdown) {
      for (const entry of pages) {
        written.set(
          `${basePath}/${entry.source.slug}.md`,
          pageMarkdown(entry.source, entry.page),
        );
      }
    }
    return written;
  }

  /**
   * The dev and preview servers answer agents like a static host with
   * content negotiation would: agent files at their paths, and a page's
   * markdown at the page's own URL for `Accept: text/markdown`.
   */
  function serveAgentFiles(server: { readonly middlewares: Connect.Server }) {
    if (agent === undefined) {
      return;
    }
    const pagePath = new RegExp(
      agent.markdown ? `^(?:${basePath}/[\\w/-]+)?$` : '^$',
    );
    server.middlewares.use((request, response, next) => {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      const wantsMarkdown = acceptsMarkdown.test(request.headers.accept ?? '');
      const filePath =
        wantsMarkdown && (pathname === '/' || pagePath.test(pathname))
          ? `${pathname === '/' ? '/index' : pathname}.md`
          : pathname;
      if (!/\.(?:md|txt)$/.test(filePath) || filePath === '/robots.txt') {
        next();
        return;
      }
      agentFiles(agent).then((files) => {
        const file = files.get(filePath) ?? files.get('/404.md');
        if (file === undefined || (!wantsMarkdown && !files.has(filePath))) {
          next();
          return;
        }
        response.statusCode = files.has(filePath) ? 200 : 404;
        response.setHeader(
          'Content-Type',
          filePath.endsWith('.md')
            ? 'text/markdown; charset=utf-8'
            : 'text/plain; charset=utf-8',
        );
        response.setHeader('Vary', 'Accept');
        response.end(file);
      }, next);
    });
  }

  return {
    configResolved: renderer.configResolved,
    configurePreviewServer: serveAgentFiles,
    configureServer: serveAgentFiles,
    // Before the chunks render, which is most of a build's memory.
    buildEnd: closeRenderPool,
    async generateBundle() {
      releaseTwoslashers();
      if (this.environment.name !== 'client') {
        return;
      }
      for (const [urlPath, source] of agent === undefined
        ? []
        : await agentFiles(agent)) {
        this.emitFile({ fileName: urlPath.slice(1), source, type: 'asset' });
      }
      if (renderer.stats) {
        this.environment.logger.info(
          `twoslash: ${renderer.stats.hits} code blocks from the cache, ${renderer.stats.misses} compiled`,
        );
      }
    },
    hotUpdate(context) {
      if (
        !context.file.startsWith(options.contentDir) &&
        !context.file.startsWith(samplesDir)
      ) {
        return undefined;
      }
      if (context.file.startsWith(samplesDir)) {
        // Every block compiles with the sample apps' files.
        rendered.clear();
      } else {
        rendered.delete(context.file);
        commits = undefined;
      }
      const graph = this.environment.moduleGraph;
      const stale = [...graph.idToModuleMap].flatMap(([id, module]) =>
        id === resolvedManifestId ||
        (context.file.startsWith(samplesDir) &&
          (id.startsWith(resolvedSamplePrefix) ||
            id.startsWith(options.contentDir)))
          ? [module]
          : [],
      );
      for (const module of stale) {
        graph.invalidateModule(module);
      }
      return stale.length > 0 ? [...context.modules, ...stale] : undefined;
    },
    async load(id) {
      if (id.startsWith(resolvedSamplePrefix)) {
        const output = await run(
          renderSample(id.slice(resolvedSamplePrefix.length)),
        );
        for (const file of output.files) {
          this.addWatchFile(file);
        }
        return `export default ${JSON.stringify(output.sample)};`;
      }
      if (id !== resolvedManifestId) {
        return undefined;
      }
      const sections = await manifest();
      return `export const sections = ${JSON.stringify(sections)};`;
    },
    name: `trpc-docs:content:${manifestId}`,
    resolveId(id) {
      if (id.startsWith(samplePrefix)) {
        return `\0${id}`;
      }
      return id === manifestId ? resolvedManifestId : undefined;
    },
    // One plugin instance across client/SSR so `rendered` is shared; without
    // this each environment re-runs Twoslash for every page.
    sharedDuringBuild: true,
    async transform(code, id) {
      const file = id.split('?')[0] ?? id;
      if (
        options.snippetsDir !== undefined &&
        file.startsWith(`${options.snippetsDir}/`) &&
        file.endsWith('.md')
      ) {
        const sample = await run(renderSnippet(file, code));
        return { code: `export default ${JSON.stringify(sample)};`, map: null };
      }
      if (!file.startsWith(options.contentDir) || !file.endsWith('.md')) {
        return undefined;
      }
      const source = await run(parseSource(options, file, code));
      for (const snippet of source.snippets) {
        this.addWatchFile(snippet);
      }
      // Drop the cache only in dev: during build, client and SSR both
      // transform the same files and must reuse the shared render.
      if (this.environment.mode === 'dev') {
        rendered.delete(file);
      }
      const page = await render(source);
      return { code: `export default ${JSON.stringify(page.doc)};`, map: null };
    },
  };
}
