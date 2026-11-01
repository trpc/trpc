/**
 * The docs' experiments: features whose pages ship turned off. A page joins
 * one with `experiment: <id>` in its frontmatter; it's served at its URL and
 * found by the site's search and listed in `llms.txt`, but `noindex` and out
 * of the sitemap, and out of the sidebar and pagination until the reader
 * turns its experiment on (`?flags=<id>`, the Experiments menu, or visiting
 * one of its pages). Pure, so the build reads it too.
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
    description:
      "TanStack DB collections over a procedure's `queryOptions()`, and real-time ones synced by a subscription.",
    label: 'TanStack DB',
  },
  'experimental-react': {
    description:
      'Render-as-you-fetch with `use()` and Suspense, and atoms on Effect Atom.',
    label: 'React without TanStack Query',
  },
  integrations: {
    description: 'The AI SDK and Better Auth.',
    label: 'AI SDK and Better Auth',
  },
  mcp: {
    description:
      'Procedures as Model Context Protocol tools that agents call, with `experimental_createMcpHandler`.',
    label: 'MCP',
  },
  'byte-streams': {
    description:
      'Procedure inputs that are the request body, a `ReadableStream<Uint8Array>` read as an Effect Stream.',
    label: 'Byte stream inputs',
  },
  'kitchen-sink': {
    description:
      'Small apps to edit and run on the page, beside how they work: a react-hook-form form first.',
    label: 'Kitchen sink',
  },
  'codemod-playground': {
    description:
      'The v11 to v12 codemod on the page: edit v11 code and watch `@trpc12/upgrade` rewrite it.',
    label: 'Try the codemod',
  },
  benchmarks: {
    description:
      'Throughput, type-checking and bundle size against tRPC v11 and oRPC v2, and the features each has.',
    label: 'Benchmarks and comparison',
  },
} as const satisfies Record<
  string,
  { readonly description: string; readonly label: string }
>;

export type ExperimentId = keyof typeof experiments;

export const experimentIds = Object.keys(
  experiments,
) as ReadonlyArray<ExperimentId>;
