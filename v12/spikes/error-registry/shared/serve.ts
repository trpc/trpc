/** A handler over one router, and a link whose `fetch` goes to it. Tests only. */
import { httpLink } from '@trpc12/trpc/client';
import { createFetchHandler, type AnyRouter } from '@trpc12/trpc/server';

export function serve(router: AnyRouter) {
  const handler = createFetchHandler({
    router,
    createContext: (opts) => ({
      user: opts.request.headers['authorization'] ?? null,
    }),
  });
  const requests: Array<{ status: number; body: unknown }> = [];
  const link = httpLink({
    url: 'http://localhost/trpc',
    fetch: async (url, init) => {
      const res = await handler.fetch(new Request(url, init));
      requests.push({ status: res.status, body: await res.clone().json() });
      return res;
    },
  });
  return { handler, link, requests };
}
