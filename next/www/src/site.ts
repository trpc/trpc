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
} as const;

/** The v11 docs, copied from trpc.io as they were (`build/v11-copy.ts`). */
export const v11 = {
  /** Where the copy serves them. */
  basePath: '/v11/docs',
  /** The page trpc.io serves at `/docs`, the first in its sidebar. */
  firstDoc: 'introduction',
  /** Where the copy serves the images they show. */
  imagePath: '/v11/img',
  /** Where they're maintained. */
  url: 'https://trpc.io',
} as const;

/** Sidebar sections, in order. */
export const sections = [
  'Getting started',
  'Server',
  'Middleware',
  'Client',
  'Subscriptions',
  'OpenAPI',
  'Adapters',
  'Integrations',
  'Migrations',
] as const;
