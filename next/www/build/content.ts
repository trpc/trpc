import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Path, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { removeTwoslashNotations } from 'twoslash/fallback';
import type { Connect, Plugin } from 'vite';
import { parse as parseYaml } from 'yaml';

import type { Doc, DocMeta, DocSection, Sample } from '../src/content/types.ts';
import { stripCollapseMarkers } from './collapse.ts';
import { ContentError, messageOf } from './content-error.ts';
import { type DocLink, renderMarkdown, resolveLink } from './markdown.ts';
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

export interface ContentOptions extends ContentDirs {
  /** Sidebar sections, in order. Every page's `section` must be one of them. */
  readonly sections: ReadonlyArray<string>;
  /** Absolute site URL, for `llms.txt` and the markdown pages. */
  readonly siteUrl: string;
  /** Where the files around `contentDir` are browsable, for links to them. */
  readonly sourceUrl: string;
  /** What the project is, one line, for `llms.txt`. */
  readonly summary: string;
  /** Keeps compiled code blocks on disk, so the next build reuses them. */
  readonly twoslashCache?: TwoslashCacheOptions | undefined;
}

/** The `Accept` header agents send to get markdown instead of HTML. */
const acceptsMarkdown = /\btext\/markdown\b/;

const Frontmatter = Schema.Struct({
  description: Schema.String,
  order: Schema.Number,
  section: Schema.String,
  title: Schema.String,
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

const manifestId = 'virtual:docs-manifest';
const resolvedManifestId = `\0${manifestId}`;

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

/** When `file` last changed in git, if it's committed. */
const lastModified = Effect.fn('lastModified')(
  function* (file: string) {
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const date = yield* spawner.string(
      ChildProcess.make('git', ['log', '-1', '--format=%cI', '--', file], {
        cwd: path.dirname(file),
        stderr: 'ignore',
      }),
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

/** Page paths for prerendering and the sitemap. */
export const docPages = Effect.fn('docPages')(function* (dirs: ContentDirs) {
  return yield* Effect.forEach(
    yield* readSources(dirs),
    (source) =>
      Effect.map(lastModified(source.file), (date) => ({
        lastModified: date,
        path: `/docs/${source.slug}`,
      })),
    { concurrency: 'unbounded' },
  );
});

/** Runs a build step from one of Vite's hooks. */
function run<A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) {
  return Effect.runPromise(Effect.provide(effect, NodeServices.layer));
}

/** Links to a page or a heading that doesn't exist, as one message per link. */
export function brokenLinks(
  pages: ReadonlyArray<{
    readonly doc: DocMeta;
    readonly links: ReadonlyArray<DocLink>;
  }>,
) {
  const bySlug = new Map(pages.map((page) => [page.doc.slug, page.doc]));
  return pages.flatMap((page) =>
    page.links.flatMap((link) => {
      const target = bySlug.get(link.slug);
      if (!target) {
        return [
          `${page.doc.slug}: links to ${link.slug}.md, which isn't a page`,
        ];
      }
      if (
        link.hash !== undefined &&
        !target.headings.some((heading) => heading.id === link.hash)
      ) {
        return [
          `${page.doc.slug}: links to ${link.slug}.md#${link.hash}, which has no such heading`,
        ];
      }
      return [];
    }),
  );
}

/**
 * Compiles the docs' `.md` pages at build time. Each page imports as a module
 * of pre-highlighted HTML (its own chunk, so the browser loads only the pages
 * it visits), and `virtual:docs-manifest` lists every page for the nav,
 * search and SEO. The client build also gets `llms.txt` and each page's
 * markdown at `/docs/<slug>.md`.
 *
 * The build fails on a page without valid frontmatter, a code block that
 * doesn't compile, and a link to a page or heading that doesn't exist.
 */
export function docsContent(options: ContentOptions): Plugin {
  const samplesDir = options.samplesDir;
  const twoslashCache =
    options.twoslashCache && makeTwoslashCache(options.twoslashCache);
  const rendered = new Map<string, Promise<Rendered>>();

  const renderDoc = Effect.fn('renderDoc')(function* (source: Source) {
    const result = yield* renderMarkdown(source.markdown, {
      samplesDir,
      slug: source.slug,
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
    const page: Rendered = {
      doc: {
        description: source.frontmatter.description,
        headings: result.headings,
        html: result.html,
        lastModified: yield* lastModified(source.file),
        section: source.frontmatter.section,
        slug: source.slug,
        title: source.frontmatter.title,
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
      samplesDir,
      slug: 'index',
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
    return options.sections.map((title) => ({
      docs: pages
        .filter((entry) => entry.page.doc.section === title)
        .toSorted(
          (a, b) =>
            a.order - b.order || a.page.doc.slug.localeCompare(b.page.doc.slug),
        )
        .map((entry): DocMeta => {
          const doc = entry.page.doc;
          return {
            description: doc.description,
            headings: doc.headings,
            lastModified: doc.lastModified,
            section: doc.section,
            slug: doc.slug,
            title: doc.title,
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
      .replaceAll(/\]\(([^)\s]+)\)/g, (link, url: string) => {
        const resolved = resolveLink(source.slug, url);
        if (resolved.kind === 'doc') {
          return `](${options.siteUrl}/docs/${resolved.link.slug}.md${resolved.link.hash ? `#${resolved.link.hash}` : ''})`;
        }
        if (resolved.kind === 'source') {
          return `](${options.sourceUrl}/${resolved.path})`;
        }
        return link;
      });
    return [
      `# ${source.frontmatter.title}`,
      '',
      `> ${source.frontmatter.description}`,
      '',
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
      for (const doc of section.docs) {
        lines.push(
          `- [${doc.title}](${options.siteUrl}/docs/${doc.slug}.md): ${doc.description}`,
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
   * markdown at `/docs/<slug>.md`, `/index.md` (the home page's markdown,
   * the same as `llms.txt`) and `/404.md`.
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
            `---\n\nSource: ${options.siteUrl}/docs/${entry.source.slug}\n\n${pageMarkdown(entry.source, entry.page)}`,
        ),
      ].join('\n'),
    );
    for (const entry of pages) {
      files.set(
        `/docs/${entry.source.slug}.md`,
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
    server.middlewares.use((request, response, next) => {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      const wantsMarkdown = acceptsMarkdown.test(request.headers.accept ?? '');
      const filePath =
        wantsMarkdown && /^\/(?:docs\/[\w/-]+)?$/.test(pathname)
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
      if (this.environment.name !== 'client') {
        return;
      }
      for (const [urlPath, source] of await agentFiles()) {
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
    name: 'trpc-docs:content',
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
