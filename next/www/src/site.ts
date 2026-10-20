export const site = {
  description:
    'End-to-end typesafe APIs for TypeScript. Write procedures on the server, call them from the client with their types, and serve them on any runtime.',
  github: 'https://github.com/trpc/trpc',
  name: 'tRPC',
  /** Where the files around the docs are browsable. */
  sourceUrl: 'https://github.com/trpc/trpc/blob/v12/next',
  /** trpc.io's tagline, in its words and casing. */
  tagline: [
    'Move Fast and Break Nothing.',
    'End-to-end typesafe APIs made easy.',
  ],
  /**
   * Where the site is served: the switch to flip at the cutover. Once it's
   * `https://trpc.io`, search engines index it (`indexable` in `seo.ts`),
   * the copies of trpc.io's docs and blog are the originals (`atTrpcIo`),
   * and v12 is hidden (`v12.hidden`).
   */
  url: 'https://trpc.io',
  /** The project's account on X, for `twitter:site`. */
  x: '@trpcio',
} as const;

/** Where trpc.io's docs and blog, which the site copies, are served. */
const trpcIo = 'https://trpc.io';

/**
 * Whether the site is trpc.io: its copies of trpc.io's pages are then the
 * pages themselves, which search engines are pointed at.
 */
export const atTrpcIo = new URL(site.url).origin === trpcIo;

/**
 * The v12 docs, rendered from `www/docs`. v11 is the stable release, so it
 * has `/docs` while v12 is experimental.
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
 * The design decisions in `.agent-docs/`, rendered for browsing: the open
 * questions (`open/`) and the records (`decisions/`). Hidden: nothing on the
 * site links here, and it's `noindex` and out of `robots.txt`'s crawl, the
 * sitemap, `llms.txt` and search, whatever host serves it
 * (`build/hidden-paths.ts` checks the build).
 */
export const decisions = { basePath: '/v12/decisions' } as const;

/** The paths served only to whoever has a link (`build/hidden-paths.ts`). */
export const hiddenPaths: ReadonlyArray<string> = [
  decisions.basePath,
  ...(v12.hidden ? [v12.basePath] : []),
];

/**
 * trpc.io's own site (the `www` Vercel project, built from `main`), for
 * what the site has no copy of: v11's API reference, under `/docs/typedoc`
 * (`onTrpcIo` in `build/old-routes.ts`). trpc.io until the cutover; then
 * the host that project keeps: its production URL on Vercel, which says
 * `noindex`, unless it gets a domain of its own. The build fails on
 * `undefined` or the site's own URL, which would 404 those URLs or redirect
 * them to themselves.
 */
export const oldSite: { readonly url: string | undefined } = {
  url: atTrpcIo ? 'https://www-trpc.vercel.app' : trpcIo,
};

/**
 * A version of the docs trpc.io serves, copied as it was
 * (`build/old-docs-copy.ts`).
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

/** trpc.io's blog, copied as it was (`build/old-docs-copy.ts`). */
export const blog = {
  description:
    'Releases, deep dives and lessons learned from building tRPC, by the people who maintain it.',
  /** Its feeds (`build/feeds.ts`), where trpc.io has them. */
  feeds: { atom: '/blog/atom.xml', rss: '/blog/rss.xml' },
  title: 'tRPC Blog',
  /** Where trpc.io serves it. */
  url: `${trpcIo}/blog`,
} as const;

/** Sidebar sections, in order. */
export const sections = [
  'Getting started',
  'Server',
  'Middleware',
  'Client',
  'Subscriptions',
  'Contracts and OpenAPI',
  'Adapters',
  'Integrations',
  'Kitchen sink',
  'Migrations',
] as const;
