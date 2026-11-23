/**
 * Sentry in the browser, with its SDK out of the entry: errors wait in a
 * queue until `sentry-browser.ts` loads, once the page is idle or at the
 * first error (`decisions/docs-site-sentry.md`). Without a DSN this does
 * nothing.
 */
import { type AnyRouter, isNotFound, isRedirect } from '@tanstack/react-router';
import type { HydrationOptions } from 'react-dom/client';

import { whenIdle } from './when-idle.ts';

export type ErrorSource =
  | 'caught'
  | 'onerror'
  | 'onunhandledrejection'
  | 'recoverable'
  | 'uncaught';

export interface Reported {
  readonly componentStack?: string | undefined;
  readonly error: unknown;
  readonly source: ErrorSource;
}

export type Capture = (reported: Reported) => void;

/**
 * Passes reports to the capture `load` resolves to, and queues them until it
 * has. `load` runs once, on `start` or at the first report; if it fails (an
 * ad blocker), the queue and later reports are dropped.
 */
export function lazyCapture(load: () => Promise<Capture>) {
  let capture: Capture | undefined;
  let queue: Array<Reported> | undefined = [];
  let loading: Promise<void> | undefined;
  const start = () => {
    loading ??= load().then(
      (loaded) => {
        const queued = queue ?? [];
        capture = loaded;
        queue = undefined;
        queued.forEach(loaded);
      },
      () => {
        queue = undefined;
      },
    );
    return loading;
  };
  const report = (reported: Reported) => {
    if (capture) {
      capture(reported);
    } else if (queue) {
      queue.push(reported);
      void start();
    }
  };
  return { report, start };
}

let router: AnyRouter | undefined;
let release: string | undefined;

/** Hands `getRouter()`'s router to the SDK, which traces its navigations. */
export function traceRouter(next: AnyRouter) {
  if (!next.isServer) {
    router = next;
  }
}

export interface DehydratedRelease {
  readonly sentryRelease: string;
}

/**
 * For `getRouter()`'s `dehydrate` and `hydrate`, which bring the release to
 * the browser in the page: in a chunk, it would change that chunk on every
 * deploy, and rename every chunk that imports it.
 */
export const dehydrateRelease = (): DehydratedRelease => ({
  sentryRelease: import.meta.env.SSR ? __TRPC_SENTRY_RELEASE__ : '',
});

export function hydrateRelease(dehydrated: DehydratedRelease) {
  release = dehydrated.sentryRelease || undefined;
}

const onError = (event: ErrorEvent) => {
  sentry?.report({ error: event.error ?? event.message, source: 'onerror' });
};

const onRejection = (event: PromiseRejectionEvent) => {
  sentry?.report({ error: event.reason, source: 'onunhandledrejection' });
};

// Undefined where the build didn't define it: in tests.
const enabled =
  !import.meta.env.SSR &&
  typeof __TRPC_SENTRY_DSN__ === 'string' &&
  __TRPC_SENTRY_DSN__ !== '';

const sentry = enabled
  ? lazyCapture(async () => {
      const sdk = await import('./sentry-browser.ts');
      // The SDK's own handlers take over.
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      return sdk.startSentry(release, router);
    })
  : undefined;

if (sentry) {
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  // Untraced, the SDK only has to load for an error.
  if (__TRPC_SENTRY_TRACES_SAMPLE_RATE__ > 0) {
    whenIdle(() => void sentry.start());
  }
}

const fromReact =
  (source: ErrorSource) =>
  (error: unknown, info: { readonly componentStack?: string | undefined }) => {
    console.error(error);
    sentry?.report({ componentStack: info.componentStack, error, source });
  };

/**
 * `hydrateRoot`'s error hooks (`client.tsx`), which report what React
 * catches, recovers from (a hydration mismatch) or can't. TanStack Router's
 * not-found and redirects are thrown, but aren't errors. Without a DSN,
 * React's own.
 */
export const reactErrorOptions: Pick<
  HydrationOptions,
  'onCaughtError' | 'onRecoverableError' | 'onUncaughtError'
> = sentry
  ? {
      onCaughtError: (error, info) => {
        if (!isNotFound(error) && !isRedirect(error)) {
          fromReact('caught')(error, info);
        }
      },
      onRecoverableError: fromReact('recoverable'),
      onUncaughtError: fromReact('uncaught'),
    }
  : {};
