/**
 * The docs' experiments: features whose pages ship turned off. A page joins
 * one with `experiment: <id>` in its frontmatter; it's served at its URL but
 * out of the sidebar, search, pagination, the sitemap and `llms.txt`, and
 * `noindex`, until the reader turns its experiment on (`?flags=<id>`, the
 * Experiments menu, or visiting one of its pages). Pure, so the build reads
 * it too.
 */
export const experiments = {
  contracts: {
    description:
      'Contract-first routers, OpenAPI documents and REST routes, NestJS controllers and client-side validation.',
    label: 'Contracts and OpenAPI',
  },
  publisher: {
    description:
      'Typed publish/subscribe as an Effect service, and backends on Redis and Postgres.',
    label: 'Publisher',
  },
  middleware: {
    description: 'Rate limits, locks and durable calls as middleware.',
    label: 'Rate limits, locks and durable calls',
  },
  cloudflare: {
    description:
      'Workers and Durable Objects: hibernating WebSockets, publishers, durable calls and locks.',
    label: 'Cloudflare',
  },
  adapters: {
    description: 'Message ports, Firebase callable functions and raw sockets.',
    label: 'More adapters',
  },
  'tanstack-query-frameworks': {
    description:
      'TanStack Query for Preact, Vue, Solid, Svelte, Angular and Lit.',
    label: 'TanStack Query beyond React',
  },
  'tanstack-db': {
    description: "A TanStack DB collection over a procedure's queryOptions().",
    label: 'TanStack DB',
  },
  'experimental-react': {
    description:
      'Render-as-you-fetch with use() and Suspense, and atoms on Effect Atom.',
    label: 'React without TanStack Query',
  },
  integrations: {
    description: 'The AI SDK and Better Auth.',
    label: 'AI SDK and Better Auth',
  },
} as const satisfies Record<
  string,
  { readonly description: string; readonly label: string }
>;

export type ExperimentId = keyof typeof experiments;

export const experimentIds = Object.keys(
  experiments,
) as ReadonlyArray<ExperimentId>;
