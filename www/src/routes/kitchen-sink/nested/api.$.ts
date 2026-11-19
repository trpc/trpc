import { createFileRoute } from '@tanstack/react-router';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { appRouter } from './-server/router.ts';
import { endpoint } from './-trpc.ts';

const handle = (opts: { readonly request: Request }) =>
  fetchRequestHandler({
    // The page sends its queries as a POST, with the calls the server makes in
    // the body.
    allowMethodOverride: true,
    createContext: () => ({}),
    endpoint,
    // Queries that read other queries' data come in one request: the server
    // fills in their inputs.
    experimental_allowPipelining: true,
    req: opts.request,
    responseMeta: () => ({ headers: { 'cache-control': 'no-store' } }),
    router: appRouter,
  });

/** The showcase's tRPC endpoint, which the browser calls. */
export const Route = createFileRoute('/kitchen-sink/nested/api/$')({
  server: { handlers: { GET: handle, POST: handle } },
});
