/**
 * The options the browser and the server start Sentry with, from the build's
 * environment (`build/sentry.ts`). The release isn't one: each gets it its
 * own way (`sentry-client.ts`, `server.ts`).
 */
export const sentryOptions = {
  // Every event leaves out the visitor (IP address), cookies, headers and
  // bodies. URLs keep their query: the flags and choices a page rendered.
  dataCollection: {
    cookies: false,
    httpBodies: [],
    httpHeaders: false,
    userInfo: false,
  },
  dsn: __TRPC_SENTRY_DSN__,
  environment: __TRPC_SENTRY_ENVIRONMENT__,
  // A tag on errors, an attribute on spans (which v11 streams).
  initialScope:
    __TRPC_SENTRY_BRANCH__ === ''
      ? {}
      : {
          attributes: { branch: __TRPC_SENTRY_BRANCH__ },
          tags: { branch: __TRPC_SENTRY_BRANCH__ },
        },
  tracesSampleRate: __TRPC_SENTRY_TRACES_SAMPLE_RATE__,
};
