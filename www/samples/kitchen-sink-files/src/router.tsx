import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, type RouterHistory } from '@tanstack/react-router';

import { rootRoute } from './profile.tsx';
import { createTrpc } from './trpc.ts';

/**
 * The app, as the kitchen sink starts it: a fresh query client and router
 * per session. Reload calls this again.
 */
export function getRouter(env: {
  readonly fetch: typeof globalThis.fetch;
  readonly history: RouterHistory;
}) {
  const queryClient = new QueryClient();
  return createRouter({
    routeTree: rootRoute,
    context: { ...createTrpc(env.fetch), queryClient },
    history: env.history,
    Wrap: (props) => (
      <QueryClientProvider client={queryClient}>
        {props.children}
      </QueryClientProvider>
    ),
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
