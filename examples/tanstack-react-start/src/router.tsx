import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary';
import { NotFound } from './components/NotFound';
import { routeTree } from './routeTree.gen';
import { makeTRPCClient, TRPCProvider } from './trpc/client';
import type { AppRouter } from './trpc/router/_app';
import { transformer } from './trpc/transformer';

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      dehydrate: {
        serializeData: transformer.serialize,
      },
      hydrate: {
        deserializeData: transformer.deserialize,
      },
    },
  });

  const trpcClient = makeTRPCClient();

  const trpc = createTRPCOptionsProxy<AppRouter>({
    client: trpcClient,
    queryClient: queryClient,
  });

  const router = createRouter({
    routeTree,
    context: { queryClient, trpcClient, trpc },
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    Wrap: ({ children }) => (
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    ),
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  });

  return router;
}
