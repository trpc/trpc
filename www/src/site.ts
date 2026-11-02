export const site = {
  description:
    'End-to-end typesafe APIs for TypeScript. Write procedures on the server, call them from the client with their types, and serve them on any runtime.',
  github: 'https://github.com/trpc/trpc',
  name: 'tRPC',
  /** Where the repository's files are browsable, on the branch this site is built from. */
  sourceUrl: 'https://github.com/trpc/trpc/blob/v12',
  /** trpc.io's tagline, in its words and casing. */
  tagline: [
    'Move Fast and Break Nothing.',
    'End-to-end typesafe APIs made easy.',
  ],
  /**
   * Where the site is served: the switch to flip at the cutover. At
   * `https://trpc.io`, search engines index it (`indexable` in `seo.ts`), its
   * docs and blog are the originals (`atTrpcIo`), and v12 is hidden
   * (`v12.hidden`). `main` builds trpc.io; `v12` builds v12.trpc.io.
   */
  url: 'https://v12.trpc.io',
  /**
   * trpc.io's redirect to the Discord invite, as trpc.io's navbar linked it:
   * absolute, so prerendering doesn't crawl it as a page.
   */
  discord: 'https://trpc.io/discord',
  /** The project's account on X, for `twitter:site`. */
  x: '@trpcio',
  xUrl: 'https://x.com/trpcio',
} as const;

/** Where the docs and blog are served. */
const trpcIo = 'https://trpc.io';

/**
 * Whether the site is trpc.io: its pages are then the canonical ones search
 * engines are pointed at.
 */
export const atTrpcIo = new URL(site.url).origin === trpcIo;

/**
 * The v12 docs, in `www/v12/docs`. v11 is the stable release, so it has
 * `/docs` while v12 is experimental.
 */
export const v12 = {
  basePath: '/v12/docs',
  /** Where the header's GitHub links go while the reader browses v12. */
  github: 'https://github.com/trpc/trpc/tree/v12',
  /**
   * Whether v12's docs are served only to whoever has a link: nothing
   * outside them links there (the home page, the header, the version
   * switcher and banner), they're `noindex, nofollow`, and out of
   * `robots.txt`'s crawl, the sitemap, `llms.txt` and the feeds
   * (`hiddenPaths`, checked by `build/hidden-paths.ts`). On trpc.io until
   * v12 is released: make it `false` then. v12.trpc.io offers v12.
   */
  hidden: atTrpcIo,
} as const;

/**
 * The design decisions in `next/.agent-docs/`, rendered for browsing: the
 * open questions (`open/`) and the records (`decisions/`). Hidden: nothing on
 * the site links here, and it's `noindex` and out of `robots.txt`'s crawl,
 * the sitemap, `llms.txt` and search, whatever host serves it
 * (`build/hidden-paths.ts` checks the build).
 */
export const decisions = { basePath: '/v12/decisions' } as const;

/**
 * Whether search engines may index anything under `/v12` (v12's docs and
 * the decisions pages), on every host: trpc.io and v12.trpc.io alike.
 * `false` until v12's first npm release; flip it then, with `v12.hidden`.
 * Until then, every response under `/v12` says `X-Robots-Tag: noindex`,
 * every page there has a `noindex` robots meta tag, and none is in the
 * sitemap, whether v12 is hidden or not (`unindexedPathProblems` in
 * `build/hidden-paths.ts` fails the build otherwise). `site.test.ts` fails
 * if it flips while `@trpc12/trpc` is private, so not on npm.
 */
// oxlint-disable-next-line typescript/no-inferrable-types -- as `false`, TypeScript calls the code for `true` unreachable.
export const v12Indexable: boolean = false;

/** The paths no search engine may index, on any host (`v12Indexable`). */
export const unindexedPaths: ReadonlyArray<string> = v12Indexable
  ? []
  : ['/v12'];

/** The paths served only to whoever has a link (`build/hidden-paths.ts`). */
export const hiddenPaths: ReadonlyArray<string> = [
  decisions.basePath,
  ...(v12.hidden ? [v12.basePath] : []),
];

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
 * order. On phones they're in the menu. `wide`: only from `lg`, as from `md`
 * the header has no room for it and the sidebar links it.
 */
export const docsLinks = [
  { label: 'Docs', slug: v11.firstDoc },
  { label: 'Quickstart', slug: 'quickstart' },
  {
    label: 'Awesome tRPC Collection',
    slug: 'community/awesome-trpc',
    wide: true,
  },
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
 * `llms-full.txt` beside it (`-full` before `.txt`). The site's own is
 * v12's, or v11's while v12 is hidden, as on trpc.io; hidden, v12's is
 * under its docs. The others are at `/llms-<id>.txt`, as trpc.io has v10's.
 */
export function llmsTxtPath(id: 'v12' | CopiedVersion['id']): string {
  const root: typeof id = v12.hidden ? v11.id : 'v12';
  if (id === root) {
    return '/llms.txt';
  }
  return id === 'v12' ? `${v12.basePath}/llms.txt` : `/llms-${id}.txt`;
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
