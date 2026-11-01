export const site = {
  description:
    'End-to-end typesafe APIs for TypeScript. Write procedures on the server, call them from the client with their types, and serve them on any runtime.',
  github: 'https://github.com/trpc/trpc',
  name: 'tRPC',
  /** Where the files around the docs are browsable. */
  sourceUrl: 'https://github.com/trpc/trpc/blob/main/www',
  /** trpc.io's tagline, in its words and casing. */
  tagline: [
    'Move Fast and Break Nothing.',
    'End-to-end typesafe APIs made easy.',
  ],
  /**
   * Where the site is served. At `https://trpc.io`, search engines index it
   * (`indexable` in `seo.ts`) and its docs and blog are the originals
   * (`atTrpcIo`).
   */
  url: 'https://trpc.io',
  /** The project's account on X, for `twitter:site`. */
  x: '@trpcio',
} as const;

/**
 * trpc.io's Algolia DocSearch index, which Algolia's crawler fills from the
 * live site. The key is DocSearch's public, search-only one.
 */
export const algolia = {
  apiKey: 'ed8b3896f8e3e2b421e4c38834b915a8',
  appId: 'BTGPSR4MOE',
  indexName: 'trpc',
} as const;

/** Where the docs and blog are served. */
const trpcIo = 'https://trpc.io';

/**
 * Whether the site is trpc.io: its pages are then the canonical ones search
 * engines are pointed at.
 */
export const atTrpcIo = new URL(site.url).origin === trpcIo;

/** The paths no search engine may index, on any host. */
export const unindexedPaths: ReadonlyArray<string> = [];

/** The paths served only to whoever has a link (`build/hidden-paths.ts`). */
export const hiddenPaths: ReadonlyArray<string> = [];

/**
 * A version of the docs trpc.io serves: v11, the stable release, and the
 * unmaintained v10 and v9, each in `www/<id>/docs`.
 */
export interface CopiedVersion {
  /** Where the copy serves it: v11, the stable release, at `/docs`, as trpc.io does. */
  readonly basePath: '/docs' | `/${string}/docs`;
  /** The page trpc.io serves at `trpcPath` itself, the first in its sidebar. */
  readonly firstDoc: string;
  readonly id: 'v9' | 'v10' | 'v11';
  /** Where the copy serves the images it shows. */
  readonly imagePath: string;
  /** As trpc.io's version banner has it. */
  readonly status: 'stable' | 'unmaintained';
  /** Where trpc.io serves it: `/docs/v10`. */
  readonly trpcPath: string;
  /** Where it's maintained. */
  readonly url: string;
}

/** The v11 docs, which trpc.io serves at `/docs`, and so does the copy. */
export const v11 = {
  basePath: '/docs',
  firstDoc: 'introduction',
  id: 'v11',
  imagePath: '/v11/img',
  status: 'stable',
  trpcPath: '/docs',
  url: trpcIo,
} as const satisfies CopiedVersion;

/** The v10 docs, which trpc.io serves at `/docs/v10`. */
export const v10 = {
  basePath: '/v10/docs',
  firstDoc: 'introduction',
  id: 'v10',
  imagePath: '/v10/img',
  status: 'unmaintained',
  trpcPath: '/docs/v10',
  url: trpcIo,
} as const satisfies CopiedVersion;

/** The v9 docs, which trpc.io serves at `/docs/v9`. */
export const v9 = {
  basePath: '/v9/docs',
  firstDoc: 'introduction',
  id: 'v9',
  imagePath: '/v9/img',
  status: 'unmaintained',
  trpcPath: '/docs/v9',
  url: trpcIo,
} as const satisfies CopiedVersion;

/** Newest first, as the version switcher lists them. */
export const copiedVersions = [v11, v10, v9] as const;

/**
 * Where `llms.txt` (https://llmstxt.org) lists a version's pages, with
 * `llms-full.txt` beside it (`-full` before `.txt`): v11's at `/llms.txt`,
 * the others at `/llms-<id>.txt`, as trpc.io had them.
 */
export function llmsTxtPath(id: CopiedVersion['id']): string {
  return id === v11.id ? '/llms.txt' : `/llms-${id}.txt`;
}

/** `/llms.txt`'s `llms-full.txt`. */
export const llmsFullTxtPath = (llmsTxt: string) =>
  llmsTxt.replace(/\.txt$/, '-full.txt');

/** The blog, in `www/blog`. */
export const blog = {
  description:
    'Releases, deep dives and lessons learned from building tRPC, by the people who maintain it.',
  /** Its feeds (`build/feeds.ts`), where trpc.io has them. */
  feeds: { atom: '/blog/atom.xml', rss: '/blog/rss.xml' },
  title: 'tRPC Blog',
  /** Where trpc.io serves it. */
  url: `${trpcIo}/blog`,
} as const;
