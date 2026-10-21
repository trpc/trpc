import { Layer } from 'effect';
import { createFetchHandler } from '@trpc12/trpc/server';
import { transformer } from '../src/transformer.ts';
import { directoryRouter } from './directory.ts';
import { trackerRouter } from './tracker.ts';

export const tracker = createFetchHandler({
  router: trackerRouter,
  batch: true,
  transformer,
});

export const directory = createFetchHandler({
  router: directoryRouter,
  endpoint: '/directory/trpc',
  batch: true,
  transformer,
});

/** Both APIs as `HttpRouter` routes, to merge with the static files. */
export const apiRoutes = Layer.mergeAll(tracker.routes, directory.routes);
