import { scheduleTask } from '@effect/atom-react';
import { createIsomorphicFn } from '@tanstack/react-start';
import { createAtomClient } from '@trpc12/experimental-react-atom';
import { httpLink, localLink, routerType, sse } from '@trpc12/trpc/client';
import { createSerializer } from '@trpc12/trpc/serializer';
import { AtomRegistry } from 'effect/reactivity';
import { type AppRouter, appRouter } from './server/router.ts';

const serializer = createSerializer();

// A server render calls the router in process; the browser calls /api/trpc.
const sendLink = createIsomorphicFn()
  .server(() => localLink({ router: appRouter, serializer }))
  .client(() =>
    httpLink({ url: '/api/trpc', serializer, subscriptions: sse() }),
  );

/** The atoms and the registry that holds their values: one per request on the server, one per tab in the browser. */
export function makeAtoms() {
  return {
    trpc: createAtomClient({
      router: routerType<AppRouter>(),
      links: [sendLink()],
    }),
    // In the browser, @effect/atom-react's defaults: an idle TTL keeps a
    // hydrated value from a component's first read until it subscribes, so
    // it isn't dropped and fetched again. The server mounts what it loads
    // instead, since idle timers would hold the process open.
    registry: AtomRegistry.make(
      import.meta.env.SSR ? {} : { scheduleTask, defaultIdleTTL: 400 },
    ),
  };
}
export type Atoms = ReturnType<typeof makeAtoms>;

/** The page's list; the same call returns the same atom. */
export const postList = (trpc: Atoms['trpc']) =>
  trpc.post.list.query(undefined, { reactivityKeys: ['posts'] });
