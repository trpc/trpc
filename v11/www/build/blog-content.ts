import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Path, Schema } from 'effect';
import type { Plugin } from 'vite';
import { parse as parseYaml } from 'yaml';

import type { Post, PostMeta } from '../src/content/types.ts';
import { ContentError, messageOf } from './content-error.ts';
import { renderMarkdown } from './markdown.ts';

export interface BlogOptions {
  /** Directory of the posts' `.md` files, as an absolute path. */
  readonly contentDir: string;
  /** The module that lists the posts: `virtual:blog-manifest`. */
  readonly manifestId: string;
  /** The sample app the posts' Twoslash blocks compile in: `v11`. */
  readonly inlineApp?: string | undefined;
  /** Directory of the sample apps the posts' Twoslash blocks compile in. */
  readonly samplesDir: string;
  /** Where the files around `contentDir` are browsable, for links to them. */
  readonly sourceUrl: string;
}

const Frontmatter = Schema.Struct({
  authors: Schema.Array(
    Schema.Struct({
      image: Schema.optional(Schema.String),
      name: Schema.String,
      title: Schema.optional(Schema.String),
      url: Schema.optional(Schema.String),
    }),
  ),
  date: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
  description: Schema.String,
  discussion: Schema.optional(Schema.Number),
  title: Schema.String,
});

interface Source {
  readonly file: string;
  readonly frontmatter: typeof Frontmatter.Type;
  readonly markdown: string;
  readonly slug: string;
}

/** As trpc.io's blog counts it: 200 words a minute, code included. */
export function readingMinutes(markdown: string) {
  const words = markdown.split(/\s+/).filter((word) => word !== '').length;
  return Math.max(1, Math.round(words / 200));
}

const parseSource = Effect.fn('parseSource')(function* (
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
    Effect.flatMap(Schema.decodeUnknownEffect(Frontmatter)),
    Effect.mapError(
      (cause) =>
        new ContentError({
          cause,
          message: `${file}: invalid frontmatter: ${messageOf(cause)}`,
        }),
    ),
  );
  const source: Source = {
    file,
    frontmatter,
    markdown: raw.slice(match[0].length),
    slug: path.basename(file, '.md'),
  };
  return source;
});

/** Every post: `*.md` in the content dir, except its `README.md`, newest first. */
const readSources = Effect.fn('readSources')(function* (contentDir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const names = yield* fs.glob('*.md', { root: contentDir });
  const sources = yield* Effect.forEach(
    names.filter((name) => name !== 'README.md'),
    (name) => {
      const file = path.join(contentDir, name);
      return Effect.flatMap(fs.readFileString(file), (raw) =>
        parseSource(file, raw),
      );
    },
    { concurrency: 'unbounded' },
  );
  return sources.toSorted(
    (a, b) =>
      b.frontmatter.date.localeCompare(a.frontmatter.date) ||
      a.slug.localeCompare(b.slug),
  );
});

function metaOf(source: Source): PostMeta {
  return {
    authors: source.frontmatter.authors,
    date: source.frontmatter.date,
    description: source.frontmatter.description,
    discussion: source.frontmatter.discussion,
    readingMinutes: readingMinutes(source.markdown),
    slug: source.slug,
    title: source.frontmatter.title,
  };
}

/** The posts, newest first, for prerendering and their social cards. */
export const blogPosts = Effect.fn('blogPosts')(function* (contentDir: string) {
  return (yield* readSources(contentDir)).map(metaOf);
});

function run<A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) {
  return Effect.runPromise(Effect.provide(effect, NodeServices.layer));
}

/**
 * Compiles the blog's posts (`blog/*.md`) at build time, as `content.ts`
 * does the docs: each post imports as a module of pre-highlighted HTML, and
 * the manifest module (`virtual:blog-manifest`) lists every post, newest
 * first. A post links pages by their paths, which prerendering's crawl
 * checks; the build fails on a relative `.md` link, which would be a page
 * of the docs it isn't among.
 */
export function blogContent(options: BlogOptions): Plugin {
  const resolvedManifestId = `\0${options.manifestId}`;
  const rendered = new Map<string, Promise<Post>>();
  let manifest: Promise<ReadonlyArray<PostMeta>> | undefined;

  const renderPost = Effect.fn('renderPost')(function* (source: Source) {
    const result = yield* renderMarkdown(source.markdown, {
      basePath: '/blog',
      inlineApp: options.inlineApp,
      samplesDir: options.samplesDir,
      slug: source.slug,
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
    const link = result.links[0];
    if (link) {
      return yield* new ContentError({
        message: `${source.file}: links to ${link.slug}.md, which isn't a post; link a page by its path`,
      });
    }
    const post: Post = {
      ...metaOf(source),
      headings: result.headings,
      html: result.html,
    };
    return post;
  });

  function render(source: Source) {
    const cached = rendered.get(source.file);
    if (cached) {
      return cached;
    }
    const post = run(renderPost(source));
    rendered.set(source.file, post);
    return post;
  }

  return {
    hotUpdate(context) {
      if (!context.file.startsWith(options.contentDir)) {
        return undefined;
      }
      rendered.delete(context.file);
      manifest = undefined;
      const module =
        this.environment.moduleGraph.getModuleById(resolvedManifestId);
      if (!module) {
        return undefined;
      }
      this.environment.moduleGraph.invalidateModule(module);
      return [...context.modules, module];
    },
    async load(id) {
      if (id !== resolvedManifestId) {
        return undefined;
      }
      manifest ??= run(blogPosts(options.contentDir));
      return `export const posts = ${JSON.stringify(await manifest)};`;
    },
    name: `trpc-docs:blog:${options.manifestId}`,
    resolveId(id) {
      return id === options.manifestId ? resolvedManifestId : undefined;
    },
    // One plugin instance across client/SSR, so each post renders once.
    sharedDuringBuild: true,
    async transform(code, id) {
      const file = id.split('?')[0] ?? id;
      if (!file.startsWith(options.contentDir) || !file.endsWith('.md')) {
        return undefined;
      }
      const source = await run(parseSource(file, code));
      if (this.environment.mode === 'dev') {
        rendered.delete(file);
      }
      const post = await render(source);
      return { code: `export default ${JSON.stringify(post)};`, map: null };
    },
  };
}
