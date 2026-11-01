/**
 * Sentry's browser SDK, in its own chunk, which `sentry-client.ts` loads
 * once the page is idle or at its first error.
 */
import {
  captureException,
  captureReactException,
  init,
  tanstackRouterBrowserTracingIntegration,
} from '@sentry/tanstackstart-react';
import type { AnyRouter } from '@tanstack/react-router';

import type { Capture, ErrorSource } from './sentry-client.ts';
import { sentryOptions } from './sentry-config.ts';

const mechanisms: Record<
  ErrorSource,
  { readonly handled: boolean; readonly type: string }
> = {
  caught: { handled: true, type: 'auto.function.react.error_handler' },
  onerror: { handled: false, type: 'auto.browser.global_handlers.onerror' },
  onunhandledrejection: {
    handled: false,
    type: 'auto.browser.global_handlers.onunhandledrejection',
  },
  recoverable: { handled: true, type: 'auto.function.react.recoverable' },
  uncaught: { handled: false, type: 'auto.function.react.error_handler' },
};

export function startSentry(
  release: string | undefined,
  router: AnyRouter | undefined,
): Capture {
  init({
    ...sentryOptions,
    release,
    // The site's own scripts' errors, not browser extensions'.
    allowUrls: [window.location.origin],
    integrations: (defaults) => [
      // No session per page load: Sentry hears from a visitor only for an
      // error or a sampled trace.
      ...defaults.filter(
        (integration) => integration.name !== 'BrowserSession',
      ),
      ...(router ? [tanstackRouterBrowserTracingIntegration(router)] : []),
    ],
  });
  return (reported) => {
    const mechanism = mechanisms[reported.source];
    if (reported.componentStack === undefined) {
      captureException(reported.error, { mechanism });
    } else {
      captureReactException(
        reported.error,
        { componentStack: reported.componentStack },
        { mechanism },
      );
    }
  };
}
