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
  url: 'https://v12.trpc.io',
  /** The project's account on X, for `twitter:site`. */
  x: '@trpcio',
} as const;

/**
 * The v12 docs, rendered from `next/docs`. v11 is the stable release, so it
 * has `/docs` while v12 is experimental.
 */
export const v12 = { basePath: '/v12/docs' } as const;

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
  url: 'https://trpc.io',
} as const satisfies CopiedVersion;

/** The v10 docs, which trpc.io serves at `/docs/v10`. */
export const v10 = {
  basePath: '/v10/docs',
  firstDoc: 'introduction',
  id: 'v10',
  imagePath: '/v10/img',
  status: 'unmaintained',
  trpcPath: '/docs/v10',
  url: 'https://trpc.io',
} as const satisfies CopiedVersion;

/** The v9 docs, which trpc.io serves at `/docs/v9`. */
export const v9 = {
  basePath: '/v9/docs',
  firstDoc: 'introduction',
  id: 'v9',
  imagePath: '/v9/img',
  status: 'unmaintained',
  trpcPath: '/docs/v9',
  url: 'https://trpc.io',
} as const satisfies CopiedVersion;

/** Newest first, as the version switcher lists them. */
export const copiedVersions = [v11, v10, v9] as const;

/** trpc.io's blog, copied as it was (`build/old-docs-copy.ts`). */
export const blog = {
  description:
    'Releases, deep dives and lessons learned from building tRPC, by the people who maintain it.',
  /** Its feeds (`build/feeds.ts`), where trpc.io has them. */
  feeds: { atom: '/blog/atom.xml', rss: '/blog/rss.xml' },
  title: 'tRPC Blog',
  /** Where trpc.io serves it. */
  url: 'https://trpc.io/blog',
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
  'Migrations',
] as const;
