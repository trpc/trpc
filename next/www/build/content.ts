import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Path, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { removeTwoslashNotations } from 'twoslash/fallback';
import type { Connect, Plugin } from 'vite';
import { parse as parseYaml } from 'yaml';

import { stripInlineCode } from '../src/content/inline-code.ts';
import type { Doc, DocMeta, DocSection, Sample } from '../src/content/types.ts';
import { experimentIds, experiments } from '../src/experiments.ts';
import { demoIds, demos, isDemoId } from '../src/kitchen-sink/demos.ts';
import { stripCollapseMarkers } from './collapse.ts';
import { ContentError, messageOf } from './content-error.ts';
import {
  type DocLink,
  releaseTwoslashers,
  renderMarkdown,
  resolveLink,
} from './markdown.ts';
import { expandSnippets } from './snippets.ts';
import {
  makeTwoslashCache,
  type TwoslashCacheOptions,
} from './twoslash-cache.ts';

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

export interface ContentOptions extends PageDirs {
  /**
   * Whether the build writes `llms.txt`, `llms-full.txt` and each page's
   * markdown, and the dev server serves them.
   */
  readonly agentFiles: boolean;
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
   * served at its URL and in `llms.txt`, but `noindex`, out of the sitemap,
   * and out of the sidebar, search and pagination until the reader turns it
   * on.
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
 * When `file` last changed in git, if it's committed. With `skipRenames`, a
 * rename doesn't count, even with edits.
 */
const lastModified = Effect.fn('lastModified')(
  function* (file: string, skipRenames = false) {
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const renames = skipRenames ? ['--follow', '--diff-filter=AM'] : [];
    const date = yield* spawner.string(
      ChildProcess.make(
        'git',
        ['log', '-1', ...renames, '--format=%cI', '--', file],
        { cwd: path.dirname(file), stderr: 'ignore' },
      ),
    );
    return date.trim() || undefined;
  },
  Effect.orElseSucceed(() => undefined),
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
  return yield* Effect.forEach(
    yield* readSources(dirs),
    (source) =>
      Effect.map(lastModified(source.file, dirs.datesSkipRenames), (date) => ({
        description: source.frontmatter.description,
        experiment: source.frontmatter.experiment,
        lastModified: date,
        path: `${dirs.basePath}/${source.slug}`,
        section: source.frontmatter.section,
        title: source.frontmatter.title,
      })),
    { concurrency: 'unbounded' },
  );
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
 * gets `llms.txt` and each page's markdown at `<basePath>/<slug>.md`.
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
  const twoslashCache =
    options.twoslashCache && makeTwoslashCache(options.twoslashCache);
  const rendered = new Map<string, Promise<Rendered>>();

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

  /** The page's demo: one at most, since it runs beside the whole page. */
  const demoOf = Effect.fn('demoOf')(function* (
    source: Source,
    ids: ReadonlyArray<string>,
  ) {
    const unknown = ids.filter((id) => !isDemoId(id));
    if (unknown.length > 0) {
      return yield* new ContentError({
        message: `${source.file}: ${unknown.join(', ')} isn't a demo; the demos are ${demoIds.join(', ')} (src/kitchen-sink/demos.ts)`,
      });
    }
    if (ids.length > 1) {
      return yield* new ContentError({
        message: `${source.file}: a page runs one demo, and this one has ${String(ids.length)}`,
      });
    }
    const [id] = ids;
    return id !== undefined && isDemoId(id) ? id : undefined;
  });

  const renderDoc = Effect.fn('renderDoc')(function* (source: Source) {
    const result = yield* renderMarkdown(source.markdown, {
      basePath,
      inlineApp: options.inlineApp,
      samplesDir,
      slug: source.slug,
      contentPath: options.contentPath,
      sourceUrl: options.sourceUrl,
      twoslashCache,
    }).pipe(
      Effect.mapError(
        (error) =>
          new ContentError({
            cause: error,
            message: `${source.file}: ${error.message}`,
          }),
      ),
    );
    const demo = yield* demoOf(source, result.demos);
    const page: Rendered = {
      anchors: result.anchors,
      doc: {
        demo,
        description: source.frontmatter.description,
        experiment: source.frontmatter.experiment,
        headings: result.headings,
        html: result.html,
        label: source.frontmatter.label,
        lastModified: yield* lastModified(
          source.file,
          options.datesSkipRenames,
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
    const result = yield* renderMarkdown(expanded.markdown, {
      basePath,
      samplesDir,
      slug: 'index',
      contentPath: options.contentPath,
      sourceUrl: options.sourceUrl,
      twoslashCache,
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
    const result = yield* renderMarkdown(markdown, {
      basePath,
      inlineApp: options.inlineApp,
      samplesDir,
      slug: 'index',
      contentPath: options.contentPath,
      sourceUrl: options.sourceUrl,
      twoslashCache,
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

  const intro = ['# tRPC', '', `> ${options.summary}`, ''];

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
      .replaceAll(/^```demo\n[\s\S]*?^```$/gm, () => {
        // `renderDoc` checked the fence: it's the page's one demo.
        const demo =
          page.doc.demo === undefined ? undefined : demos[page.doc.demo];
        return demo
          ? `The web page runs this demo, editable, beside the text: [${demo.title}](${options.sourceUrl}/www/samples/${demo.sample}/src).`
          : '';
      })
      .replaceAll(/\]\(([^)\s]+)\)/g, (link, url: string) => {
        const resolved = resolveLink(source.slug, url, options.contentPath);
        if (resolved.kind === 'doc') {
          return `](${options.siteUrl}${basePath}/${resolved.link.slug}.md${resolved.link.hash ? `#${resolved.link.hash}` : ''})`;
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
  function llmsTxt(sections: ReadonlyArray<DocSection>) {
    const lines = [
      ...intro,
      'Every page is also markdown: add `.md` to its URL, or request it with `Accept: text/markdown`.',
      '',
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
        lines.push(
          `${'  '.repeat(depth(doc.slug))}- [${stripInlineCode(doc.title)}](${options.siteUrl}${basePath}/${doc.slug}.md): ${doc.experiment === undefined ? '' : 'Experimental. '}${stripInlineCode(doc.description)}`,
        );
      }
      lines.push('');
    }
    lines.push(
      '## Optional',
      '',
      `- [Full documentation](${options.siteUrl}/llms-full.txt): every page above in one file`,
      '',
    );
    return lines.join('\n');
  }

  /**
   * Files for agents, by URL path: `llms.txt`, `llms-full.txt`, each page's
   * markdown at `<basePath>/<slug>.md`, `/index.md` (the home page's markdown,
   * the same as `llms.txt`) and `/404.md`. An experiment's page is in them
   * like any other, marked experimental.
   */
  async function agentFiles() {
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
    const files = new Map<string, string>();
    files.set('/llms.txt', llmsTxt(sections));
    files.set('/index.md', llmsTxt(sections));
    files.set(
      '/404.md',
      `# Not found\n\nThere is no page at this URL. [llms.txt](${options.siteUrl}/llms.txt) lists every page.\n`,
    );
    files.set(
      '/llms-full.txt',
      [
        ...intro,
        ...pages.map(
          (entry) =>
            `---\n\nSource: ${options.siteUrl}${basePath}/${entry.source.slug}\n\n${pageMarkdown(entry.source, entry.page)}`,
        ),
      ].join('\n'),
    );
    for (const entry of pages) {
      files.set(
        `${basePath}/${entry.source.slug}.md`,
        pageMarkdown(entry.source, entry.page),
      );
    }
    return files;
  }

  /**
   * The dev and preview servers answer agents like a static host with
   * content negotiation would: agent files at their paths, and a page's
   * markdown at the page's own URL for `Accept: text/markdown`.
   */
  function serveAgentFiles(server: { readonly middlewares: Connect.Server }) {
    if (!options.agentFiles) {
      return;
    }
    const pagePath = new RegExp(`^(?:${basePath}/[\\w/-]+)?$`);
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
      agentFiles().then((files) => {
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
    configurePreviewServer: serveAgentFiles,
    configureServer: serveAgentFiles,
    async generateBundle() {
      releaseTwoslashers();
      if (this.environment.name !== 'client') {
        return;
      }
      for (const [urlPath, source] of options.agentFiles
        ? await agentFiles()
        : []) {
        this.emitFile({ fileName: urlPath.slice(1), source, type: 'asset' });
      }
      if (twoslashCache) {
        this.environment.logger.info(
          `twoslash: ${twoslashCache.stats.hits} code blocks from the cache, ${twoslashCache.stats.misses} compiled`,
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
