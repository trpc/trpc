import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, type RouterHistory } from '@tanstack/react-router';

import { roomRoute } from './room.tsx';
import { indexRoute, rootRoute } from './routes.tsx';
import { createTrpc } from './trpc.ts';

const routeTree = rootRoute.addChildren([indexRoute, roomRoute]);

/**
 * The app, as the kitchen sink starts it in each browser: a fresh query
 * client and router, signed in as the browser's user. Reload calls this
 * again.
 */
export function getRouter(env: {
  readonly fetch: typeof globalThis.fetch;
  readonly history: RouterHistory;
  readonly user?: string | undefined;
}) {
  const queryClient = new QueryClient();
  const user = env.user ?? 'guest';
  return createRouter({
    routeTree,
    context: { ...createTrpc({ fetch: env.fetch, user }), queryClient, user },
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
