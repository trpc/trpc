/// <reference types="vite/client" />
import {
  createRootRoute,
  HeadContent,
  Outlet,
  retainSearchParams,
  Scripts,
  useSearch,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { SiteFooter } from '~/components/site-footer.tsx';
import { SiteHeader } from '~/components/site-header.tsx';
import { themeScript } from '~/components/theme-toggle.tsx';
import { ThemeProvider } from '~/components/theme-provider.tsx';
import {
  UnpublishedBanner,
  UnpublishedCopyWarning,
} from '~/components/unpublished.tsx';
import { useRememberHomeVersion } from '~/content/docs.ts';
import { type FlagSearch, validateFlagSearch } from '~/flags.ts';
import {
  homeVersionOf,
  homeVersionScript,
  v12Attribute,
} from '~/home-version.ts';
import { indexable } from '~/seo.ts';
import { blog, site, v12 } from '~/site.ts';
import appCss from '~/styles.css?url';

export const Route = createRootRoute({
  head: () => ({
    links: [
      { href: appCss, rel: 'stylesheet' },
      // The first paint waits for the header: its buttons are pinned right,
      // so each one a slow device parses after a paint moves those before it.
      { blocking: 'render', href: '#content', rel: 'expect' },
      { href: '/favicon.ico', rel: 'icon', sizes: '16x16 32x32 48x48' },
      { href: '/favicon.svg', rel: 'icon', type: 'image/svg+xml' },
      { href: '/apple-touch-icon.png', rel: 'apple-touch-icon' },
      { href: '/llms.txt', rel: 'alternate', type: 'text/plain' },
      {
        href: '/opensearch.xml',
        rel: 'search',
        title: site.name,
        type: 'application/opensearchdescription+xml',
      },
      {
        href: blog.feeds.rss,
        rel: 'alternate',
        title: `${blog.title} (RSS)`,
        type: 'application/rss+xml',
      },
      {
        href: blog.feeds.atom,
        rel: 'alternate',
        title: `${blog.title} (Atom)`,
        type: 'application/atom+xml',
      },
      {
        href: '/sitemap.xml',
        rel: 'sitemap',
        title: 'Sitemap',
        type: 'application/xml',
      },
    ],
    meta: [
      { charSet: 'utf8' },
      { content: 'width=device-width, initial-scale=1', name: 'viewport' },
      { content: 'light dark', name: 'color-scheme' },
      {
        content: '#ffffff',
        media: '(prefers-color-scheme: light)',
        name: 'theme-color',
      },
      {
        content: '#111111',
        media: '(prefers-color-scheme: dark)',
        name: 'theme-color',
      },
      { content: site.name, name: 'application-name' },
      ...(indexable(site.url, import.meta.env.VERCEL_ENV)
        ? []
        : [{ content: 'noindex', name: 'robots' }]),
    ],
    scripts: [{ children: themeScript }, { children: homeVersionScript }],
  }),
  component: RootComponent,
  // Every navigation keeps `?flags=`, so the flags stay on page to page.
  search: { middlewares: [retainSearchParams<FlagSearch>(['flags'])] },
  shellComponent: RootDocument,
  validateSearch: validateFlagSearch,
});

function RootComponent() {
  useRememberHomeVersion();
  return <Outlet />;
}

function RootDocument(props: { readonly children: ReactNode }) {
  // `homeVersionScript` sets it again before the first paint, for the hosts
  // and remembered versions that open `/` on v12 without `?version=`.
  const homeVersion = useSearch({
    select: (search) => homeVersionOf({ version: search.version }),
    strict: false,
  });
  return (
    <html
      data-home-version={homeVersion}
      // While v12 is hidden, homeVersionScript sets it for a session that
      // has been to v12.
      {...(v12.hidden ? {} : { [v12Attribute]: '' })}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
      </head>
      <body className="flex min-h-screen flex-col antialiased">
        <ThemeProvider storageKey="trpc-docs:theme">
          <a
            className="sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
            href="#content"
          >
            Skip to content
          </a>
          <UnpublishedBanner />
          <SiteHeader />
          <div className="flex-1" id="content">
            {props.children}
          </div>
          <SiteFooter />
          <UnpublishedCopyWarning />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
