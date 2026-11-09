import { createRouter } from '@tanstack/react-router';
import { dehydrate, hydrate } from '@trpc12/experimental-react';
import { routeTree } from './routeTree.gen.ts';
import { makeTrpc } from './trpc.ts';

export function getRouter() {
  const trpc = makeTrpc();
  return createRouter({
    routeTree,
    context: { trpc },
    defaultPreload: 'intent',
    scrollRestoration: true,
    // The server's settled queries travel with the HTML, so the browser
    // renders them without a request.
    dehydrate: () => ({ trpc: dehydrate(trpc) }),
    hydrate: (state) => hydrate(trpc, state.trpc),
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
