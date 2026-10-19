import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, type RouterHistory } from '@tanstack/react-router';

import { editProfileRoute } from './edit-profile.tsx';
import { profileRoute, rootRoute } from './routes.tsx';
import { createTrpc } from './trpc.ts';

const routeTree = rootRoute.addChildren([profileRoute, editProfileRoute]);

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
    routeTree,
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
