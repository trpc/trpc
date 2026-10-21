import { createRouter } from '@tanstack/react-router';
import { Hydration } from 'effect/reactivity';
import { routeTree } from './routeTree.gen.ts';
import { makeAtoms } from './trpc.ts';

export function getRouter() {
  const atoms = makeAtoms();
  return createRouter({
    routeTree,
    context: { atoms },
    defaultPreload: 'intent',
    scrollRestoration: true,
    // The server's settled query atoms travel with the HTML, encoded with the
    // links' transformer, so the browser renders them without a request.
    dehydrate: () => ({ atoms: Hydration.dehydrate(atoms.registry) }),
    hydrate: (state) => Hydration.hydrate(atoms.registry, state.atoms),
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
