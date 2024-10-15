import { QueryClient } from '@tanstack/react-query';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routerWithQueryClient } from '@tanstack/react-router-with-query';
import { unstable_httpBatchStreamLink } from '@trpc/client';
import { createServerSideHelpers } from '@trpc/react-query/server';
import superjson from 'superjson';
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary';
import { NotFound } from './components/NotFound';
import { routeTree } from './routeTree.gen';
import { trpc } from './trpc/react';

// NOTE: Most of the integration code found here is experimental and will
// definitely end up in a more streamlined API in the future. This is just
// to show what's possible with the current APIs.

function getUrl() {
  const base = (() => {
    if (typeof window !== 'undefined') return '';
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return `http://localhost:${process.env.PORT ?? 3000}`;
  })();
  return base + '/api/trpc';
}

export function createRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      dehydrate: { serializeData: superjson.serialize },
      hydrate: { deserializeData: superjson.deserialize },
    },
  });

  const trpcClient = trpc.createClient({
    links: [
      unstable_httpBatchStreamLink({
        transformer: superjson,
        url: getUrl(),
      }),
    ],
  });

  const serverHelpers = createServerSideHelpers({ client: trpcClient });

  const router = createTanStackRouter({
    context: { queryClient, trpc: serverHelpers },
    routeTree,
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    Wrap: (props) => {
      return (
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          {props.children}
        </trpc.Provider>
      );
    },
  });

  return routerWithQueryClient(router, queryClient);
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
