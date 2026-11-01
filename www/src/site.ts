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
  /**
   * trpc.io's redirect to the Discord invite, as trpc.io's navbar linked it:
   * absolute, so prerendering doesn't crawl it as a page.
   */
  discord: 'https://trpc.io/discord',
  /** The project's account on X, for `twitter:site`. */
  x: '@trpcio',
  xUrl: 'https://x.com/trpcio',
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

/**
 * Each docs version's `docsearch:version`, as Docusaurus named them: the
 * index's `version` facet, which search filters on.
 */
export const docsearchVersions = {
  v9: '9.x',
  v10: '10.x',
  v11: 'current',
} as const satisfies Record<CopiedVersion['id'], string>;

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
  /** Where trpc.io serves it, and so does the site: `/docs`, `/docs/v10`. */
  readonly basePath: '/docs' | `/docs/${string}`;
  /** The page trpc.io serves at `basePath` itself, the first in its sidebar. */
  readonly firstDoc: string;
  readonly id: 'v9' | 'v10' | 'v11';
  /** Where the copy serves the images it shows. */
  readonly imagePath: string;
  /** As trpc.io's version banner has it. */
  readonly status: 'stable' | 'unmaintained';
  /** Where it's maintained. */
  readonly url: string;
}

/** The v11 docs, which trpc.io serves at `/docs`. */
export const v11 = {
  basePath: '/docs',
  firstDoc: 'introduction',
  id: 'v11',
  imagePath: '/v11/img',
  status: 'stable',
  url: trpcIo,
} as const satisfies CopiedVersion;

/** The v10 docs, which trpc.io serves at `/docs/v10`. */
export const v10 = {
  basePath: '/docs/v10',
  firstDoc: 'introduction',
  id: 'v10',
  imagePath: '/v10/img',
  status: 'unmaintained',
  url: trpcIo,
} as const satisfies CopiedVersion;

/** The v9 docs, which trpc.io serves at `/docs/v9`. */
export const v9 = {
  basePath: '/docs/v9',
  firstDoc: 'introduction',
  id: 'v9',
  imagePath: '/v9/img',
  status: 'unmaintained',
  url: trpcIo,
} as const satisfies CopiedVersion;

/**
 * A page's path: `/docs/v10/server/routers`, and a version's first page at
 * the version's own path (`/docs/v10`), as trpc.io serves it.
 */
export const docPath = (
  version: Pick<CopiedVersion, 'basePath' | 'firstDoc'>,
  slug: string,
) =>
  slug === version.firstDoc ? version.basePath : `${version.basePath}/${slug}`;

/**
 * The top bar's links to v11 pages, by slug: trpc.io's navbar's, in its
 * order. On phones they're in the menu.
 */
export const docsLinks = [
  { label: 'Docs', slug: v11.firstDoc },
  { label: 'Quickstart', slug: 'quickstart' },
  { label: 'Awesome tRPC Collection', slug: 'community/awesome-trpc' },
  { label: 'Using Next.js', slug: 'client/nextjs' },
] as const;

/** Newest first, as the version switcher lists them. */
export const copiedVersions = [v11, v10, v9] as const;

/**
 * The versions, the longest `basePath` first: the one a path is under is
 * the first it starts with, so `/docs/v10/x` isn't read as v11's `v10/x`.
 */
export const versionsByPath = copiedVersions.toSorted(
  (a, b) => b.basePath.length - a.basePath.length,
);

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
