/**
 * Google Analytics, as trpc.io's Docusaurus site has it (`gtag` in
 * `www/docusaurus.config.ts` on `main`): gtag.js for the GA4 property, no
 * Tag Manager container, no consent mode, IPs as GA4 keeps them (it doesn't
 * log them), a page view for the page loaded and for each URL the router
 * goes to after, hash included. Only on trpc.io's production deployment
 * (`analyticsOn`), and gtag.js loads once the page is idle, where trpc.io
 * loads it from the `<head>` (`decisions/docs-site-analytics.md`).
 */
import type { AnyRouter } from '@tanstack/react-router';

import { indexable } from './seo.ts';
import { site } from './site.ts';
import { whenIdle } from './when-idle.ts';

/** trpc.io's GA4 property. */
export const measurementId = 'G-7KLX2VFLVR';

export type Gtag = (...args: Array<unknown>) => void;

export interface GtagWindow {
  dataLayer?: Array<unknown>;
  gtag?: Gtag;
}

/**
 * Whether the page counts: a production build of the site at trpc.io
 * (`indexable`), served at that host, not the deployment's own URLs.
 */
export function analyticsOn(
  siteUrl: string,
  vercelEnv: string,
  hostname: string,
) {
  return (
    indexable(siteUrl, vercelEnv) && hostname === new URL(siteUrl).hostname
  );
}

/**
 * Google's snippet: `gtag` queues its commands in `dataLayer` until gtag.js
 * loads and sends them. The page views are sent by hand (`pageViews`), so
 * each carries the URL and title it had, whenever gtag.js gets to it.
 */
export function installGtag(target: GtagWindow, id: string): Gtag {
  const dataLayer = (target.dataLayer ??= []);
  // gtag.js reads only `arguments` objects off `dataLayer`, not arrays.
  const gtag: Gtag = function gtag() {
    // oxlint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  };
  target.gtag = gtag;
  gtag('js', new Date());
  gtag('config', id, { send_page_view: false });
  return gtag;
}

export interface Page {
  readonly location: string;
  readonly title: string;
}

/** Sends a `page_view` for a page, unless it's the URL the last one had. */
export function pageViews(gtag: Gtag) {
  let last: string | undefined;
  return (page: Page) => {
    if (page.location === last) {
      return;
    }
    last = page.location;
    gtag('event', 'page_view', {
      page_location: page.location,
      page_title: page.title,
    });
  };
}

/**
 * From `getRouter()`, in the browser: counts the page, then each page the
 * router renders, and loads gtag.js when the page is idle.
 */
export function startAnalytics(router: AnyRouter) {
  if (
    router.isServer ||
    !analyticsOn(site.url, import.meta.env.VERCEL_ENV, location.hostname)
  ) {
    return;
  }
  const view = pageViews(installGtag(window as GtagWindow, measurementId));
  const current = () => ({ location: location.href, title: document.title });
  view(current());
  // The title is set as the page commits; a tick later, it's the new page's.
  router.subscribe('onRendered', () => setTimeout(() => view(current())));
  whenIdle(() => {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.append(script);
  });
}
