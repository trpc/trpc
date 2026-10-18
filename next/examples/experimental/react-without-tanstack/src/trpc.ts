import { createReactClient, standardLinks } from '@trpc12/experimental-react';
import { createAtomClient } from '@trpc12/experimental-react-atom';
import { httpLink, routerType } from '@trpc12/trpc/client';
import { createSerializer } from '@trpc12/trpc/serializer';
import type { AppRouter } from '../server.ts';

export function createClients(url: string) {
  const serializer = createSerializer();
  return {
    // Suspense and use(); cache features are query links.
    trpc: createReactClient({
      router: routerType<AppRouter>(),
      links: [...standardLinks(), httpLink({ url, serializer })],
    }),
    // Effect Atom: each query is an atom of its AsyncResult.
    atoms: createAtomClient({
      router: routerType<AppRouter>(),
      links: [httpLink({ url, serializer })],
    }),
  };
}
export type Clients = ReturnType<typeof createClients>;

/** What a route loader would do: start the page's requests before rendering. */
export const loadPage = (clients: Clients) => ({
  posts: clients.trpc.post.list.query(),
});
export type PageData = ReturnType<typeof loadPage>;
