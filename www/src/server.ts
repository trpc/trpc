/**
 * TanStack Start's own server entry, reporting to Sentry: in the `_ssr`
 * function (`build/on-demand.ts`), which renders the pages whose query the
 * prerender can't. The prerender renders every other page with this server
 * too, in the build, where an error fails the build instead.
 */
import {
  captureConsoleIntegration,
  captureException,
  init,
  wrapFetchWithSentry,
} from '@sentry/tanstackstart-react';
import handler, { createServerEntry } from '@tanstack/react-start/server-entry';

import { sentryOptions } from './sentry-config.ts';

const reporting =
  Boolean(sentryOptions.dsn) && process.env['TSS_PRERENDERING'] !== 'true';

if (reporting) {
  init({
    ...sentryOptions,
    // React's render errors only reach `console.error`
    // (`renderRouterToStream`).
    integrations: [captureConsoleIntegration({ levels: ['error'] })],
    release: __TRPC_SENTRY_RELEASE__ || undefined,
  });
}

const fetch: typeof handler.fetch = async (...args) => {
  try {
    return await handler.fetch(...args);
  } catch (error) {
    captureException(error, {
      mechanism: { handled: false, type: 'auto.http.tanstackstart' },
    });
    throw error;
  }
};

export default createServerEntry(
  reporting ? wrapFetchWithSentry({ fetch }) : handler,
);
