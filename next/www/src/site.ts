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
