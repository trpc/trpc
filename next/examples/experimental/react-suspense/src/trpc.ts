import { createIsomorphicFn } from '@tanstack/react-start';
import { createReactClient, standardLinks } from '@trpc12/experimental-react';
import { httpLink, localLink, routerType } from '@trpc12/trpc/client';
import { experimental_createTransformer } from '@trpc12/trpc/transformer';
import { type AppRouter, appRouter } from './server/router.ts';

const transformer = experimental_createTransformer();

// A server render calls the router in process; the browser calls /api/trpc.
const sendLink = createIsomorphicFn()
  .server(() => localLink({ router: appRouter, transformer }))
  .client(() => httpLink({ url: '/api/trpc', transformer }));

/** One per request on the server, one per tab in the browser. */
export const makeTrpc = () =>
  createReactClient({
    router: routerType<AppRouter>(),
    links: [...standardLinks({ staleTime: 5_000 }), sendLink()],
  });
export type Trpc = ReturnType<typeof makeTrpc>;
