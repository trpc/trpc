import { createFileRoute } from '@tanstack/react-router';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { hasSlowQueries } from './-settings.ts';
import { appRouter } from './-server/router.ts';
import { endpoint } from './-trpc.ts';

const handle = (opts: { readonly request: Request }) =>
  fetchRequestHandler({
    // Queries come as POST, so the Network tab shows their inputs as JSON.
    allowMethodOverride: true,
    createContext: () => ({ slowQueries: hasSlowQueries(opts.request) }),
    endpoint,
    // Lets a query in a batch read its input from an earlier query's data.
    experimental_allowPipelining: true,
    req: opts.request,
    responseMeta: () => ({ headers: { 'cache-control': 'no-store' } }),
    router: appRouter,
  });

/** The showcase's tRPC endpoint, which the browser calls. */
export const Route = createFileRoute('/kitchen-sink/blog/api/$')({
  server: { handlers: { GET: handle, POST: handle } },
});
