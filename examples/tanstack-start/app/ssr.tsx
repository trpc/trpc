import { getRouterManifest } from '@tanstack/start/router-manifest';
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/start/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { eventHandler, toWebRequest } from 'vinxi/http';
import { createRouter } from './router';
import { trpcRouter } from './trpc/router';

const tssHandler = createStartHandler({
  createRouter,
  getRouterManifest,
})(defaultStreamHandler);

export default eventHandler(async (event) => {
  if (event.path.startsWith('/api/trpc')) {
    // TODO: Split this out to a separate vinxi router once TSR has a way to configure vinxi / have api routes
    return fetchRequestHandler({
      req: toWebRequest(event),
      router: trpcRouter,
      endpoint: '/api/trpc',
    });
  }

  return tssHandler(event);
});
